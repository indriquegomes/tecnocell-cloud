import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16: o antigo "middleware" agora chama-se "proxy" (mesma função).
// Doc: deve fazer apenas "optimistic checks" — nada de auth pesada aqui.
// A autorização real fica no requireAuth() das server actions + RLS.
export async function proxy(request: NextRequest) {
  // Headers de REQUEST repassados ao downstream (server components / actions).
  // É por AQUI que x-user-id chega no requireAuth() — header de RESPONSE não chega
  // em server actions nesta versão do Next.
  const requestHeaders = new Headers(request.headers)
  const cookiesParaResposta: { name: string; value: string; options?: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          cookiesToSet.forEach((c) => cookiesParaResposta.push(c))
        },
      },
    }
  )

  // getUser() renova o token se expirado. Verificamos o 'error' antes de redirecionar:
  // se falhar por rede/timeout retorna { user: null, error } SEM lançar. Só mandamos
  // pro login quando !error && !user (certeza de que não há sessão).
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!authError && !user && request.nextUrl.pathname.startsWith('/painel')) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Injeta a identidade validada nos headers de request (downstream lê via headers()).
  if (user) {
    requestHeaders.set('x-user-id', user.id)
    if (user.email) requestHeaders.set('x-user-email', user.email)
  }

  // Constrói a response UMA vez, já com os headers de request atualizados e os
  // cookies renovados pelo setAll (sem perder nenhum dos dois).
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  cookiesParaResposta.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  )
  if (user) {
    response.headers.set('x-user-id', user.id)
    if (user.email) response.headers.set('x-user-email', user.email)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
