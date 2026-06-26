import { createServiceClient } from '@/lib/supabase/server'
import { UsuariosClient } from './UsuariosClient'

export default async function UsuariosPage() {
  const supabase = await createServiceClient()

  // Lista usuários do Auth + perfis
  const [authResult, perfisResult] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('perfis').select('id, nome, permissoes, is_master, ativo, created_at'),
  ])

  const authUsers = authResult.data?.users ?? []
  const perfisMap = Object.fromEntries(
    (perfisResult.data ?? []).map((p) => [p.id, p])
  )

  const usuarios = authUsers
    .filter((u) => perfisMap[u.id])
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
      nome: perfisMap[u.id]?.nome ?? u.email ?? '',
      permissoes: (perfisMap[u.id]?.permissoes ?? []) as string[],
      isMaster: perfisMap[u.id]?.is_master ?? false,
      ativo: perfisMap[u.id]?.ativo ?? true,
      created_at: u.created_at,
    }))

  return <UsuariosClient usuarios={usuarios} />
}
