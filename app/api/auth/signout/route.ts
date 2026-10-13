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
  // Segurança: ao deslogar, trava o acesso (não-master). O master precisa liberar
  // pra entrar de novo — evita que alguém pegue a senha e entre sem autorização.
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  if (user?.id) {
    const service = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )
    const { data: perf } = await service.from('perfis').select('is_master, username').eq('id', user.id).maybeSingle()
    const p = perf as { is_master?: boolean | null; username?: string | null } | null
    // Só trava o login de "visitante" (conta compartilhada). Funcionários normais entram/saem livres.
    if (!p?.is_master && p?.username === 'visitante') {
      await service.from('perfis').update({ login_bloqueado: true }).eq('id', user.id)
    }
  }
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
