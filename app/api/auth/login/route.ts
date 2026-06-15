import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Pré-cria a response 303 para que setAll grave os cookies diretamente nela.
  // Não usamos cookies() de next/headers porque o Next.js não mescla cookies
  // de next/headers em respostas customizadas (NextResponse.redirect) em produção.
  let response = NextResponse.redirect(new URL('/painel', request.url), 303)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet, headers) {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          if (headers) {
            Object.entries(headers).forEach(([key, val]) =>
              response.headers.set(key, val)
            )
          }
        },
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?erro=${encodeURIComponent('E-mail ou senha incorretos.')}`, request.url)
    )
  }

  return response
}
