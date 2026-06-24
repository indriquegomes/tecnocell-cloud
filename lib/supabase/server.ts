import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Service client usa service role key — bypassa RLS completamente.
// A RPC finalizar_venda é SECURITY DEFINER e NÃO usa auth.uid(), então não
// precisa de sessão do usuário. Não usa cookies (vêm vazios em server actions).
export async function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return [] }, setAll() {} },
    }
  )
}

// Valida que há sessão ativa. Chamar no INÍCIO de cada server action de escrita.
//
// Em produção (Vercel) cookies() vem VAZIO dentro de server actions, então a
// fonte confiável é o accessToken que o cliente lê do navegador (cookie httpOnly:false)
// e envia explicitamente. Validamos esse token via getUser(token).
// Fallbacks (header do proxy / cookies) cobrem chamadas que ainda não passam token.
export async function requireAuth(accessToken?: string): Promise<{ id: string; email: string | null }> {
  if (accessToken) {
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )
    const { data: { user }, error } = await client.auth.getUser(accessToken)
    if (user) return { id: user.id, email: user.email ?? null }
    throw new Error(`Sessão inválida ou expirada. Recarregue a página (F5). [${error?.message ?? 'sem usuário'}]`)
  }

  const h = await headers()
  const userId = h.get('x-user-id')
  if (userId) return { id: userId, email: h.get('x-user-email') }

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) throw new Error(error?.message ?? 'Não autorizado')
  return { id: user.id, email: user.email ?? null }
}
