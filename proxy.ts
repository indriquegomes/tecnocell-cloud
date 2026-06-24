import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js 16: o antigo "middleware" agora chama-se "proxy" (mesma função).
// Doc: deve fazer apenas "optimistic checks" — nada de auth pesada aqui.
// A autorização real fica no requireAuth() das server actions + RLS.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() renova o token se expirado (necessário para não deslogar após 1h).
  // Verificamos o 'error' antes de redirecionar: se getUser() falhou por problema
  // de rede/timeout, ele retorna { user: null, error: AuthApiError } SEM lançar —
  // o try/catch não pega isso. Só redirecionamos pro login quando !error && !user
  // (i.e., temos certeza que não há sessão, não apenas falha de rede).
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (!authError && !user && request.nextUrl.pathname.startsWith('/painel')) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Passa a identidade já validada pelo proxy para os server components/actions.
  // Necessário porque, nesta versão do Next, cookies() vem VAZIO dentro de
  // server actions — então requireAuth() não consegue reler a sessão lá.
  if (user) {
    if (user.email) response.headers.set('x-user-email', user.email)
    response.headers.set('x-user-id', user.id)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
