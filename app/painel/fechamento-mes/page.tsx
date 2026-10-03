import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { FecharMesButton } from './FecharMesButton'
import { estoqueCustoPorLoja } from '@/lib/estoque-custo'

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[m - 1]}/${ano}`
}

const norm = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

const CAT_ESTOQUE: [string, string][] = [
  ['frontal', 'Frontal'], ['bateria', 'Bateria'], ['acessorios', 'Acessórios (consignado)'],
  ['parte_traseira', 'Parte Traseira'], ['ferramentas', 'Ferramentas'], ['peliculas', 'Películas'],
  ['celular', 'Celular'], ['outros', 'Outros (componentes/touch/LCD/capa)'],
]
const CAIXA_DET: [string, string][] = [
  ['caderno', 'Dinheiro caderno'], ['pagbank', 'Pagbank'], ['caixa_dia', 'Caixa do dia'], ['envelopes', 'Envelopes'],
]

type Abertura = {
  caixa?: Record<string, number>
  caixa_detalhado?: Record<string, Record<string, number>>
  estoque?: Record<string, number>
  estoque_categorias?: Record<string, Record<string, number>>
  consignado?: Record<string, number>
  perdas?: Record<string, number>
  trocas?: { pendentes?: Record<string, number>; indo?: Record<string, number> }
}

export default async function FechamentoMesPage({ searchParams }: { searchParams: Promise<{ mes?: string; loja?: string }> }) {
  const params = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const pedido = params.mes ?? hoje.slice(0, 7)
  const mes = /^\d{4}-\d{2}$/.test(pedido) ? pedido : hoje.slice(0, 7)
  const lojaPedida = params.loja ?? ''
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const mesSeguinte = proxMes.slice(0, 7)

  const supabase = await createServiceClient()

  const [{ data: lojas }, deps, cxs, perfis, aberturaRow, fechadoRow, anteriorRow] = await Promise.all([
    supabase.from('lojas').select('id, nome').order('nome'),
    fetchAll<any>((from, to) => supabase.from('depositos').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('caixas').select('id, loja_id').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, lojas_permitidas').range(from, to)),
    supabase.from('configuracoes').select('valor').eq('chave', `abertura:${mes}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mes}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mesAnterior}`).maybeSingle(),
  ])

  const lojasList = (lojas ?? []) as { id: string; nome: string }[]
  const petropolisId = lojasList.find((l) => l.nome === 'Petrópolis')?.id ?? null
  const lojaDeDeposito = new Map((deps ?? []).map((d) => [d.id, d.loja_id as string | null]))
  const lojaDeCaixa = new Map((cxs ?? []).map((c) => [c.id, c.loja_id as string | null]))
  const perfisPorNome = new Map<string, string[]>()
  for (const p of (perfis ?? [])) {
    if (!p.nome) continue
    perfisPorNome.set(norm(p.nome), (p.lojas_permitidas ?? []).filter(Boolean) as string[])
  }
  const lojaDePessoa = (nome: string): string | null => {
    const n = norm(nome)
    let ls = perfisPorNome.get(n)
    if (!ls) {
      const chave = n.split(' ').slice(0, 2).join(' ')
      for (const [pnome, l] of perfisPorNome) if (pnome.includes(chave)) { ls = l; break }
    }
    if (!ls || ls.length === 0) return null
    return ls.length === 1 ? ls[0] : null
  }

  const aberturaValor = aberturaRow?.data ? (aberturaRow.data.valor as Abertura) : null
  const fechamento = fechadoRow?.data ? (fechadoRow.data.valor as { fechado_em: string }) : null
  const fechamentoAnterior = anteriorRow?.data
    ? (anteriorRow.data.valor as { estoque_final?: Record<string, { vitrine: number; fundo: number }> })
    : null

  // Estoque a custo AGORA (vitrine/fundo por loja) — o "final" deste mês.
  // Inicial = congelado no fechamento do mês anterior (mesma régua de preco_custo).
  const estoqueFinalPorLoja = await estoqueCustoPorLoja(supabase).catch(() => ({} as Record<string, { vitrine: number; fundo: number }>))
  const estoqueInicialPorLoja = fechamentoAnterior?.estoque_final ?? {}

  const pags = await fetchAll<any>((from, to) => supabase.from('pagamentos_venda')
    .select('valor, forma_pagamento_id, vendas!inner(deposito_id, numero, status, uso_interno, data)')
    .eq('status', 'pago').eq('vendas.status', 'concluida').eq('vendas.uso_interno', false)
    .lt('vendas.numero', 100000).gte('vendas.data', inicio).lt('vendas.data', proxMes).range(from, to))

  // TODOS os movimentos do mês: recebimento (fiado), reforço (entra na gaveta),
  // retirada/sangria e devolução em dinheiro (saem da gaveta).
  const movsCaixa = await fetchAll<any>((from, to) => supabase.from('movimentos_caixa')
    .select('tipo, forma_pagamento, valor, caixa_id')
    .gte('created_at', inicio).lt('created_at', proxMes).range(from, to))

  const comprasItens = await fetchAll<any>((from, to) => supabase.from('itens_nota_entrada')
    .select('total_item, deposito_id, notas_entrada!inner(data_entrada)')
    .gte('notas_entrada.data_entrada', inicio).lt('notas_entrada.data_entrada', proxMes).range(from, to))

  const despesas = await fetchAll<any>((from, to) => supabase.from('lancamentos')
    .select('valor, loja_id, categoria, pessoa_nome, forma_pagamento').eq('tipo', 'pagar').eq('status', 'pago')
    .gte('data_vencimento', inicio).lt('data_vencimento', proxMes).range(from, to))

  // Forma de pagamento → tipo (pra saber o que é DINHEIRO de verdade, não PIX/cartão)
  const { data: formasPg } = await supabase.from('formas_pagamento').select('id, tipo')
  const tipoPorFormaId = new Map((formasPg ?? []).map((f) => [f.id, f.tipo as string]))
  const ehDinheiro = (txt: string | null | undefined) => (txt ?? '').trim().toLowerCase().includes('dinheiro')

  const perdasApp = await fetchAll<any>((from, to) => supabase.from('movimentacoes_estoque')
    .select('quantidade, observacao, deposito_id, produtos(nome, preco_custo)')
    .eq('operacao', 'perda').gte('created_at', inicio).lt('created_at', proxMes).range(from, to))

  // Trocas SP ainda não resolvidas (status 'enviado'): dinheiro "na rua" com o
  // fornecedor. Sem corte por data — uma troca antiga continua pendente até voltar/abater.
  const trocasSp = await fetchAll<any>((from, to) => supabase.from('trocas_sp')
    .select('valor, loja_id').eq('status', 'enviado').range(from, to))

  const bucket = (id: string) => ({ loja: id, nome: lojasList.find((l) => l.id === id)?.nome ?? id, entradas: 0, fiadoCobrado: 0, compras: 0, despesas: 0 })
  const porLoja: Record<string, ReturnType<typeof bucket>> = {}
  for (const l of lojasList) porLoja[l.id] = bucket(l.id)
  const add = (id: string | null, campo: 'entradas' | 'fiadoCobrado' | 'compras' | 'despesas', valor: number) => {
    if (!id || !porLoja[id]) return
    porLoja[id][campo] += valor
  }

  for (const p of pags) add(lojaDeDeposito.get(p.vendas?.deposito_id) ?? null, 'entradas', p.valor ?? 0)
  for (const r of movsCaixa) if (r.tipo === 'recebimento') add(lojaDeCaixa.get(r.caixa_id) ?? null, 'fiadoCobrado', r.valor ?? 0)
  for (const c of comprasItens) add(lojaDeDeposito.get(c.deposito_id) ?? null, 'compras', c.total_item ?? 0)

  const perdasPorLoja: Record<string, { total: number; itens: { nome: string; custo: number; motivo: string }[] }> = {}
  for (const pd of perdasApp) {
    const loja = lojaDeDeposito.get(pd.deposito_id)
    if (!loja) continue
    const custo = (pd.produtos?.preco_custo ?? 0) * (pd.quantidade ?? 0)
    ;(perdasPorLoja[loja] ??= { total: 0, itens: [] }).total += custo
    perdasPorLoja[loja].itens.push({ nome: pd.produtos?.nome ?? '—', custo, motivo: pd.observacao || '—' })
  }

  const trocasNaRua: Record<string, number> = {}
  for (const t of trocasSp) {
    if (!t.loja_id) continue
    trocasNaRua[t.loja_id] = (trocasNaRua[t.loja_id] ?? 0) + Number(t.valor ?? 0)
  }

  const CAT_COMPRAS = ['Fornecedor / Mercadoria', 'Fornecedor ZL', 'fonecedor']
  for (const d of despesas) {
    const cat = (d.categoria || '').trim()
    if (CAT_COMPRAS.includes(cat)) continue
    const loja = d.loja_id || lojaDePessoa(d.pessoa_nome || '') || petropolisId
    add(loja, 'despesas', d.valor ?? 0)
  }

  // 💵 DINHEIRO (gaveta) por loja, no mês: cédula que entrou − cédula que saiu.
  // O resto do fluxo (PIX/cartão) é banco/maquininha — aqui é só o que dá pra contar na mão.
  const dinheiroPorLoja: Record<string, { entrou: number; saiu: number }> = {}
  for (const l of lojasList) dinheiroPorLoja[l.id] = { entrou: 0, saiu: 0 }
  const addDin = (id: string | null, campo: 'entrou' | 'saiu', valor: number) => {
    if (!id || !dinheiroPorLoja[id]) return
    dinheiroPorLoja[id][campo] += valor
  }
  // venda paga em dinheiro
  for (const p of pags) {
    if (tipoPorFormaId.get(p.forma_pagamento_id) === 'dinheiro')
      addDin(lojaDeDeposito.get(p.vendas?.deposito_id) ?? null, 'entrou', p.valor ?? 0)
  }
  // movimentos da gaveta: recebimento de fiado e reforço entram; retirada/devolução saem
  for (const m of movsCaixa) {
    if (!ehDinheiro(m.forma_pagamento)) continue
    const loja = lojaDeCaixa.get(m.caixa_id) ?? null
    if (m.tipo === 'recebimento' || m.tipo === 'reforco') addDin(loja, 'entrou', m.valor ?? 0)
    else if (m.tipo === 'retirada' || m.tipo === 'devolucao') addDin(loja, 'saiu', m.valor ?? 0)
  }
  // despesa paga em dinheiro
  for (const d of despesas) {
    if (!ehDinheiro(d.forma_pagamento)) continue
    const cat = (d.categoria || '').trim()
    if (CAT_COMPRAS.includes(cat)) continue   // mercadoria é estoque, não gaveta
    const loja = d.loja_id || lojaDePessoa(d.pessoa_nome || '') || petropolisId
    addDin(loja, 'saiu', d.valor ?? 0)
  }

  const linhas = lojasList.map((l) => {
    const b = porLoja[l.id]
    const entradas = b.entradas + b.fiadoCobrado
    const saidas = b.compras + b.despesas
    const caixaInicial = aberturaValor?.caixa?.[l.id] ?? 0
    const caixaDet = aberturaValor?.caixa_detalhado?.[l.id] ?? {}
    const estoqueCategorias = aberturaValor?.estoque_categorias?.[l.id] ?? {}
    const consignado = aberturaValor?.consignado?.[l.id] ?? 0
    const perdas = aberturaValor?.perdas?.[l.id] ?? 0
    const perdasAppTotal = perdasPorLoja[l.id]?.total ?? 0
    const perdasItens = perdasPorLoja[l.id]?.itens ?? []
    const trocasPend = aberturaValor?.trocas?.pendentes?.[l.id] ?? 0
    const trocasIndo = aberturaValor?.trocas?.indo?.[l.id] ?? 0
    const trocasNaRuaValor = trocasNaRua[l.id] ?? 0
    const dinheiro = dinheiroPorLoja[l.id] ?? { entrou: 0, saiu: 0 }
    const dinheiroEmMaos = dinheiro.entrou - dinheiro.saiu
    const estoqueInicial = estoqueInicialPorLoja[l.id] ?? { vitrine: 0, fundo: 0 }
    const estoqueFinal = estoqueFinalPorLoja[l.id] ?? { vitrine: 0, fundo: 0 }
    const estoqueInicialTotal = estoqueInicial.vitrine + estoqueInicial.fundo
    const estoqueFinalTotal = estoqueFinal.vitrine + estoqueFinal.fundo
    return {
      ...b, entradas, saidas, caixaInicial, caixaDet, estoqueCategorias, consignado, perdas, perdasApp: perdasAppTotal, perdasItens, trocasPend, trocasIndo, trocasNaRua: trocasNaRuaValor,
      dinheiroEntrou: dinheiro.entrou, dinheiroSaiu: dinheiro.saiu, dinheiroEmMaos,
      estoqueInicialVitrine: estoqueInicial.vitrine, estoqueInicialFundo: estoqueInicial.fundo, estoqueInicialTotal,
      estoqueFinalVitrine: estoqueFinal.vitrine, estoqueFinalFundo: estoqueFinal.fundo, estoqueFinalTotal,
      consumido: estoqueInicialTotal - estoqueFinalTotal,
      caixaFinal: caixaInicial + entradas - saidas, resultado: entradas - saidas,
    }
  })

  const lojaSel = lojasList.some((l) => l.id === lojaPedida) ? lojaPedida : (lojasList[0]?.id ?? '')
  const linha = linhas.find((l) => l.loja === lojaSel)

  const fmt = (v: number) => formatBRL(v)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📅 Fechamento do Mês</h2>
          <p className="mt-0.5 text-sm text-gray-500">Entradas e saídas, estoque e resultado de cada loja.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/painel/fechamento-mes?mes=${mesAnterior}&loja=${lojaSel}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Anterior</a>
          <span className="rounded-lg bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-700">{nomeMes(mes)}</span>
          <a href={`/painel/fechamento-mes?mes=${mesSeguinte}&loja=${lojaSel}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Próximo →</a>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-0.5">
            {lojasList.map((l) => (
              <a key={l.id} href={`/painel/fechamento-mes?mes=${mes}&loja=${l.id}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${l.id === lojaSel ? 'bg-[#1B6CA8] text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {l.nome}
              </a>
            ))}
          </div>
        </div>
      </div>

      {fechamento && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Mês fechado em {new Date(fechamento.fechado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </div>
      )}

      {linha && (
        <div className="space-y-4">
          {/* fluxo de caixa */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900">{linha.nome}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Caixa inicial</p>
                <p className="mt-1 text-xl font-bold text-gray-800">{fmt(linha.caixaInicial)}</p>
                <p className="text-[11px] text-gray-400">fim de agosto</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase text-emerald-700">Entrou no mês</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">{fmt(linha.entradas)}</p>
                <p className="text-[11px] text-emerald-600">vendas pagas + fiado cobrado</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase text-red-700">Saiu no mês</p>
                <p className="mt-1 text-xl font-bold text-red-700">{fmt(linha.saidas)}</p>
                <p className="text-[11px] text-red-600">compras {fmt(linha.compras)} + despesas {fmt(linha.despesas)}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-xs font-semibold uppercase text-blue-700">Caixa final</p>
                <p className="mt-1 text-xl font-bold text-blue-700">{fmt(linha.caixaFinal)}</p>
                <p className="text-[11px] text-blue-600">inicial + entrou − saiu</p>
              </div>
              <div className={`rounded-xl p-4 ${linha.resultado >= 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <p className="text-xs font-semibold uppercase text-gray-500">Resultado</p>
                <p className={`mt-1 text-xl font-bold ${linha.resultado >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(linha.resultado)}</p>
                <p className="text-[11px] text-gray-500">entrou − saiu</p>
              </div>
            </div>
          </div>

          {/* caixa detalhado */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">💵 Caixa (onde está o dinheiro)</p>
            <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {CAIXA_DET.map(([k, label]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.caixaDet?.[k] ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* dinheiro (gaveta) no mês */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-700">💵 Dinheiro (gaveta) no mês</p>
            <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Entrou em dinheiro</span>
                <span className="font-semibold tabular-nums text-emerald-700">{fmt(linha.dinheiroEntrou)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Saiu em dinheiro</span>
                <span className="font-semibold tabular-nums text-red-600">{fmt(linha.dinheiroSaiu)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 font-medium">Em mãos</span>
                <span className={`font-bold tabular-nums ${linha.dinheiroEmMaos >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(linha.dinheiroEmMaos)}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-emerald-700">venda + fiado + reforço em dinheiro − despesa + retirada + devolução em dinheiro</p>
          </div>

          {/* consignado, perdas, trocas */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-purple-50 p-4">
              <p className="text-xs font-semibold uppercase text-purple-700">🏷️ Consignado (a pagar)</p>
              <p className="mt-1 text-lg font-bold text-purple-700">{fmt(linha.consignado)}</p>
              <p className="text-[11px] text-purple-600">não é seu ainda — é dívida</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase text-rose-700">🗑️ Perdas</p>
              <p className="mt-1 text-lg font-bold text-rose-700">{fmt(linha.perdasApp)}</p>
              <p className="text-[11px] text-rose-600">registradas no estoque · setembro oficial {fmt(linha.perdas)}</p>
              {linha.perdasItens.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-rose-600">ver motivos ({linha.perdasItens.length})</summary>
                  <div className="mt-1 space-y-1">
                    {linha.perdasItens.map((it, i) => (
                      <div key={i} className="flex justify-between gap-2 text-[11px] text-rose-700">
                        <span className="truncate">{it.nome}{it.motivo !== '—' ? ' · ' + it.motivo : ''}</span>
                        <span className="shrink-0 tabular-nums">{fmt(it.custo)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-700">🔄 Trocas (SP) na rua</p>
              <p className="mt-1 text-lg font-bold text-amber-700">{fmt(linha.trocasNaRua)}</p>
              <p className="text-[11px] text-amber-600">enviadas e não resolvidas · setembro oficial {fmt(linha.trocasPend + linha.trocasIndo)}</p>
            </div>
          </div>

          {/* estoque (custo): vitrine × fundo, inicial → final → consumido */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
            <p className="text-xs font-semibold uppercase text-sky-700">📦 Estoque (custo)</p>
            <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Vitrine (loja)</span>
                <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.estoqueFinalVitrine)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Fundo (estoque)</span>
                <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.estoqueFinalFundo)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Início do mês</span>
                <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.estoqueInicialTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Final (agora)</span>
                <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.estoqueFinalTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700 font-medium">Consumido</span>
                <span className={`font-bold tabular-nums ${linha.consumido >= 0 ? 'text-sky-700' : 'text-amber-600'}`}>{fmt(linha.consumido)}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-sky-700">consumido = início − final · preço de custo do cadastro (ainda inflado, ajustar depois)</p>
          </div>

          {/* estoque por categoria (embaixo) */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">📦 Estoque (imobilizado) por categoria</p>
            <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {CAT_ESTOQUE.map(([k, label]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-600">{label}</span>
                  <span className="font-semibold tabular-nums text-gray-800">{fmt(linha.estoqueCategorias?.[k] ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <FecharMesButton mes={mes} fechado={!!fechamento} />
        <p className="text-xs text-gray-400">O botão só marca o mês como conferido — não trava nem apaga nada.</p>
      </div>
    </div>
  )
}
