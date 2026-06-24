import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// IMPORTANTE: signout SÓ por POST. Se fosse GET, o Next.js fazia PREFETCH do link
// "Sair" ao carregar o painel e DESLOGAVA o usuário sozinho em <1s (bug que quebrou
// todas as vendas em 2026-06-24). Prefetch usa GET; um route só-POST nunca é disparado.
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/login', request.url), 303)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  await supabase.auth.signOut()
  return response
}
