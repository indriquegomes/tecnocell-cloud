import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createServiceClient()

  const [
    { count: totalProdutos },
    { count: totalClientes },
    { data: estoqueItems },
    { data: lancamentosRecentes },
    { data: vendasHoje },
  ] = await Promise.all([
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('tipo', 'cliente'),
    supabase.from('estoque').select('produto_id, quantidade').gt('quantidade', 0),
    supabase
      .from('lancamentos')
      .select('id, descricao, valor, tipo, status, data_vencimento, pessoa_nome')
      .order('data_vencimento', { ascending: false })
      .limit(5),
    supabase
      .from('vendas')
      .select('total')
      .gte('created_at', new Date().toISOString().split('T')[0]),
  ])

  const itensEmEstoque = (estoqueItems ?? []).length
  const estoqueBaixo = (estoqueItems ?? []).filter((e) => e.quantidade <= 3).length

  const aReceber = (lancamentosRecentes ?? [])
    .filter((l) => l.tipo === 'receber' && l.status !== 'pago')
    .reduce((s, l) => s + (l.valor ?? 0), 0)

  const aPagar = (lancamentosRecentes ?? [])
    .filter((l) => l.tipo === 'pagar' && l.status !== 'pago')
    .reduce((s, l) => s + (l.valor ?? 0), 0)

  const totalVendasHoje = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  const cards = [
    {
      label: 'Produtos Ativos',
      value: totalProdutos ?? 0,
      icon: '�x�',
      href: '/painel/produtos',
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Vendas Hoje',
      value: formatBRL(totalVendasHoje),
      icon: '�x:',
      href: '/painel/pdv',
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Estoque Baixo',
      value: estoqueBaixo,
      icon: '�a�️',
      href: '/painel/estoque',
      color: estoqueBaixo > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-600',
    },
    {
      label: 'Clientes',
      value: totalClientes ?? 0,
      icon: '�x�',
      href: '/painel/clientes',
      color: 'bg-purple-50 text-purple-700',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <span className="text-xs text-gray-400">{itensEmEstoque} itens em estoque</span>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">{card.value}</p>
              </div>
              <span className={`rounded-xl p-3 text-2xl ${card.color}`}>{card.icon}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Resumo financeiro */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">A Receber</h3>
          <p className="text-3xl font-bold text-green-600">{formatBRL(aReceber)}</p>
          <Link href="/painel/financeiro?tipo=receber" className="mt-2 text-xs text-blue-500 hover:underline">
            Ver lançamentos � 
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">A Pagar</h3>
          <p className="text-3xl font-bold text-red-600">{formatBRL(aPagar)}</p>
          <Link href="/painel/financeiro?tipo=pagar" className="mt-2 text-xs text-blue-500 hover:underline">
            Ver lançamentos � 
          </Link>
        </div>
      </div>

      {/* Lançamentos recentes */}
      {(lancamentosRecentes ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-800">�altimos Lançamentos</h3>
            <Link href="/painel/financeiro" className="text-xs text-blue-500 hover:underline">Ver todos</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {lancamentosRecentes!.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{l.descricao || 'Sem descrição'}</p>
                  {l.pessoa_nome && <p className="text-xs text-gray-400">{l.pessoa_nome}</p>}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${l.tipo === 'receber' ? 'text-green-600' : 'text-red-600'}`}>
                    {l.tipo === 'receber' ? '+' : '-'}{formatBRL(l.valor ?? 0)}
                  </p>
                  <p className="text-xs text-gray-400">{l.data_vencimento ? formatDate(l.data_vencimento) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/painel/pdv"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-green-400 hover:text-green-600">
          <span className="text-xl">�x:</span> Abrir PDV
        </Link>
        <Link href="/painel/financeiro/novo"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-blue-400 hover:text-blue-600">
          <span className="text-xl">�x�</span> Novo Lançamento
        </Link>
        <Link href="/painel/chat"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-blue-400 hover:text-blue-600">
          <span className="text-xl">�x�</span> Chat com IA
        </Link>
      </div>
    </div>
  )
}

