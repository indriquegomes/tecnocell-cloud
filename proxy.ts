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
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // Atualiza sessão (necessário para SSR do Supabase)
  const { data: { session } } = await supabase.auth.getSession()

  // Protege /painel — redireciona para login se não autenticado
  if (request.nextUrl.pathname.startsWith('/painel') && !session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Se já logado e tenta acessar /login, vai para o painel
  if (request.nextUrl.pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/painel', request.url))
  }

  return response
}

export const config = {
  matcher: ['/painel/:path*', '/login'],
}
