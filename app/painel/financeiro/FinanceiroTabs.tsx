import Link from 'next/link'

// Nav de abas do hub Financeiro. Mesma barra em /painel/financeiro e /painel/contas,
// unindo as telas de dinheiro num lugar só. `active` vem de cada página (server-friendly).
export function FinanceiroTabs({ active }: { active: 'saldos' | 'lancamentos' | 'contas' }) {
  const tabs = [
    { key: 'saldos', label: '💰 Saldos', href: '/painel/contas?aba=saldos' },
    { key: 'lancamentos', label: '📊 A Receber / A Pagar', href: '/painel/financeiro' },
    { key: 'contas', label: '⚙️ Contas & Transferências', href: '/painel/contas?aba=contas' },
  ] as const
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={`min-w-[140px] flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-semibold transition ${active === t.key ? 'bg-[#1B6CA8] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
