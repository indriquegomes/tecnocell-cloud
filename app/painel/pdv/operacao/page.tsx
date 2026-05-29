import { createServiceClient } from '@/lib/supabase/server'
import { abrirCaixa, fecharCaixa } from './actions'
import Link from 'next/link'

export default async function OperacaoPDVPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const supabase = await createServiceClient()

  const { data: caixaAberto } = await supabase
    .from('caixas')
    .select('*')
    .eq('status', 'aberto')
    .order('aberto_em', { ascending: false })
    .limit(1)
    .single()

  const { data: historico } = await supabase
    .from('caixas')
    .select('*')
    .order('aberto_em', { ascending: false })
    .limit(20)

  // Vendas desde a abertura do caixa atual
  let vendasDia: { id: string; total: number; forma_pagamento_id: string | null; created_at: string }[] = []
  let itensDia: { produto_id: string; quantidade: number; preco_unitario: number; total_item: number; nome?: string }[] = []

  if (caixaAberto) {
    const { data: vendas } = await supabase
      .from('vendas')
      .select('id, total, forma_pagamento_id, created_at')
      .eq('status', 'concluida')
      .gte('created_at', caixaAberto.aberto_em)
      .order('created_at', { ascending: false })

    vendasDia = vendas ?? []

    if (vendasDia.length > 0) {
      const vendaIds = vendasDia.map(v => v.id)
      const { data: itens } = await supabase
        .from('itens_venda')
        .select('produto_id, quantidade, preco_unitario, total_item, produtos(nome)')
        .in('venda_id', vendaIds)
      itensDia = (itens ?? []).map((i: Record<string, unknown>) => ({
        produto_id: i.produto_id as string,
        quantidade: i.quantidade as number,
        preco_unitario: i.preco_unitario as number,
        total_item: i.total_item as number,
        nome: (i.produtos as { nome: string } | null)?.nome,
      }))
    }
  }

  // Agrupamentos para o resumo
  const totalVendas = vendasDia.reduce((s, v) => s + (v.total ?? 0), 0)
  const qtdVendas = vendasDia.length

  // Total por produto
  const porProduto = itensDia.reduce<Record<string, { nome: string; qtd: number; total: number }>>((acc, i) => {
    const key = i.produto_id
    if (!acc[key]) acc[key] = { nome: i.nome ?? i.produto_id, qtd: 0, total: 0 }
    acc[key].qtd += i.quantidade
    acc[key].total += i.total_item
    return acc
  }, {})

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => new Date(d).toLocaleString('pt-BR')
  const fmtHora = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/painel/pdv" className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Operação do PDV</h2>
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>}

      {/* Status do caixa */}
      <div className={`rounded-2xl border p-6 ${caixaAberto ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Status do Caixa</p>
            <p className={`text-2xl font-bold mt-1 ${caixaAberto ? 'text-green-700' : 'text-gray-500'}`}>
              {caixaAberto ? 'Aberto' : 'Fechado'}
            </p>
            {caixaAberto && (
              <p className="text-sm text-gray-500 mt-1">
                Aberto em {fmtDate(caixaAberto.aberto_em)} · Saldo inicial: {fmt(caixaAberto.valor_abertura ?? 0)}
              </p>
            )}
          </div>
          <div className={`h-4 w-4 rounded-full ${caixaAberto ? 'bg-green-500' : 'bg-gray-300'}`} />
        </div>
      </div>

      {/* Resumo de vendas do caixa atual */}
      {caixaAberto && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Vendas do Caixa Atual</h3>
            <span className="text-xs text-gray-400">desde {fmtDate(caixaAberto.aberto_em)}</span>
          </div>

          {/* Totalizadores */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
            <div className="bg-white px-6 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total em Vendas</p>
              <p className="mt-1 text-2xl font-bold text-green-600">{fmt(totalVendas)}</p>
            </div>
            <div className="bg-white px-6 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nº de Vendas</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{qtdVendas}</p>
            </div>
            <div className="bg-white px-6 py-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ticket Médio</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {qtdVendas > 0 ? fmt(totalVendas / qtdVendas) : '—'}
              </p>
            </div>
          </div>

          {/* Itens vendidos */}
          {Object.keys(porProduto).length > 0 && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Itens Vendidos</p>
              <div className="space-y-2">
                {Object.values(porProduto).sort((a, b) => b.total - a.total).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{p.nome}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-400">{p.qtd} un.</span>
                      <span className="font-semibold text-gray-900 w-24 text-right">{fmt(p.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de vendas recentes */}
          {vendasDia.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="px-6 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transações</p>
              </div>
              <table className="min-w-full divide-y divide-gray-50">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-400">Hora</th>
                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-400">ID</th>
                    <th className="px-6 py-2 text-right text-xs font-medium text-gray-400">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vendasDia.map(v => (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-6 py-2 text-sm text-gray-500">{fmtHora(v.created_at)}</td>
                      <td className="px-6 py-2 text-sm font-mono text-gray-400">{v.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-6 py-2 text-sm font-semibold text-right text-green-600">{fmt(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {qtdVendas === 0 && (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              Nenhuma venda registrada desde a abertura do caixa.
            </div>
          )}
        </div>
      )}

      {/* Ação: Abrir ou Fechar caixa */}
      {!caixaAberto ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">Abrir Caixa</h3>
          <form action={abrirCaixa} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor de Abertura (R$)</label>
              <input name="valor_abertura" type="number" step="0.01" min="0" defaultValue="0" className="field" />
            </div>
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <input name="obs_abertura" className="field" placeholder="Opcional" />
            </div>
            <button type="submit" className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition">
              Abrir Caixa
            </button>
          </form>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Fechar Caixa</h3>
            <p className="text-sm text-gray-500">
              Total em vendas: <strong className="text-green-600">{fmt(totalVendas)}</strong>
            </p>
          </div>
          <form action={fecharCaixa.bind(null, caixaAberto.id)} className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Valor no Caixa (R$)</label>
              <input name="valor_fechamento" type="number" step="0.01" min="0" defaultValue="0" className="field" />
            </div>
            <div className="flex-1 min-w-48">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Observações</label>
              <input name="obs_fechamento" className="field" placeholder="Opcional" />
            </div>
            <button type="submit" className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">
              Fechar Caixa
            </button>
          </form>
        </div>
      )}

      {/* Histórico */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Histórico de Caixas</h3>
        </div>
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Abertura</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechamento</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Inicial</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Final</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(historico ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(c.aberto_em)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{c.fechado_em ? fmtDate(c.fechado_em) : '—'}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(c.valor_abertura ?? 0)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{c.valor_fechamento != null ? fmt(c.valor_fechamento) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.status === 'aberto' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
