import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { temPermissao } from '@/lib/permissoes'

export type Efetivas = { permissoes: string[]; isMaster: boolean; ativo: boolean }

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

// Permissões EFETIVAS do usuário. Cargo dinâmico (modelo Discord): se o perfil
// tem cargo_id, as permissões vêm do CARGO (mudou o cargo → todos mudam junto).
// Sem cargo (ou cargo inativo), usa as permissões individuais do perfil.
export async function permissoesEfetivas(
  userId: string
): Promise<{ permissoes: string[]; isMaster: boolean; ativo: boolean }> {
  const service = await createServiceClient()
  // base do perfil (sem cargo_id, pra não quebrar caso a migration ainda não tenha rodado)
  const { data: perfil } = await service
    .from('perfis')
    .select('permissoes, is_master, ativo')
    .eq('id', userId)
    .maybeSingle()
  if (!perfil) return { permissoes: [], isMaster: false, ativo: false }
  const base = { permissoes: perfil.permissoes ?? [], isMaster: perfil.is_master ?? false, ativo: perfil.ativo !== false }

  // cargo dinâmico — query separada e tolerante (se a coluna/tabela não existir, ignora)
  try {
    const { data: pc } = await service.from('perfis').select('cargo_id').eq('id', userId).maybeSingle()
    const cargoId = (pc as { cargo_id?: string | null } | null)?.cargo_id
    if (cargoId) {
      const { data: cargo } = await service.from('cargos').select('permissoes, is_master, ativo').eq('id', cargoId).maybeSingle()
      if (cargo && cargo.ativo !== false) {
        return { permissoes: cargo.permissoes ?? [], isMaster: cargo.is_master ?? false, ativo: base.ativo }
      }
    }
  } catch { /* coluna/tabela ainda não existe — usa as permissões individuais */ }

  return base
}

// Permissões efetivas do usuário logado a partir do header do proxy (x-user-id).
// Uso em PÁGINAS (server components) pra esconder campos que a pessoa não pode ver.
export async function permissoesUsuarioAtual(): Promise<Efetivas> {
  const h = await headers()
  const userId = h.get('x-user-id')
  if (!userId) return { permissoes: [], isMaster: false, ativo: true }
  return permissoesEfetivas(userId)
}

// Checa se o usuário (por accessToken/header) pode uma ação específica. Retorna bool
// em vez de lançar — pra usar dentro de actions que já validaram o módulo principal.
export async function podeAcao(key: string, accessToken?: string): Promise<boolean> {
  try {
    const usuario = await requireAuth(accessToken)
    const { permissoes, isMaster } = await permissoesEfetivas(usuario.id)
    return temPermissao(permissoes, key, isMaster)
  } catch {
    return false
  }
}

// Config de restrição de acesso (horário/dias). Tolerante: se a migration
// 2026-07-29 não rodou, devolve tudo liberado.
export async function configAcesso(userId: string): Promise<import('@/lib/acesso').AcessoConfig> {
  const vazio = { horaInicio: null, horaFim: null, bloqSabado: false, bloqDomingo: false, bloqFeriado: false }
  try {
    const service = await createServiceClient()
    const { data } = await service.from('perfis')
      .select('acesso_hora_inicio, acesso_hora_fim, acesso_bloqueia_sabado, acesso_bloqueia_domingo, acesso_bloqueia_feriado')
      .eq('id', userId).maybeSingle()
    if (!data) return vazio
    return {
      horaInicio: data.acesso_hora_inicio ?? null,
      horaFim: data.acesso_hora_fim ?? null,
      bloqSabado: data.acesso_bloqueia_sabado ?? false,
      bloqDomingo: data.acesso_bloqueia_domingo ?? false,
      bloqFeriado: data.acesso_bloqueia_feriado ?? false,
    }
  } catch { return vazio }
}

// Valida sessão E permissão. As server actions NÃO passam pelo layout do painel,
// então sem isto dá pra chamar a action direto via POST sem ter acesso ao módulo.
export async function requirePermissao(
  key: string,
  accessToken?: string
): Promise<{ id: string; email: string | null }> {
  const usuario = await requireAuth(accessToken)
  const { permissoes, isMaster, ativo } = await permissoesEfetivas(usuario.id)
  if (!ativo) throw new Error('Conta sem acesso.')
  if (!temPermissao(permissoes, key, isMaster)) {
    throw new Error('Sem permissão para esta ação.')
  }
  return usuario
}
