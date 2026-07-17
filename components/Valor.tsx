import type { ReactNode } from 'react'

// Envolve um número em dinheiro pra que o botão "olho" (OcultarValores) consiga
// borrá-lo. Não muda nada visualmente quando o modo esconder está desligado.
// Uso: <Valor>{formatBRL(x)}</Valor>  ou  className extra se precisar.
export function Valor({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`tc-sensivel ${className}`.trim()}>{children}</span>
}
