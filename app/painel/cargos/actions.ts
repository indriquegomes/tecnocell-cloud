'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { TODAS_PERMISSOES } from '@/lib/permissoes'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

const KEYS: string[] = TODAS_PERMISSOES.map((p) => p.key)

function campos(fd: FormData) {
  const isMaster = fd.getAll('is_master').includes('1')
  const perms = (fd.getAll('permissoes') as string[]).filter((k) => KEYS.includes(k))
  return {
    nome: (fd.get('nome') as string)?.trim(),
    is_master: isMaster,
    permissoes: isMaster ? KEYS : perms,
  }
}

export async function criarCargo(fd: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const c = campos(fd)
  if (!c.nome) redirect(`/painel/cargos?erro=${encodeURIComponent('Nome obrigatório')}`)
  const { data: ex } = await supabase.from('cargos').select('id').ilike('nome', c.nome).maybeSingle()
  if (ex) redirect(`/painel/cargos?erro=${encodeURIComponent('Já existe um cargo com esse nome.')}`)
  const { error } = await supabase.from('cargos').insert({ ...c, ativo: true })
  if (error) redirect(`/painel/cargos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/cargos')
  redirect('/painel/cargos')
}

export async function editarCargo(id: string, fd: FormData) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const c = campos(fd)
  const { data: ex } = await supabase.from('cargos').select('id').ilike('nome', c.nome).neq('id', id).maybeSingle()
  if (ex) redirect(`/painel/cargos?editar=${id}&erro=${encodeURIComponent('Já existe outro cargo com esse nome.')}`)
  // checkbox + hidden com mesmo name: fd.get pega sempre o hidden ('0'). Usar getAll().includes('1')
  const { error } = await supabase.from('cargos').update({ ...c, ativo: fd.getAll('ativo').includes('1') }).eq('id', id)
  if (error) redirect(`/painel/cargos?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/cargos')
  revalidatePath('/painel/usuarios')
  redirect('/painel/cargos')
}

export async function deletarCargo(id: string) {
  await requirePermissao('usuarios')
  const supabase = await createServiceClient()
  const { count } = await supabase.from('perfis').select('id', { count: 'exact', head: true }).eq('cargo_id', id)
  if ((count ?? 0) > 0) {
    redirect(`/painel/cargos?erro=${encodeURIComponent(`Este cargo tem ${count} usuário(s). Troque o cargo deles antes de excluir.`)}`)
  }
  const { error } = await supabase.from('cargos').delete().eq('id', id)
  if (error) redirect(`/painel/cargos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/cargos')
}
