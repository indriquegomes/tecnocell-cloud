export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const { erro } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-transparent.png" alt="TecnoCell Cloud" className="mx-auto mb-2 h-14 w-auto object-contain" />
            <p className="mt-1 text-sm text-gray-500">Área de funcionários</p>
          </div>

          <form action="/api/auth/login" method="post" className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">E-mail</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="funcionario@tecnocell.com.br"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha</label>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
            >
              Entrar no Painel
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            Apenas funcionários autorizados. Para acesso, contate o administrador.
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          ← <a href="/" className="text-blue-500 hover:underline">Voltar ao catálogo</a>
        </p>
      </div>
    </div>
  )
}
