import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-5 py-10 text-base leading-7 text-slate-700">
    <header className="mb-8 border-b border-slate-200 pb-6">
      <p className="text-sm font-semibold text-amber-800">Ambiente separado de homologação</p>
      <p className="mt-2 text-2xl font-bold text-[#005777]">Tecnocell Teste</p>
      <nav aria-label="Privacidade e conta" className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[#005777] underline underline-offset-4">
        <Link className="inline-flex min-h-11 items-center" href="/privacidade">Privacidade</Link>
        <Link className="inline-flex min-h-11 items-center" href="/excluir-conta">Solicitar exclusão da conta</Link>
      </nav>
    </header>
    <article className="space-y-6 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:text-[#005777] [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_a]:break-words [&_a]:text-[#005777] [&_a]:underline [&_a]:underline-offset-4">
      {children}
    </article>
    <footer className="mt-10 border-t border-slate-200 pt-6 text-sm">
      <p>Tecnocell Corp · Tecnocell Teste</p>
      <p>Contato: <a className="break-words text-[#005777] underline" href="mailto:tecnocellcorporation@gmail.com">tecnocellcorporation@gmail.com</a></p>
    </footer>
  </main>
}
