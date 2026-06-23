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

  // getUser() contacta o Supabase Auth para validar + renovar o token se expirado.
  // Sem isso, getSession() retorna null após 1h (JWT expira) e desloga o usuário.
  // try/catch: se der timeout de rede no proxy, deixa passar — a page/action
  // vai lidar com auth via requireAuth() e não vai expor dados.
  let user: { email?: string } | null = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return response
  }

  if (!user && request.nextUrl.pathname.startsWith('/painel')) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (user?.email) {
    response.headers.set('x-user-email', user.email)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
