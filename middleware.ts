import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  // getUser() validates the JWT against the Supabase server and triggers
  // a token refresh (via setAll) when the access token is near expiry.
  const { data: { user }, error } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/painel')) {
    // Transient network error reaching Supabase — don't redirect to avoid false logouts
    if (error) return response
    // Confirmed no session: redirect to login, carrying any Set-Cookie headers
    // that setAll may have written (e.g. from a partial token refresh attempt)
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
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
