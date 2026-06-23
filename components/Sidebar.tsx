'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string }
type NavGroup = { group: string; items: NavItem[] }

const nav: NavGroup[] = [
  {
    group: 'Geral',
    items: [
      { href: '/painel', label: 'Dashboard' },
    ],
  },
  {
    group: 'Vendas',
    items: [
      { href: '/painel/pdv', label: 'PDV / Caixa' },
      { href: '/painel/pedidos', label: 'Pedidos e Orçamentos' },
      { href: '/painel/vendas', label: 'Painel de Vendas' },
      { href: '/painel/os', label: 'Ordens de Serviço' },
      { href: '/painel/consignado', label: 'Consignado' },
      { href: '/painel/pdv/operacao', label: 'Operação do PDV' },
      { href: '/painel/vales-credito', label: 'Vales de Crédito' },
      { href: '/painel/promocoes', label: 'Promoções' },
    ],
  },
  {
    group: 'Compras',
    items: [
      { href: '/painel/compras', label: 'Notas de Entrada' },
    ],
  },
  {
    group: 'Cadastros',
    items: [
      { href: '/painel/clientes', label: 'Pessoas' },
      { href: '/painel/produtos', label: 'Produtos' },
      { href: '/painel/empresas', label: 'Empresas' },
      { href: '/painel/formas-pagamento', label: 'Formas de Pagamento' },
    ],
  },
  {
    group: 'Estoque',
    items: [
      { href: '/painel/estoque', label: 'Movimentações' },
      { href: '/painel/depositos', label: 'Depósitos' },
      { href: '/painel/tabelas-preco', label: 'Tabelas de Preço' },
      { href: '/painel/catalogo', label: 'Catálogo' },
      { href: '/painel/categorias', label: 'Categorias' },
    ],
  },
  {
    group: 'Gestão',
    items: [
      { href: '/painel/financeiro', label: 'Financeiro' },
      { href: '/painel/relatorios', label: 'Relatórios' },
      { href: '/painel/configuracoes', label: 'Configurações' },
    ],
  },
  {
    group: 'SIGE Loja',
    items: [
      { href: '/painel/loja', label: 'Gestão da Loja' },
      { href: '/loja', label: 'Ver Loja Online' },
    ],
  },
  {
    group: 'Ferramentas',
    items: [
      { href: '/painel/chat', label: 'Chat IA' },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/painel' ? pathname === '/painel' : pathname.startsWith(href)

  return (
    <aside className="flex h-full w-60 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center px-5 border-b border-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-transparent.png" alt="TecnoCell Cloud" className="h-8 w-auto object-contain" />
        <span className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: '#eef4fb', color: '#4A7BA7' }}>
          Cloud
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {nav.map((section) => (
          <div key={section.group} className="mb-1">
            <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {section.group}
            </p>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isActive(item.href) ? 'bg-blue-500' : 'bg-gray-300')} />
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3">
        <Link
          href="/api/auth/signout"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </Link>
      </div>
    </aside>
  )
}
