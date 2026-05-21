import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TecnoCell Cloud — Smartphones e Acessórios',
  description: 'TecnoCell Cloud — Petrópolis e Teresópolis. Smartphones, acessórios e eletrônicos.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
