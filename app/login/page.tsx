export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; next?: string }>
}) {
  const { erro, next } = await searchParams

  return (
    <div className="flex min-h-screen">
      {/* Lado da marca — card TecnoCell (recriado: bolinha laranja + onda + logo) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[#1B6CA8] lg:block xl:w-3/5">
        <div className="absolute -left-24 -top-24 h-60 w-60 rounded-full bg-[#F47920]" />
        <div className="absolute inset-x-0 top-0 flex flex-col justify-center px-14" style={{ height: 'calc(100% - 130px)' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/55">Sistema interno</p>
          <h1 className="mt-4 text-[40px] font-extrabold leading-[1.08] tracking-tight text-white">Gestão da loja,<br />num lugar só.</h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">PDV, estoque, clientes, preços e financeiro — rápido e do jeito da TecnoCell.</p>
        </div>
        {/* onda branca */}
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 600 130" preserveAspectRatio="none" style={{ height: 130 }}>
          <path d="M0,72 C170,18 360,112 600,50 L600,130 L0,130 Z" fill="#fff" />
        </svg>
        {/* logo na onda */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tecnocell-icon.png" alt="TecnoCell" className="absolute bottom-6 right-12 h-14 w-14 object-contain" />
      </div>

      {/* Lado do formulário */}
      <div className="flex w-full items-center justify-center bg-gray-50 px-5 lg:w-1/2 xl:w-2/5">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tecnocell-icon.png" alt="TecnoCell" className="h-16 w-16 object-contain" />
            <div>
              <p className="text-xl font-bold tracking-wide text-[#1B6CA8]">Cloud</p>
              <p className="mt-0.5 text-xs text-gray-400">Área de funcionários</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Entrar</h2>
          <p className="mt-1 mb-6 text-sm text-gray-500">Acesse com seu e-mail e senha.</p>

          <form action="/api/auth/login" method="POST" className="space-y-4">
            {next && <input type="hidden" name="next" value={next} />}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">E-mail</label>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm transition focus:border-[#1B6CA8] focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30"
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
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm transition focus:border-[#1B6CA8] focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]/30"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-[#1B6CA8] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#155a8f] active:scale-[.99]"
            >
              Entrar no painel
            </button>
          </form>

          <p className="mt-6 text-xs text-gray-400">
            Apenas funcionários autorizados. Para acesso, fale com o administrador.
          </p>
          <p className="mt-4 text-sm text-gray-500">
</p>
        </div>
      </div>
    </div>
  )
}
