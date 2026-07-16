import { IconPackage } from '@/components/icons'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { AtalhosPeriodo } from './AtalhosPeriodo'
import { getDepositosCache, getCategoriasCache } from '@/lib/cache-catalogo'

// ═══════════════════════════════════════════════════════════════════
// REPOSIÇÃO — "o que preciso pedir?"
//
// Vitor descreveu a lógica de ponto de reposição: quantos vendeu num período,
// quantos tem em estoque, a média de venda por dia, projeta quanto vai vender
// e sugere quanto comprar pra manter X dias de estoque de cada produto.
//
// A conta, por produto:
//   média/dia   = vendido no período ÷ dias do período
//   dura         = estoque atual ÷ média/dia   (quantos dias o estoque aguenta)
//   necessário   = média/dia × (dias de estoque desejados)
//   SUGESTÃO     = necessário − estoque atual   (nunca negativo)
//   urgente?     = o estoque acaba ANTES do pedido chegar (dura < prazo)
//
// Genérico: serve pra ferramenta, película, bateria — qualquer categoria.
// Fonte hoje: as vendas do próprio sistema (itens_venda). Ao importar o histórico
// do SIGE, a base fica mais robusta sem mudar nada aqui.
// ═══════════════════════════════════════════════════════════════════

const diasEntre = (de: string, ate: string) => {
  const d = new Date(de + 'T00:00:00'), a = new Date(ate + 'T00:00:00')
  return Math.max(1, Math.round((a.getTime() - d.getTime()) / 86_400_000) + 1)
}

