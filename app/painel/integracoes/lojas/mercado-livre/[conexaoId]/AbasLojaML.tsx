'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function AbasLojaML({ conexaoId }: { conexaoId: string }) {
  const base = `/painel/integracoes/lojas/mercado-livre/${conexaoId}`
  const ABAS = [
    { href: base,                label: 'Dashboard' },
    { href: `${base}/anuncios`,  label: 'Meus Anúncios' },
    { href: `${base}/vendas`,    label: 'Minhas Vendas' },
    { href: `${base}/perguntas`, label: 'Perguntas e Respostas' },
    { href: `${base}/mensagens`, label: 'Mensagens' },
    { href: `${base}/catalogo`,  label: 'Anúncios do Catálogo' },
  ]
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {ABAS.map((aba) => {
        const ativa = aba.href === base ? pathname === aba.href : pathname.startsWith(aba.href)
        return (
          <Link key={aba.href} href={aba.href}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              ativa ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            )}>
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
