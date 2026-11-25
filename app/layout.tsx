import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { RegistrarSW } from '@/components/RegistrarSW'
import { MonitorErros } from '@/components/MonitorErros'

// Fonte do sistema — Plus Jakarta Sans (variável, self-hosted pelo next/font =
// zero request externo, sem layout shift). Exposta como --font-sans p/ o globals.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'TecnoCell Cloud — Smartphones e Acessórios',
  description: 'TecnoCell Cloud — Petrópolis e Teresópolis. Smartphones, acessórios e eletrônicos.',
  // PWA: deixa instalar como app (janela própria, ícone na barra, abre no PDV)
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'TecnoCell', statusBarStyle: 'default' },
  icons: { icon: '/tecnocell-icon.png', apple: '/tecnocell-icon.png' },
}

export const viewport = {
  themeColor: '#1B6CA8',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // suppressHydrationWarning no <html>: o script anti-piscada do "esconder valores"
  // (components/OcultarValores.tsx) adiciona a classe tc-ocultar-valores no <html>
  // ANTES do React hidratar. Sem isto, o React acusa mismatch de className.
  return (
    <html lang="pt-BR" className={`h-full ${jakarta.variable}`} suppressHydrationWarning>
      <body className="min-h-full bg-gray-50 antialiased">
        <RegistrarSW />
        {/* Escuta erro fora do React em qualquer tela (painel, login, loja).
            Montar no layout raiz cobre tudo uma vez só — montar também no painel
            duplicaria o listener. */}
        <MonitorErros />
        {children}
      </body>
    </html>
  )
}
