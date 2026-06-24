import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

function resolveMaxAge(sessaoTipo: string | undefined): number | undefined {
  if (sessaoTipo === 'computador') return 30 * 24 * 60 * 60  // 30 dias
  if (sessaoTipo === 'chrome')     return  7 * 24 * 60 * 60  //  7 dias
  return undefined  // session cookie — expira ao fechar o navegador
}

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
            const sessaoTipo = cookieStore.get('sessao_tipo')?.value
            const maxAge = resolveMaxAge(sessaoTipo)
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, maxAge !== undefined
                ? { ...options, maxAge }
                : { ...options, maxAge: undefined, expires: undefined }
              )
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

// Valida que há sessão ativa. Chamar no INÍCIO de cada server action
// de escrita (mutação). Lança se não houver usuário autenticado.
// NÃO usar em Server Components de página (use o middleware p/ isso).
export async function requireAuth() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          // Em Server Actions os cookies são mutáveis — renova o token se expirado
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
  if (error || !user) throw new Error('Não autorizado')
  return user
}
