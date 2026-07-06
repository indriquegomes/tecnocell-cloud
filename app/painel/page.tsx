import { createServiceClient, permissoesUsuarioAtual, fetchAll } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { formatBRL, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Dica } from '@/components/Dica'

export default async function DashboardPage() {
  const supabase = await createServiceClient()
  const { permissoes, isMaster } = await permissoesUsuarioAtual()
  const pode = (k: string) => temPermissao(permissoes, k, isMaster)

  const [
    { count: totalProdutos },
    { count: totalClientes },
    estoqueItems,
    { data: lancamentosRecentes },
    { data: vendasHoje },
    { data: pendentesReceber },
    { data: pendentesPagar },
  ] = await Promise.all([
    supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('pessoas').select('*', { count: 'exact', head: true }).eq('tipo', 'cliente'),
    fetchAll<{ produto_id: string; quantidade: number }>((from, to) => supabase.from('estoque').select('produto_id, quantidade').gt('quantidade', 0).range(from, to)),
    supabase
      .from('lancamentos')
      .select('id, descricao, valor, tipo, status, data_vencimento, pessoa_nome')
      .order('data_vencimento', { ascending: false })
      .limit(5),
    supabase
      .from('vendas')
      .select('total')
      .eq('status', 'concluida')
      .gte('created_at', new Date().toISOString().split('T')[0]),
    supabase.from('lancamentos').select('valor').eq('tipo', 'receber').eq('status', 'pendente'),
    supabase.from('lancamentos').select('valor').eq('tipo', 'pagar').eq('status', 'pendente'),
  ])

  const itensEmEstoque = (estoqueItems ?? []).length
  const estoqueBaixo = (estoqueItems ?? []).filter((e) => e.quantidade <= 3).length

  const aReceber = (pendentesReceber ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)
  const aPagar = (pendentesPagar ?? []).reduce((s, l) => s + (l.valor ?? 0), 0)

  const totalVendasHoje = (vendasHoje ?? []).reduce((s, v) => s + (v.total ?? 0), 0)

  // Cada card/atalho só aparece pra quem tem a permissão do módulo
  const cards = [
    {
      label: 'Produtos Ativos',
      value: totalProdutos ?? 0,
      icon: '📦',
      href: '/painel/produtos',
      color: 'bg-blue-50 text-blue-700',
      permissao: 'produtos',
    },
    {
      label: 'Vendas Hoje',
      value: formatBRL(totalVendasHoje),
      icon: '🛒',
      href: '/painel/pdv',
      color: 'bg-green-50 text-green-700',
      permissao: 'vendas',
    },
    {
      label: 'Estoque Baixo',
      value: estoqueBaixo,
      icon: '⚠️',
      href: '/painel/estoque',
      color: estoqueBaixo > 0 ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-600',
      permissao: 'estoque',
    },
    {
      label: 'Clientes',
      value: totalClientes ?? 0,
      icon: '👥',
      href: '/painel/clientes',
      color: 'bg-purple-50 text-purple-700',
      permissao: 'clientes',
    },
  ].filter((c) => pode(c.permissao))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <Dica texto="Visão geral do sistema: estoque, vendas do dia, contas pendentes e indicadores principais." />
        </div>
        {pode('estoque') && <span className="text-xs text-gray-400">{itensEmEstoque} itens em estoque</span>}
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

      {/* Resumo financeiro — só pra quem tem financeiro */}
      {pode('financeiro') && (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">A Receber</h3>
          <p className="text-3xl font-bold text-green-600">{formatBRL(aReceber)}</p>
          <Link href="/painel/financeiro?tipo=receber" className="mt-2 text-xs text-blue-500 hover:underline">
            Ver lançamentos →
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">A Pagar</h3>
          <p className="text-3xl font-bold text-red-600">{formatBRL(aPagar)}</p>
          <Link href="/painel/financeiro?tipo=pagar" className="mt-2 text-xs text-blue-500 hover:underline">
            Ver lançamentos →
          </Link>
        </div>
      </div>
      )}

      {/* Lançamentos recentes */}
      {pode('financeiro') && (lancamentosRecentes ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-800">Últimos Lançamentos</h3>
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

      {/* Atalhos — por permissão */}
      <div className="grid gap-3 sm:grid-cols-3">
        {pode('pdv') && (
        <Link href="/painel/pdv"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-green-400 hover:text-green-600">
          <span className="text-xl">🛒</span> Abrir PDV
        </Link>
        )}
        {pode('financeiro') && (
        <Link href="/painel/financeiro/novo"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-blue-400 hover:text-blue-600">
          <span className="text-xl">💰</span> Novo Lançamento
        </Link>
        )}
        <Link href="/painel/chat"
          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm font-medium text-gray-600 transition hover:border-blue-400 hover:text-blue-600">
          <span className="text-xl">🤖</span> Chat com IA
        </Link>
      </div>
    </div>
  )
}
