'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { temPermissao } from '@/lib/permissoes'

type NavItem = { href: string; label: string; permissao?: string }
type NavGroup = { group: string; items: NavItem[] }

const navCompleto: NavGroup[] = [
  {
    group: 'Geral',
    items: [
      { href: '/painel', label: 'Dashboard' },
    ],
  },
  {
    group: 'Vendas',
    items: [
      { href: '/painel/pdv',            label: 'PDV / Caixa',           permissao: 'pdv' },
      { href: '/painel/pdv/operacao',   label: 'Operação do PDV',       permissao: 'pdv' },
      { href: '/painel/vendas',         label: 'Painel de Vendas',      permissao: 'vendas' },
      { href: '/painel/vales-credito',  label: 'Créditos de Clientes',  permissao: 'financeiro' },
      { href: '/painel/pedidos',        label: 'Pedidos e Orçamentos',  permissao: 'pedidos' },
      { href: '/painel/devolucoes',     label: 'Devoluções',            permissao: 'devolucoes' },
      { href: '/painel/painel-vendedor', label: 'Painel Vendedor',      permissao: 'relatorios' },
      { href: '/painel/promocoes',      label: 'Promoções',             permissao: 'produtos' },
    ],
  },
  {
    group: 'Serviços',
    items: [
      { href: '/painel/os', label: 'Ordens de Serviço', permissao: 'os' },
    ],
  },
  {
    group: 'Estoque',
    items: [
      { href: '/painel/produtos',          label: 'Produtos',       permissao: 'produtos' },
      { href: '/painel/estoque',           label: 'Estoque',        permissao: 'estoque' },
      { href: '/painel/estoque/historico', label: 'Movimentações',  permissao: 'estoque' },
    ],
  },
]

const navEmConstrucao: NavGroup[] = [
  {
    group: 'Financeiro',
    items: [
      { href: '/painel/financeiro', label: 'Financeiro', permissao: 'financeiro' },
    ],
  },
  {
    group: 'Cadastros',
    items: [
      { href: '/painel/clientes',         label: 'Pessoas',             permissao: 'clientes' },
      { href: '/painel/empresas',         label: 'Empresas',            permissao: 'usuarios' },
      { href: '/painel/formas-pagamento', label: 'Formas de Pagamento', permissao: 'usuarios' },
      { href: '/painel/depositos',        label: 'Depósitos',           permissao: 'estoque' },
      { href: '/painel/categorias',       label: 'Categorias',          permissao: 'produtos' },
      { href: '/painel/compras',          label: 'Notas de Entrada',    permissao: 'compras' },
      { href: '/painel/tabelas-preco',    label: 'Tabelas de Preço',    permissao: 'produtos' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/painel/relatorios',    label: 'Relatórios',   permissao: 'relatorios' },
      { href: '/painel/usuarios',      label: 'Usuários',     permissao: 'usuarios' },
      { href: '/painel/configuracoes', label: 'Configurações', permissao: 'usuarios' },
    ],
  },
]

export function Sidebar({ permissoes, isMaster }: { permissoes: string[]; isMaster: boolean }) {
  const pathname = usePathname()
  const exactOnly = ['/painel', '/painel/estoque']
  const isActive = (href: string) =>
    exactOnly.includes(href) ? pathname === href : pathname.startsWith(href)

  const podeVer = (item: NavItem) =>
    !item.permissao || temPermissao(permissoes, item.permissao, isMaster)

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
        {/* Módulos completos */}
        {navCompleto.map((section) => {
          const itensVisiveis = section.items.filter(podeVer)
          if (!itensVisiveis.length) return null
          return (
            <div key={section.group} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {section.group}
              </p>
              {itensVisiveis.map((item) => (
                <Link key={item.href} href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isActive(item.href) ? 'bg-blue-500' : 'bg-gray-300')} />
                  {item.label}
                </Link>
              ))}
            </div>
          )
        })}

        {/* Divisor */}
        <div className="mx-4 my-3 border-t border-dashed border-gray-200" />

        {/* Módulos em construção */}
        {navEmConstrucao.map((section) => {
          const itensVisiveis = section.items.filter(podeVer)
          if (!itensVisiveis.length) return null
          return (
            <div key={section.group} className="mb-1">
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                🚧 {section.group}
              </p>
              {itensVisiveis.map((item) => (
                <Link key={item.href} href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                  )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isActive(item.href) ? 'bg-amber-400' : 'bg-gray-200')} />
                  {item.label}
                </Link>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Footer — logout via POST */}
      <div className="border-t border-gray-200 p-3">
        <form action="/api/auth/signout" method="POST">
          <button type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
