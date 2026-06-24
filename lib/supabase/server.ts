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
// Mantém cookies para que auth.uid() funcione dentro das RPCs (finalizar_venda etc.)
export async function createServiceClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

// Valida que há sessão ativa. Chamar no INÍCIO de cada server action de escrita.
// O proxy (proxy.ts) já validou a sessão e injetou x-user-id no header — lemos
// dali porque cookies() vem VAZIO dentro de server actions nesta versão do Next.
// Mantemos um fallback por cookie para o caso (raro) do header não chegar.
export async function requireAuth(): Promise<{ id: string; email: string | null }> {
  const h = await headers()
  const userId = h.get('x-user-id')
  if (userId) {
    return { id: userId, email: h.get('x-user-email') }
  }

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
