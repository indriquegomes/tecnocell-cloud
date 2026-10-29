import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { FinanceiroTabs } from './FinanceiroTabs'
import { IconWallet } from '@/components/icons'
import { formatBRL, hojeSP } from '@/lib/utils'
import { BuscaFinanceiro } from './BuscaFinanceiro'
import { Paginacao } from '@/components/Paginacao'
import { SETORES, categoriasDoSetor, SUBCATEGORIAS } from '@/lib/financeiro-setores'
import { LinhaEditable } from './LinhaEditable'
import { gerarFolha } from './actions'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { aplicarFiltros, aplicarLoja, periodoDe, querystringDoFiltro } from '@/lib/financeiro-filtros'

// A classificação vive em um lugar só (lib/financeiro-setores.ts): setor → categoria.
// O filtro em cascata e o formulário leem daqui, então não nasce categoria fora de lugar.

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; ordem?: string; dir?: string; status?: string; de?: string; ate?: string; pessoa?: string; forma?: string; conta?: string; categoria?: string; grupo?: string; tudo?: string; valor_min?: string; valor_max?: string; campo?: string; erro?: string; ok?: string; loja?: string; pagina?: string; setor?: string; subcategoria?: string; origem?: string; vence?: string; agrupar?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  // Loja ativa rege o default: financeiro mostra UMA loja por vez (contas fixas e
  // novas de cada loja são separadas). 'sem' = despesas antigas ainda sem loja.
  const { ativa, operaveis } = await lojasDoUsuario().catch(() => ({ ativa: null, operaveis: [] as { id: string; nome: string }[] }))
  const lojaEfetiva = params.loja && (params.loja === 'sem' || params.loja === 'todas' || operaveis.some((l) => l.id === params.loja)) ? params.loja : (ativa?.id ?? 'sem')

  // Campo de data pelo qual filtrar o período (Busca Avançada, igual SIGE:
  // Vencimento × Competência × Pagamento). Default vencimento.
  const camposData = ['data_vencimento', 'data_competencia', 'data_pagamento']
  const campoData = camposData.includes(params.campo ?? '') ? params.campo! : 'data_vencimento'

  // Dropdowns da busca avançada
  const [{ data: formasList }, { data: contasList }] = await Promise.all([
    supabase.from('formas_pagamento').select('nome').order('nome'),
    supabase.from('contas').select('id, nome').eq('ativa', true).order('nome'),
  ])
  const formasOpc = [...new Set((formasList ?? []).map((f) => f.nome as string))]
  const contasOpc = (contasList ?? []) as { id: string; nome: string }[]
  const categoriasOpc = [...new Set(SETORES.flatMap((s) => s.categorias))]

  // Filtro de loja e filtros completos vêm de lib/financeiro-filtros.ts, para a rota
  // de exportação usar exatamente o mesmo recorte (antes o filtro vivia aqui e o CSV
  // era montado no navegador com a lista inteira — 2 MB de HTML em cada abertura).
  const aplicaLoja = (q: unknown) => aplicarLoja(q, lojaEfetiva)
  // Filtros completos e período vêm de lib/financeiro-filtros.ts (mesma regra usada
  // pela rota de exportação — filtro duplicado é filtro que divergiu).
  const { mesIni, mesFim, verTudo } = periodoDe(params)
  const aplica = (q: unknown) => aplicarFiltros(q, params, { lojaEfetiva })
  const temFiltro = !!(params.busca || params.pessoa || params.forma || params.conta || params.categoria || params.subcategoria || params.setor || params.origem || params.vence || params.valor_min || params.valor_max || params.status || params.de || params.ate || params.tipo)

  const ordemAtual = params.ordem ?? 'data_vencimento'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { data_vencimento: 'data_vencimento', valor: 'valor', descricao: 'descricao', pessoa_nome: 'pessoa_nome', tipo: 'tipo', status: 'status' }
  const baseParams: Record<string, string> = {}
  for (const k of ['tipo', 'busca', 'status', 'de', 'ate', 'pessoa', 'forma', 'conta', 'categoria', 'subcategoria', 'setor', 'valor_min', 'valor_max', 'campo', 'loja', 'tudo', 'origem', 'vence', 'agrupar'] as const) {
    if (params[k]) baseParams[k] = params[k]!
  }
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/financeiro?${qs}`, arrow, ativo }
  }

  // A lista era cortada em 200 sem "próxima página": filtrar certo e não achar a
  // linha porque ela era a 201ª. Agora pagina de 200 em 200 e mostra o total real.
  const POR_PAGINA = 200
  const pagina = Math.max(1, Number(params.pagina) || 1)
  const listaQuery = supabase
    .from('lancamentos')
    .select('id, codigo, descricao, valor, tipo, status, data_vencimento, data_pagamento, data_competencia, forma_pagamento, pessoa_nome, categoria, subcategoria, comprovante_url', { count: 'exact' })
    .order(camposDB[ordemAtual] ?? 'data_vencimento', { ascending: !ordemDir })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
  const { data: lancamentos, count: totalLista } = await aplica(listaQuery)
  const totalRegistros = totalLista ?? 0
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / POR_PAGINA))

  type LancRow = { id: string; codigo: string | null; descricao: string | null; valor: number | null; tipo: string; status: string | null; data_vencimento: string | null; data_pagamento: string | null; data_competencia: string | null; forma_pagamento: string | null; pessoa_nome: string | null; categoria: string | null; subcategoria: string | null; comprovante_url: string | null }
  const todos = (lancamentos ?? []) as LancRow[]

  // Comprovantes ficam no bucket privado `pagamentos` — troca o caminho por URL
  // assinada (1h) pra abrir no navegador.
  const comprovanteUrl = new Map<string, string>()
  await Promise.all(todos.filter((l) => l.comprovante_url).map(async (l) => {
    const { data } = await supabase.storage.from('pagamentos').createSignedUrl(l.comprovante_url!, 3600)
    if (data?.signedUrl) comprovanteUrl.set(l.id, data.signedUrl)
  }))

  // Lancamentos com movimento de caixa ligado (quitados pelo Financeiro). Só esses
  // têm "Desfazer" seguro — PDV/OS quitam sem gravar lancamento_id.
  const { data: movsLigados } = await supabase
    .from('movimentos_caixa')
    .select('lancamento_id')
    .not('lancamento_id', 'is', null)
    .eq('tipo', 'recebimento')
    .eq('origem', 'financeiro')
  const idsDesfazer = new Set(((movsLigados ?? []) as { lancamento_id: string }[]).map((m) => m.lancamento_id))

  // ✨ Totais DO FILTRO (não só os globais): soma exatamente o que está filtrado,
  // sem o cap de 200 da lista. Isa: "quanto tenho a receber em PIX vencendo em agosto".
  const filtrados = await fetchAll<Record<string, unknown> & { valor: number | null; tipo: string; status: string | null }>(
    (from, to) => aplica(supabase.from('lancamentos')
      .select('descricao, pessoa_nome, data_vencimento, data_competencia, valor, tipo, status, forma_pagamento, categoria, subcategoria, loja_id'))
      .range(from, to)
  )
  const fReceber = filtrados.filter((l) => l.tipo === 'receber').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fPagar = filtrados.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fCount = filtrados.length
  const labelCampo: Record<string, string> = { data_vencimento: 'Vencimento', data_competencia: 'Competência', data_pagamento: 'Pagamento' }

  // AGRUPAR E TOTALIZAR — soma o filtro inteiro por categoria, loja ou pessoa, em vez
  // de listar linha por linha. É a separação que a lista não dá: quanto cada coisa
  // pesa no período. Usa o mesmo conjunto já carregado para os totais (sem consulta nova).
  const nomeDaLoja = new Map(operaveis.map((l) => [l.id, l.nome]))
  const grupos = (() => {
    const modo = params.agrupar
    if (modo !== 'categoria' && modo !== 'loja' && modo !== 'pessoa') return null
    const mapa = new Map<string, { n: number; receber: number; pagar: number }>()
    for (const l of filtrados) {
      const bruto = modo === 'categoria'
        ? ((l as { categoria?: string | null }).categoria || '(sem categoria)')
        : modo === 'pessoa'
          ? ((l as { pessoa_nome?: string | null }).pessoa_nome || '(sem nome)')
          : (nomeDaLoja.get(((l as { loja_id?: string | null }).loja_id) ?? '') ?? 'Sem loja')
      const atual = mapa.get(bruto) ?? { n: 0, receber: 0, pagar: 0 }
      atual.n += 1
      const v = Number((l as { valor?: number | null }).valor ?? 0)
      if (l.tipo === 'receber') atual.receber += v
      else atual.pagar += v
      mapa.set(bruto, atual)
    }
    return [...mapa.entries()].sort((a, b) => (b[1].receber + b[1].pagar) - (a[1].receber + a[1].pagar))
  })()
  // Cards de resumo somam TODOS os pendentes (globais), sem o cap de 200 da lista
  // nem o filtro de busca/tipo — senão os totais subcontam quando houver >200 lançamentos.
  const paraTotais = await fetchAll<{ valor: number | null; valor_pago: number | null; tipo: string; status: string | null }>(
    (from, to) => aplicaLoja(supabase.from('lancamentos').select('valor, valor_pago, tipo, status')).range(from, to)
  )
  // Só conta status 'pendente' (não 'cancelado') e soma o RESTANTE (valor - valor_pago),
  // não o valor cheio. Antes somava o cheio e incluía cancelado — o card "A Receber"
  // aparecia com ~o dobro do que é de verdade.
  const restanteDe = (l: { valor: number | null; valor_pago: number | null }) => (l.valor ?? 0) - (l.valor_pago ?? 0)
  const totalReceber = paraTotais.filter((l) => l.tipo === 'receber' && l.status === 'pendente').reduce((s, l) => s + restanteDe(l), 0)
  const totalPagar = paraTotais.filter((l) => l.tipo === 'pagar' && l.status === 'pendente').reduce((s, l) => s + restanteDe(l), 0)
  const pendentes = paraTotais.filter((l) => l.status === 'pendente').length

  // Faixa informativa da pessoa escolhida. Não filtra nada: a lista já mostra tudo.
  //
  // Antes esta faixa pegava só o lançamento de MAIOR VENCIMENTO e chamava de "último
  // pagamento" — então um salário futuro, ainda pendente, aparecia como se já tivesse
  // sido pago (foi o caso do salário de 31/10 da Isabella aparecendo em 26/10).
  // Agora são duas informações separadas: o último PAGO de verdade, e o que está em
  // aberto (se houver), cada um com seu rótulo.
  type LinhaInfo = { descricao: string | null; valor: number | null; categoria: string | null; status: string | null; forma_pagamento: string | null; data_vencimento: string | null; data_pagamento: string | null; tipo: string }
  const colunasInfo = 'descricao, valor, categoria, status, forma_pagamento, data_vencimento, data_pagamento, tipo'
  const baseInfo = () => aplicaLoja(supabase.from('lancamentos').select(colunasInfo)).ilike('pessoa_nome', `%${params.pessoa}%`)
  const [pagoRes, recenteRes] = params.pessoa
    ? await Promise.all([
        baseInfo().eq('status', 'pago').order('data_pagamento', { ascending: false, nullsFirst: false })
          .order('data_vencimento', { ascending: false }).limit(1).maybeSingle(),
        baseInfo().order('data_vencimento', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: null }, { data: null }]
  const ultimoPago = (pagoRes?.data ?? null) as LinhaInfo | null
  const maisRecente = (recenteRes?.data ?? null) as LinhaInfo | null
  const emAberto = maisRecente && maisRecente.status === 'pendente' ? maisRecente : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconWallet className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Financeiro</h2>
        <Dica texto="Contas a pagar e a receber. Digite no Buscar e escolha a categoria, o setor ou o cliente — o sistema sugere o que existe nos seus dados. Para somar em vez de listar, use + Filtros e Agrupar." />
      </div>

      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      {params.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{params.ok}</div>
      )}

      <FinanceiroTabs active={params.tipo === 'receber' ? 'receber' : params.tipo === 'pagar' ? 'pagar' : 'lancamentos'} />

      {/* Ações — criar e gerar separados do cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Novo lançamento</span>
        <Link href="/painel/financeiro/novo?tipo=receber"
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
          + A Receber
        </Link>
        <Link href="/painel/financeiro/novo?tipo=pagar"
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
          + A Pagar
        </Link>
        <div className="mx-2 hidden h-6 w-px bg-gray-200 sm:block" />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Gerar</span>
        <form action={gerarFolha} className="flex items-center gap-2">
          <input type="date" name="vencimento" defaultValue={hojeSP()}
            title="Vencimento dos salários"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="submit"
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition">
            Gerar folha de salários
          </button>
        </form>
      </div>



      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-700">A Receber (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-green-700">{formatBRL(totalReceber)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">A Pagar (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{formatBRL(totalPagar)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Pendentes</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{pendentes}</p>
        </div>
      </div>

      {/* Filtro sempre visível. Antes tudo isso ficava escondido dentro de uma caixa
          "Busca Avançada" fechada: quem abria a tela não via filtro nenhum. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <BuscaFinanceiro
          params={{ ...params, de: params.de ?? (verTudo ? '' : mesIni), ate: params.ate ?? (verTudo ? '' : mesFim) }}
          lojaEfetiva={lojaEfetiva}
          operaveis={operaveis}
          formasOpc={formasOpc}
          setores={SETORES}
          subcategorias={SUBCATEGORIAS}
          temFiltro={temFiltro}
        />
      </div>

      {/* Faixa informativa da pessoa escolhida (não é filtro) */}
      {params.pessoa && (
        <div className="space-y-1 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          {ultimoPago ? (
            <p className="text-sm text-gray-800">
              <span className="font-semibold text-gray-900">Último pagamento para {params.pessoa}:</span>{' '}
              <span className="font-bold tabular-nums">{ultimoPago.tipo === 'receber' ? '+' : '−'}{formatBRL(Number(ultimoPago.valor ?? 0))}</span>
              {' '}— {ultimoPago.descricao || 'sem descrição'}
              {ultimoPago.forma_pagamento ? ' · ' + ultimoPago.forma_pagamento : ''}
              {ultimoPago.categoria ? ' · ' + ultimoPago.categoria : ''}
              {' · pago em '}{((ultimoPago.data_pagamento ?? ultimoPago.data_vencimento) ?? '').slice(0, 10).split('-').reverse().join('/')}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Nenhum pagamento registrado para {params.pessoa}.</p>
          )}
          {emAberto && (
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Em aberto:</span>{' '}
              <span className="font-bold tabular-nums">{emAberto.tipo === 'receber' ? '+' : '−'}{formatBRL(Number(emAberto.valor ?? 0))}</span>
              {' '}— {emAberto.descricao || 'sem descrição'}
              {emAberto.categoria ? ' · ' + emAberto.categoria : ''}
              {' · vence '}{((emAberto.data_vencimento) ?? '').slice(0, 10).split('-').reverse().join('/')}
              {' (ainda não pago)'}
            </p>
          )}
        </div>
      )}

      {/* ✨ Totais do que está filtrado (não só o global) + exportar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-3 text-sm">
        <span className="font-semibold text-gray-500">Total no filtro (pago + pendente):</span>
        <span>Receber <b className="text-green-600">{formatBRL(fReceber)}</b></span>
        <span>Pagar <b className="text-red-500">{formatBRL(fPagar)}</b></span>
        <span className="text-gray-400">{fCount} lançamento(s)</span>
        <div className="ml-auto">
          <a href={`/painel/financeiro/exportar?${querystringDoFiltro(params)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            title={`Baixa em CSV exatamente o que está filtrado (${fCount} lançamento(s))`}>
            ⬇ Exportar CSV
          </a>
        </div>
      </div>

      {/* Sugestões de forma de pagamento (o campo é texto livre, mas sugere as formas do cadastro) */}
      <datalist id="formas-lista">
        {formasOpc.map((f) => <option key={f} value={f} />)}
        <option value="Pix chave" />
        <option value="Conta nº" />
        <option value="Transferência" />
      </datalist>
      {/* Sugestões de categoria (campo editável na linha) */}
      <datalist id="categorias-lista">
        {categoriasOpc.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* AGRUPADO: totais por categoria / loja / pessoa */}
      {grupos && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {params.agrupar === 'categoria' ? 'Categoria' : params.agrupar === 'loja' ? 'Loja' : 'Pessoa'}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Lançamentos</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">A receber</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">A pagar</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {grupos.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nada no filtro.</td></tr>
              ) : grupos.map(([nomeGrupo, dados]) => (
                <tr key={nomeGrupo} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{nomeGrupo}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{dados.n}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{dados.receber ? formatBRL(dados.receber) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-red-500">{dados.pagar ? formatBRL(dados.pagar) : '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatBRL(dados.receber - dados.pagar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fCount}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-green-700">{formatBRL(fReceber)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-red-600">{formatBRL(fPagar)}</td>
                <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatBRL(fReceber - fPagar)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Tabela (só quando não está agrupado) */}
      <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm ${grupos ? 'hidden' : ''}`}
        style={grupos ? { display: 'none' } : undefined}>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'descricao',      l: 'Descrição',  a: 'text-left' },
                { o: 'pessoa_nome',    l: 'Pessoa',     a: 'text-left' },
                { o: 'data_vencimento', l: 'Vencimento', a: 'text-left' },
                { o: 'forma_pagamento', l: 'Forma',      a: 'text-left' },
                { o: 'valor',          l: 'Valor',      a: 'text-right' },
                { o: 'tipo',           l: 'Tipo',       a: 'text-center' },
                { o: 'status',         l: 'Status',     a: 'text-center' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {grupos ? null : todos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nada encontrado com esse filtro.
                  <br />
                  <span className="text-xs">Tente outro período, outra loja, ou clique em <b>Limpar tudo</b>.</span>
                </td>
              </tr>
            ) : (
              todos.map((l) => (
                <LinhaEditable
                  key={l.id}
                  lanc={l}
                  comprovanteUrl={comprovanteUrl.get(l.id) ?? null}
                  idsDesfazer={idsDesfazer.has(l.id)}
                  formasOpc={formasOpc}
                  filtroBase={new URLSearchParams(baseParams).toString()}
                />
              ))
            )}
          </tbody>
        </table>
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={totalRegistros} params={baseParams} basePath="/painel/financeiro" />
      </div>
    </div>
  )
}
