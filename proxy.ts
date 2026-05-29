import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  // Cria resposta mutável para poder atualizar cookies
  let response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet) {
          // Atualiza cookies na request E na response
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: new Headers(request.headers) } })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Valida e renova o token (único ponto de auth em toda a app)
  const { data: { user } } = await supabase.auth.getUser()

  // Não autenticado em rota protegida → redireciona para login
  if (!user && request.nextUrl.pathname.startsWith('/painel')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Passa email para o layout via header (sem precisar chamar Supabase de novo)
  if (user?.email) {
    response.headers.set('x-user-email', user.email)
  }

  return response
}

export const config = {
  matcher: ['/painel/:path*', '/login'],
}
