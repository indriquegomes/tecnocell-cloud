import Link from 'next/link'

// Nav de abas do hub Financeiro. Mesma barra em /painel/financeiro e /painel/contas.
// `active` vem de cada página (server-friendly).
// A Receber e A Pagar são abas SEPARADAS (pedido do dono: não misturar).
// Fluxo de Caixa e Lucro Mensal saíram daqui: são RELATÓRIO, ficam em /painel/relatorios
// e no Fechamento do Mês — não misturar análise com o dia a dia do financeiro.
export function FinanceiroTabs({ active }: { active: 'saldos' | 'lancamentos' | 'receber' | 'pagar' | 'contas' }) {
  const tabs = [
    // As duas abas com seta abrem a tela Contas — o rótulo avisa, senão parece que
    // o clique não funcionou quando a tela muda.
    { key: 'saldos', label: '💰 Saldos ↗', href: '/painel/contas?aba=saldos', fora: true },
    { key: 'lancamentos', label: '📋 Todos', href: '/painel/financeiro' },
    { key: 'receber', label: '🟢 A Receber', href: '/painel/financeiro?tipo=receber' },
    { key: 'pagar', label: '🔴 A Pagar', href: '/painel/financeiro?tipo=pagar' },
    { key: 'contas', label: '⚙️ Contas ↗', href: '/painel/contas?aba=contas', fora: true },
  ] as const
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} title={'fora' in t ? 'Abre a tela Contas' : undefined}
          className={`min-w-[110px] flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition ${active === t.key ? 'bg-[#1B6CA8] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
