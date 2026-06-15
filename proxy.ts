import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet, headers) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value)
            )
          }
        },
      },
    }
  )

  // getSession() renova o token via cookies — sem chamada de rede quando válido
  const { data: { session } } = await supabase.auth.getSession()

  // Rota protegida sem sessão → login
  if (!session && request.nextUrl.pathname.startsWith('/painel')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session?.user?.email) {
    response.headers.set('x-user-email', session.user.email)
  }

  return response
}

export const config = {
  matcher: ['/painel/:path*', '/login'],
}
