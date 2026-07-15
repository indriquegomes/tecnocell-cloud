import { EstoqueNav } from '@/components/EstoqueNav'

// Layout do módulo Estoque: a barra de abas aparece em TODAS as sub-telas
// (Estoque, Movimentações, Reposição, Transferências, Aparelhos, Marcas,
// Etiquetas, + Entrada/Saída) — navegação consistente e sempre com volta.
export default function EstoqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <EstoqueNav />
      {children}
    </div>
  )
}
