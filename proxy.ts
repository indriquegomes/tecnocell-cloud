import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  const { data: { user }, error } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/painel')) {
    // Erro de rede com cookie de sessão presente → não desloga (falha transitória)
    const temSessao = request.cookies.getAll().some(c => c.name.startsWith('sb-'))
    if (error && temSessao) return response

    // Sem sessão confirmada → redireciona pro login, voltando pra página original
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('next', request.nextUrl.pathname)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach(({ name, value, ...opts }) =>
      redirectResponse.cookies.set(name, value, opts)
    )
    return redirectResponse
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
