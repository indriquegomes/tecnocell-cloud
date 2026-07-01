import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// O botão "Sair" usa POST (form). O GET só é aceito em navegação REAL — ex.: o
// layout redireciona uma conta desativada pra cá. Prefetch (que usa GET) é
// BLOQUEADO: senão o Next.js prefetcharia um link de logout e deslogaria o
// usuário sozinho (bug que quebrou as vendas em 2026-06-24).
async function fazerLogout(request: NextRequest) {
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

export async function POST(request: NextRequest) {
  return fazerLogout(request)
}

export async function GET(request: NextRequest) {
  const prefetch = request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch'
  if (prefetch) return new NextResponse(null, { status: 405 })
  return fazerLogout(request)
}
