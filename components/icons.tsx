import type { SVGProps } from 'react'

// Ícones Lucide (lucide.dev, licença ISC — livre pra uso comercial) INLINE como
// SVG. Zero dependência de runtime: só o path data copiado. Herdam a cor via
// `currentColor` (é só setar text-* no elemento) e o tamanho via className (h-* w-*).
function Base({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden {...p}
    >
      {children}
    </svg>
  )
}

export const IconCart = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></Base>
)
export const IconPackage = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></Base>
)
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Base>
)
export const IconWallet = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1v3" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></Base>
)
