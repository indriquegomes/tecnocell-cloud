import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tecnocell — Acesso do cliente',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-[#f8fbfd] px-5 py-8" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,87,119,.055) .8px, transparent 0)', backgroundSize: '7px 7px' }}>
    <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_12px_40px_-24px_rgba(0,87,119,.3)]">
      <header className="relative flex h-32 items-center overflow-hidden bg-[#005777] px-7">
        <div aria-hidden="true" className="absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/10 bg-white/5" />
        <div aria-hidden="true" className="absolute -bottom-32 right-4 h-52 w-52 rounded-full border border-orange-200/15" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tecnocell-app-simbolo.png" alt="" className="absolute -right-7 -top-8 h-52 w-52 object-contain opacity-20 brightness-150" />
        <div aria-hidden="true" className="absolute bottom-0 left-7 h-1 w-10 rounded-t-full bg-[#ff7a18]" />
      </header>
      <div className="px-7 pb-7 pt-7">{children}</div>
    </section>
  </main>
}
