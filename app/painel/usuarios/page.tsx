import { createServiceClient } from '@/lib/supabase/server'
import { UsuariosClient } from './UsuariosClient'

export default async function UsuariosPage() {
  const supabase = await createServiceClient()

  // Lista usuários do Auth + perfis
  const [authResult, perfisResult] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase.from('perfis').select('id, nome, cargo, permissoes, ativo, created_at'),
  ])

  const authUsers = authResult.data?.users ?? []
  const perfisMap = Object.fromEntries(
    (perfisResult.data ?? []).map((p) => [p.id, p])
  )

  const usuarios = authUsers
    .filter((u) => perfisMap[u.id]) // só exibe quem tem perfil cadastrado
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
      nome: perfisMap[u.id]?.nome ?? u.email ?? '',
      cargo: (perfisMap[u.id]?.cargo ?? 'vendedor') as 'dono' | 'gerente' | 'vendedor',
      permissoes: perfisMap[u.id]?.permissoes ?? [],
      ativo: perfisMap[u.id]?.ativo ?? true,
      created_at: u.created_at,
    }))

  return <UsuariosClient usuarios={usuarios} />
}
