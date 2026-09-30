import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL, formatDate, hojeSP } from '@/lib/utils'
import { FecharMesButton } from './FecharMesButton'

// Nome do mês em pt-BR ("2026-09" → "setembro/2026").
function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[m - 1]}/${ano}`
}

export default async function FechamentoMesPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const params = await searchParams
  const hoje = hojeSP()
  const pedido = params.mes ?? hoje.slice(0, 7)
  const mes = /^\d{4}-\d{2}$/.test(pedido) ? pedido : hoje.slice(0, 7)
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  const mesAnterior = m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, '0')}`
  const mesSeguinte = proxMes.slice(0, 7)

  const supabase = await createServiceClient()

  // Vendas do mês (concluídas, sem uso interno)
  const vendas = await fetchAll<{ total: number | null }>((from, to) =>
    supabase.from('vendas').select('total').eq('status', 'concluida').eq('uso_interno', false)
      .gte('created_at', inicio).lt('created_at', proxMes).range(from, to))
  const vendasTotal = (vendas ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  // Custo das mercadorias (CMV): itens_venda × preco_custo dos produtos
  const itens = await fetchAll<any>((from, to) =>
    supabase.from('itens_venda')
      .select('quantidade, produtos!inner(preco_custo), vendas!inner(created_at, status)')
      .eq('vendas.status', 'concluida').gte('vendas.created_at', inicio).lt('vendas.created_at', proxMes).range(from, to))
  const custoTotal = ((itens ?? []) as unknown as { quantidade: number; produtos: { preco_custo: number | null } | null }[]).reduce((s, it) => s + ((it.produtos?.preco_custo ?? 0) * (it.quantidade || 0)), 0)

  // Despesas do mês (contas a pagar)
  const despesas = await fetchAll<{ valor: number }>((from, to) =>
    supabase.from('lancamentos').select('valor').eq('tipo', 'pagar')
      .gte('data_vencimento', inicio).lt('data_vencimento', proxMes).range(from, to))
  const despesasTotal = (despesas ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)

  // A receber pendente (fiados e contas em aberto)
  const receber = await fetchAll<{ valor: number }>((from, to) =>
    supabase.from('lancamentos').select('valor').eq('tipo', 'receber').eq('status', 'pendente').range(from, to))
  const receberTotal = (receber ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)

  // ---- Estoque (valor em R$ a CUSTO) ----
  const estoqueAtual = await fetchAll<any>((from, to) =>
    supabase.from('estoque').select('quantidade, produtos!inner(preco_custo)').range(from, to))
  const estoqueHoje = (estoqueAtual ?? []).reduce((s, e) => s + ((e.quantidade || 0) * (e.produtos?.preco_custo ?? 0)), 0)

  // Movimentos no mês selecionado (mudança líquida) + perdas
  const movs = await fetchAll<any>((from, to) =>
    supabase.from('movimentacoes_estoque').select('qtd_nova, qtd_anterior, operacao, produtos!inner(preco_custo)')
      .gte('created_at', inicio).lt('created_at', proxMes).range(from, to))
  const movimentos = movs ?? []
  const netChange = movimentos.reduce((s, m) => s + (((m.qtd_nova ?? 0) - (m.qtd_anterior ?? 0)) * (m.produtos?.preco_custo ?? 0)), 0)
  const perdasTotal = movimentos.filter((m) => m.operacao === 'perda').reduce((s, m) => s + (((m.qtd_anterior ?? 0) - (m.qtd_nova ?? 0)) * (m.produtos?.preco_custo ?? 0)), 0)

  // Movimentos DEPOIS do mês (pra reconstruir o estoque no fim do mês selecionado)
  const movsDepois = await fetchAll<any>((from, to) =>
    supabase.from('movimentacoes_estoque').select('qtd_nova, qtd_anterior, produtos!inner(preco_custo)')
      .gte('created_at', proxMes).range(from, to))
  const netDepois = (movsDepois ?? []).reduce((s, m) => s + (((m.qtd_nova ?? 0) - (m.qtd_anterior ?? 0)) * (m.produtos?.preco_custo ?? 0)), 0)

  const estoqueFinal = estoqueHoje - netDepois          // estoque no FIM do mês selecionado
  const estoqueInicial = estoqueFinal - netChange       // estoque no COMEÇO do mês

  // Trocas/defeito/avaria (devolução que NÃO voltou pro estoque)
  const trocas = await fetchAll<any>((from, to) =>
    supabase.from('itens_devolucao').select('quantidade, produtos!inner(preco_custo), devolucoes!inner(created_at)')
      .neq('status_produto', 'ok').gte('devolucoes.created_at', inicio).lt('devolucoes.created_at', proxMes).range(from, to))
  const trocasTotal = (trocas ?? []).reduce((s, t) => s + ((t.quantidade || 0) * (t.produtos?.preco_custo ?? 0)), 0)

  const lucro = vendasTotal - custoTotal - despesasTotal

  // Já fechado?
  const { data: fechado } = await supabase.from('configuracoes').select('valor').eq('chave', `fechamento_mes:${mes}`).maybeSingle()
  const fechamento = fechado ? (fechado.valor as { fechado_em: string; fechado_por?: string }) : null

  const Card = ({ rotulo, valor, cor, sub }: { rotulo: string; valor: string; cor: string; sub?: string }) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{rotulo}</p>
      <p className={`mt-1.5 text-[26px] font-extrabold tabular-nums ${cor}`}>{valor}</p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📅 Fechamento do Mês</h2>
          <p className="mt-0.5 text-sm text-gray-500">Resumo simples do mês: quanto vendeu, quanto gastou e quanto sobrou.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/painel/fechamento-mes?mes=${mesAnterior}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Anterior</a>
          <span className="rounded-lg bg-blue-50 px-4 py-1.5 text-sm font-bold text-blue-700">{nomeMes(mes)}</span>
          <a href={`/painel/fechamento-mes?mes=${mesSeguinte}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Próximo →</a>
        </div>
      </div>

      {fechamento && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          ✅ Mês fechado em {formatDate(fechamento.fechado_em)}{fechamento.fechado_por ? ` por ${fechamento.fechado_por}` : ''}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card rotulo="Vendas do mês" valor={formatBRL(vendasTotal)} cor="text-gray-900" sub="Vendas concluídas (sem devoluções)" />
        <Card rotulo="Custo das mercadorias" valor={`− ${formatBRL(custoTotal)}`} cor="text-orange-600" sub="Quanto custou o que foi vendido" />
        <Card rotulo="Despesas" valor={`− ${formatBRL(despesasTotal)}`} cor="text-red-600" sub="Contas a pagar do mês" />
        <Card rotulo="Lucro" valor={formatBRL(lucro)} cor={lucro >= 0 ? 'text-emerald-600' : 'text-red-600'} sub="Vendas − custo − despesas" />
        <Card rotulo="A receber (fiado/em aberto)" valor={formatBRL(receberTotal)} cor="text-amber-600" sub="Pendente pra receber" />
      </div>

      {/* Estoque do mês (a custo) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">📦 Estoque do mês (a custo)</h3>
        <p className="mt-0.5 text-xs text-gray-400">Quanto você tem parado em peça, pelo preço de custo (o investimento).</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card rotulo="Estoque inicial (dia 01)" valor={formatBRL(estoqueInicial)} cor="text-gray-900" />
          <Card rotulo="Estoque final (dia 30)" valor={formatBRL(estoqueFinal)} cor="text-gray-900" />
          <Card rotulo="Variação do estoque" valor={formatBRL(estoqueFinal - estoqueInicial)} cor={(estoqueFinal - estoqueInicial) >= 0 ? 'text-emerald-600' : 'text-red-600'} sub="Final − inicial" />
          <Card rotulo="Perdas" valor={`− ${formatBRL(perdasTotal)}`} cor="text-red-600" sub="Quebra/sumiço/avaria" />
          <Card rotulo="Trocas que não voltaram" valor={`− ${formatBRL(trocasTotal)}`} cor="text-orange-600" sub="Defeito/avaria devolvida" />
        </div>
        <p className="mt-3 text-xs text-gray-400">Variação = o que o estoque cresceu (+) ou encolheu (−) no mês. Perdas e trocas que não voltam explicam parte do que sumiu (sem venda).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <FecharMesButton mes={mes} fechado={!!fechamento} />
        <p className="text-xs text-gray-400">O botão só marca o mês como conferido — não trava nem apaga nada.</p>
      </div>
    </div>
  )
}