export default async function ReposicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; categoria?: string; deposito?: string; cobrir?: string; tudo?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const ate = params.ate || hoje
  const de = params.de || (() => { const d = new Date(ate + 'T00:00:00'); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10) })()
  // UM campo só (Vitor tirou o "prazo" + "cobrir" e juntou): quantos dias de estoque quer ter.
  const cobrir = Math.max(1, parseInt(params.cobrir ?? '30', 10) || 30)
  // prazo de reposição FIXO (interno) só pra o alerta 🔥: se o estoque dura menos que
  // o tempo típico de um pedido chegar, é urgente. Não é campo — é constante.
  // 12 dias: prazo real que o Vitor mediu do pedido chegar (16/07).
  const PRAZO_REPOSICAO = 12
  const dias = diasEntre(de, ate)

  const [depositos, categorias] = await Promise.all([getDepositosCache(), getCategoriasCache()])
  const depsBotao = depositos.filter((d) => d.loja_id)

  // ── VENDIDO no período + ESTOQUE atual, tudo em PARALELO ──
  // Fonte de venda = vendas do sistema (itens_venda) + histórico do SIGE (90d importados).
  // O histórico só entra na visão "Todos os depósitos" (é a demanda TOTAL; o SIGE não
  // separa por depósito). Estoque e produtos vêm por fetch-all paginado (poucos round-trips
  // e sem risco de estourar o limite de URL do PostgREST com milhares de ids num .in()).
  let vq = supabase
    .from('itens_venda')
    .select('produto_id, quantidade, venda:vendas!inner ( created_at, status, deposito_id )')
    .eq('venda.status', 'concluida')
    .gte('venda.created_at', de + 'T00:00:00')
    .lte('venda.created_at', ate + 'T23:59:59')
  if (params.deposito) vq = vq.eq('venda.deposito_id', params.deposito)

  const [itens, hist, produtosAll, estoqueAll] = await Promise.all([
    fetchAll<{ produto_id: string; quantidade: number }>(
      (from, to) => vq.range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
    ),
    params.deposito
      ? Promise.resolve([] as { produto_id: string; quantidade: number }[])
      : fetchAll<{ produto_id: string; quantidade: number }>(
          (from, to) => supabase.from('historico_itens_venda').select('produto_id, quantidade').gte('data', de).lte('data', ate).range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
        ),
    fetchAll<{ id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }>(
      (from, to) => {
        let q = supabase.from('produtos').select('id, nome, codigo, categoria, cat:categorias!categoria ( nome )')
        if (params.categoria) q = q.eq('categoria', params.categoria)
        return q.range(from, to) as unknown as PromiseLike<{ data: { id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }[] | null }>
      },
    ),
    fetchAll<{ produto_id: string; quantidade: number; deposito_id: string }>(
      (from, to) => {
        let q = supabase.from('estoque').select('produto_id, quantidade, deposito_id')
        if (params.deposito) q = q.eq('deposito_id', params.deposito)
        return q.range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number; deposito_id: string }[] | null }>
      },
    ),
  ])

  const vendidoPorProd: Record<string, number> = {}
  for (const i of itens) vendidoPorProd[i.produto_id] = (vendidoPorProd[i.produto_id] ?? 0) + Number(i.quantidade)
  for (const h of hist) vendidoPorProd[h.produto_id] = (vendidoPorProd[h.produto_id] ?? 0) + Number(h.quantidade)

  // só os produtos que venderam no período (e que passaram no filtro de categoria)
  const produtos = produtosAll.filter((p) => vendidoPorProd[p.id] !== undefined)

  const estoquePorProd: Record<string, number> = {}
  for (const e of estoqueAll) estoquePorProd[e.produto_id] = (estoquePorProd[e.produto_id] ?? 0) + Number(e.quantidade)

  // 4) cálculo de reposição por produto
  const linhas = produtos.map((p) => {
    const vendido = vendidoPorProd[p.id] ?? 0
    const estoque = estoquePorProd[p.id] ?? 0
    const mediaDia = vendido / dias
    const dura = mediaDia > 0 ? estoque / mediaDia : Infinity
    const necessario = mediaDia * cobrir            // quero ter 'cobrir' dias de estoque
    const sugestao = Math.max(0, Math.ceil(necessario - estoque))
    const urgente = mediaDia > 0 && dura < PRAZO_REPOSICAO
    return { ...p, vendido, estoque, mediaDia, dura, sugestao, urgente }
  }).sort((a, b) => b.sugestao - a.sugestao || b.vendido - a.vendido)

  const precisaPedir = linhas.filter((l) => l.sugestao > 0)
  const totalSugerido = precisaPedir.reduce((s, l) => s + l.sugestao, 0)
  const urgentes = linhas.filter((l) => l.urgente).length
  // Tela = o PEDIDO: por padrão só o que precisa pedir (a estoquista quer isso).
  // "Ver todos" mostra também os que estão abastecidos. O Excel sempre traz tudo.
  const verTudo = params.tudo === '1'
  const linhasMostradas = verTudo ? linhas : precisaPedir
  const semNecessidade = linhas.length - precisaPedir.length

  const fmtDias = (d: number) => d === Infinity ? '∞' : d < 1 ? '<1d' : Math.round(d) + 'd'
  const baseQS = (extra: Record<string, string>) => {
    const q = new URLSearchParams()
    q.set('de', de); q.set('ate', ate); q.set('cobrir', String(cobrir))
    if (params.categoria) q.set('categoria', params.categoria)
    if (params.deposito) q.set('deposito', params.deposito)
    if (verTudo) q.set('tudo', '1')
    for (const [k, v] of Object.entries(extra)) v ? q.set(k, v) : q.delete(k)
    return q.toString()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Reposição</h2>
          <Dica texto="Baseado no que vendeu no período, sugere quanto pedir pra não faltar até o fornecedor entregar." />
        </div>
        <a href={`/painel/estoque/reposicao/exportar?${baseQS({})}`}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          Baixar Excel
        </a>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Produtos pra pedir</p>
          <p className="text-3xl font-bold text-blue-600 tabular-nums">{precisaPedir.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm text-center">
          <p className="text-sm text-gray-500">Unidades sugeridas</p>
          <p className="text-3xl font-bold text-gray-800 tabular-nums">{totalSugerido}</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-sm text-center ${urgentes > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-sm text-gray-500">🔥 Acaba antes de chegar</p>
          <p className={`text-3xl font-bold tabular-nums ${urgentes > 0 ? 'text-red-600' : 'text-gray-400'}`}>{urgentes}</p>
        </div>
      </div>

      {/* Depósitos como abas (mesmo padrão do Estoque) */}
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: '', nome: 'Todos os depósitos' }, ...depsBotao].map((d) => {
          const ativo = (params.deposito ?? '') === d.id
          return (
            <Link key={d.id || 'todos'} href={`/painel/estoque/reposicao?${baseQS({ deposito: d.id })}`}
              className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                ativo ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              {d.nome}
            </Link>
          )
        })}
      </div>

      {/* Controles */}
      <form method="GET" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        {params.deposito && <input type="hidden" name="deposito" value={params.deposito} />}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Vendas de</label>
            <input type="date" name="de" defaultValue={de} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">até</label>
            <input type="date" name="ate" defaultValue={ate} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Categoria</label>
            <select name="categoria" defaultValue={params.categoria ?? ''} className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todas</option>
              {(categorias ?? []).map((c) => <option key={c.hierarquia} value={c.hierarquia}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Quero estoque pra (dias)</label>
            <input type="number" name="cobrir" min="1" defaultValue={cobrir} className="w-36 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Calcular</button>
        </div>
        {/* Atalhos de período — preenchem as datas (client) */}
        <AtalhosPeriodo />
        <p className="text-xs text-gray-400">
          Base: <b>{dias} dias</b> de venda · quero ter <b>{cobrir} dias</b> de estoque de cada produto.
        </p>
      </form>

      {/* Cabeçalho da lista + alternar "só o pedido" / "ver todos" */}
      {linhas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 -mb-2">
          <p className="text-sm text-gray-500">
            {verTudo
              ? <>Mostrando <b>todos os {linhas.length}</b> produtos vendidos no período.</>
              : <>Mostrando os <b>{precisaPedir.length}</b> que precisam de pedido.{semNecessidade > 0 && <span className="text-gray-400"> {semNecessidade} já abastecidos ocultos.</span>}</>}
          </p>
          {semNecessidade > 0 && (
            <Link href={`/painel/estoque/reposicao?${baseQS(verTudo ? { tudo: '' } : { tudo: '1' })}`}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              {verTudo ? '← Só o que preciso pedir' : `Ver todos (${linhas.length}) →`}
            </Link>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendeu</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Média/dia</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Dura</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {linhas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                Nenhuma venda no período. Ajuste as datas ou espere as vendas entrarem.
              </td></tr>
            ) : linhasMostradas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                🎉 Nada a pedir — todo o estoque cobre o período desejado.
              </td></tr>
            ) : (
              linhasMostradas.map((l) => (
                <tr key={l.id} className={`hover:bg-blue-50/60 transition ${l.urgente ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800">{l.nome}</p>
                    <p className="text-xs text-gray-400">{l.codigo ? '#' + l.codigo + ' · ' : ''}{l.cat?.nome ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600 tabular-nums">{l.vendido}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500 tabular-nums">{l.mediaDia.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${l.estoque <= 0 ? 'text-red-600' : 'text-gray-800'}`}>{l.estoque}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      l.urgente ? 'bg-red-100 text-red-700' : l.dura < cobrir ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {l.urgente && '🔥'} {fmtDias(l.dura)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {l.sugestao > 0
                      ? <span className="inline-block rounded-lg bg-blue-600 px-2.5 py-1 text-sm font-bold text-white tabular-nums">{l.sugestao}</span>
                      : <span className="text-sm text-gray-300">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
