import { IconPackage } from '@/components/icons'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { AtalhosPeriodo } from './AtalhosPeriodo'

// ═══════════════════════════════════════════════════════════════════
// REPOSIÇÃO — "o que preciso pedir?"
//
// Vitor descreveu a lógica de ponto de reposição: quantos vendeu num período,
// quantos tem em estoque, a média de venda por dia, projeta quanto vai vender
// ATÉ o pedido chegar (prazo do fornecedor), e sugere quanto comprar pra cobrir.
//
// A conta, por produto:
//   média/dia   = vendido no período ÷ dias do período
//   dura         = estoque atual ÷ média/dia   (quantos dias o estoque aguenta)
//   necessário   = média/dia × (prazo de entrega + dias de cobertura desejada)
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
  searchParams: Promise<{ de?: string; ate?: string; categoria?: string; deposito?: string; prazo?: string; cobertura?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()

  const hoje = hojeSP()
  const ate = params.ate || hoje
  const de = params.de || (() => { const d = new Date(ate + 'T00:00:00'); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10) })()
  const prazo = Math.max(0, parseInt(params.prazo ?? '15', 10) || 0)         // dias até o pedido chegar
  const cobertura = Math.max(1, parseInt(params.cobertura ?? '30', 10) || 30) // dias de estoque que quer ter
  const dias = diasEntre(de, ate)

  const [{ data: depositos }, { data: categorias }] = await Promise.all([
    supabase.from('depositos').select('id, nome, loja_id').order('nome'),
    supabase.from('categorias').select('hierarquia, nome').order('nome'),
  ])
  const depsBotao = (depositos ?? []).filter((d) => d.loja_id)

  // 1) VENDIDO no período, por produto (fonte: vendas do sistema)
  let vq = supabase
    .from('itens_venda')
    .select('produto_id, quantidade, venda:vendas!inner ( created_at, status, deposito_id )')
    .eq('venda.status', 'concluida')
    .gte('venda.created_at', de + 'T00:00:00')
    .lte('venda.created_at', ate + 'T23:59:59')
  if (params.deposito) vq = vq.eq('venda.deposito_id', params.deposito)
  const itens = await fetchAll<{ produto_id: string; quantidade: number }>(
    (from, to) => vq.range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number }[] | null }>,
  )
  const vendidoPorProd: Record<string, number> = {}
  for (const i of itens) vendidoPorProd[i.produto_id] = (vendidoPorProd[i.produto_id] ?? 0) + Number(i.quantidade)
  const idsVendidos = Object.keys(vendidoPorProd)

  // 2) dados dos produtos vendidos (+ filtro de categoria)
  const produtos = idsVendidos.length
    ? await fetchAll<{ id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }>(
        (from, to) => {
          let q = supabase.from('produtos').select('id, nome, codigo, categoria, cat:categorias!categoria ( nome )').in('id', idsVendidos)
          if (params.categoria) q = q.eq('categoria', params.categoria)
          return q.range(from, to) as unknown as PromiseLike<{ data: { id: string; nome: string; codigo: string | null; categoria: string | null; cat: { nome: string } | null }[] | null }>
        },
      )
    : []

  // 3) estoque atual desses produtos (no depósito filtrado, ou soma de todos)
  const estoquePorProd: Record<string, number> = {}
  if (produtos.length) {
    const ids = produtos.map((p) => p.id)
    const est = await fetchAll<{ produto_id: string; quantidade: number; deposito_id: string }>(
      (from, to) => supabase.from('estoque').select('produto_id, quantidade, deposito_id').in('produto_id', ids).range(from, to) as unknown as PromiseLike<{ data: { produto_id: string; quantidade: number; deposito_id: string }[] | null }>,
    )
    for (const e of est) {
      if (params.deposito && e.deposito_id !== params.deposito) continue
      estoquePorProd[e.produto_id] = (estoquePorProd[e.produto_id] ?? 0) + Number(e.quantidade)
    }
  }

  // 4) cálculo de reposição por produto
  const linhas = produtos.map((p) => {
    const vendido = vendidoPorProd[p.id] ?? 0
    const estoque = estoquePorProd[p.id] ?? 0
    const mediaDia = vendido / dias
    const dura = mediaDia > 0 ? estoque / mediaDia : Infinity
    const necessario = mediaDia * (prazo + cobertura)
    const sugestao = Math.max(0, Math.ceil(necessario - estoque))
    const urgente = mediaDia > 0 && dura < prazo
    return { ...p, vendido, estoque, mediaDia, dura, sugestao, urgente }
  }).sort((a, b) => b.sugestao - a.sugestao || b.vendido - a.vendido)

  const precisaPedir = linhas.filter((l) => l.sugestao > 0)
  const totalSugerido = precisaPedir.reduce((s, l) => s + l.sugestao, 0)
  const urgentes = linhas.filter((l) => l.urgente).length

  const fmtDias = (d: number) => d === Infinity ? '∞' : d < 1 ? '<1d' : Math.round(d) + 'd'
  const baseQS = (extra: Record<string, string>) => {
    const q = new URLSearchParams()
    q.set('de', de); q.set('ate', ate); q.set('prazo', String(prazo)); q.set('cobertura', String(cobertura))
    if (params.categoria) q.set('categoria', params.categoria)
    if (params.deposito) q.set('deposito', params.deposito)
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
        <div className="flex gap-2">
          <a href={`/painel/estoque/reposicao/exportar?${baseQS({})}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
            </svg>
            Baixar Excel
          </a>
          <Link href="/painel/estoque" className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
            ← Estoque
          </Link>
        </div>
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
            <label className="mb-1 block text-xs font-medium text-gray-500">Fornecedor entrega em (dias)</label>
            <input type="number" name="prazo" min="0" defaultValue={prazo} className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Quero cobrir (dias)</label>
            <input type="number" name="cobertura" min="1" defaultValue={cobertura} className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">Calcular</button>
        </div>
        {/* Atalhos de período — preenchem as datas (client) */}
        <AtalhosPeriodo />
        <p className="text-xs text-gray-400">
          Base: <b>{dias} dias</b> de venda · o pedido cobre <b>{prazo} dias</b> de entrega + <b>{cobertura} dias</b> de estoque.
        </p>
      </form>

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
            ) : (
              linhas.map((l) => (
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
                      l.urgente ? 'bg-red-100 text-red-700' : l.dura < prazo + cobertura ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
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
