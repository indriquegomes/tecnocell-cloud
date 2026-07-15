'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Barra de abas do módulo Estoque — fica em TODAS as telas do estoque (via
// layout), então dá pra navegar e sempre voltar. Antes eram botões soltos no
// canto que só apareciam na tela Estoque: quem entrava em "Entre Depósitos"
// ficava sem volta (reclamação do Vitor).
//
// Dois grupos pra ficar organizado: ANALISAR (o dia a dia da estoquista) e
// GERIR (as ferramentas). A ação principal "+ Entrada/Saída" fica destacada.

const ANALISAR = [
  { href: '/painel/estoque', label: 'Estoque', exact: true },
  { href: '/painel/estoque/historico', label: 'Movimentações' },
  { href: '/painel/estoque/reposicao', label: 'Reposição' },
]
const GERIR = [
  { href: '/painel/estoque/transferencias', label: 'Transferências' },
  { href: '/painel/estoque/imeis', label: 'Aparelhos' },
  { href: '/painel/estoque/marcas', label: 'Marcas' },
  { href: '/painel/estoque/etiquetas', label: 'Etiquetas' },
]

export function EstoqueNav() {
  const path = usePathname()
  const ativo = (a: { href: string; exact?: boolean }) => (a.exact ? path === a.href : path.startsWith(a.href))

  const Aba = (a: { href: string; label: string; exact?: boolean }) => (
    <Link
      key={a.href}
      href={a.href}
      className={cn(
        '-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2.5 text-sm font-semibold transition',
        ativo(a)
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800',
      )}
    >
      {a.label}
    </Link>
  )

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
      {ANALISAR.map(Aba)}
      <span className="mx-1 h-5 w-px shrink-0 self-center bg-gray-200" />
      {GERIR.map(Aba)}
      <Link
        href="/painel/estoque/movimentar"
        className="ml-auto mb-1 shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
      >
        + Entrada / Saída
      </Link>
    </div>
  )
}
