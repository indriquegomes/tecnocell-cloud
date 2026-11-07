import Link from 'next/link'

// 404 amigável — antes caía na tela padrão do Next, em inglês
// ("This page could not be found."), que não diz nada para quem usa a loja.
// Este arquivo vale para endereços fora do painel; dentro do painel use
// app/painel/not-found.tsx (mantém o menu lateral).
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl">🔎</p>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Esta página não existe</h1>
        <p className="mt-2 text-sm text-gray-500">
          O endereço pode estar errado ou o que você procurava foi removido.
        </p>
        <Link
          href="/painel"
          className="mt-6 inline-block rounded-xl bg-[#1B6CA8] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#155a8f]"
        >
          Ir para o painel
        </Link>
      </div>
    </div>
  )
}
