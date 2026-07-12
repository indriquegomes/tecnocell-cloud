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

// --- Ícones da sidebar (Lucide, ISC) ---
export const IconDashboard = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></Base>
)
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></Base>
)
export const IconCalculator = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect width="16" height="20" x="4" y="2" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01" /><path d="M12 10h.01" /><path d="M16 10h.01" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /></Base>
)
export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></Base>
)
export const IconClipboard = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></Base>
)
export const IconReturn = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Base>
)
export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></Base>
)
export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></Base>
)
export const IconWrench = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Base>
)
export const IconSwap = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></Base>
)
export const IconBank = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" /></Base>
)
export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></Base>
)
export const IconCard = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></Base>
)
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></Base>
)
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></Base>
)
export const IconStore = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M2 7l1.5-4.5A1 1 0 0 1 4.44 2h15.12a1 1 0 0 1 .94.66L22 7" /><path d="M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7" /><path d="M2 7h20" /><path d="M9 21v-6h6v6" /></Base>
)
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Base>
)
