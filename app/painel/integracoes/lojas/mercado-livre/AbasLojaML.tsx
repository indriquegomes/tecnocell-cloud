'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ABAS = [
  { href: '/painel/integracoes/lojas/mercado-livre',            label: 'Dashboard' },
  { href: '/painel/integracoes/lojas/mercado-livre/anuncios',    label: 'Meus Anúncios' },
  { href: '/painel/integracoes/lojas/mercado-livre/vendas',      label: 'Minhas Vendas' },
  { href: '/painel/integracoes/lojas/mercado-livre/perguntas',   label: 'Perguntas e Respostas' },
  { href: '/painel/integracoes/lojas/mercado-livre/catalogo',    label: 'Anúncios do Catálogo' },
]

export function AbasLojaML() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {ABAS.map((aba) => {
        const ativa = aba.href === '/painel/integracoes/lojas/mercado-livre'
          ? pathname === aba.href
          : pathname.startsWith(aba.href)
        return (
          <Link key={aba.href} href={aba.href}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              ativa
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            )}>
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
