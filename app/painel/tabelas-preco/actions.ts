'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarTabela(formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const { error } = await supabase.from('tabelas_preco').insert({
    nome: formData.get('nome') as string,
    descricao: formData.get('descricao') as string || null,
    ativa: true,
  })

  if (error) redirect(`/painel/tabelas-preco?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/tabelas-preco')
  redirect('/painel/tabelas-preco?ok=1')
}

export async function deletarTabela(id: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('tabelas_preco').delete().eq('id', id)
  revalidatePath('/painel/tabelas-preco')
  redirect('/painel/tabelas-preco')
}

export async function adicionarItemTabela(tabelaId: string, formData: FormData) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const { error } = await supabase.from('itens_tabela_preco').insert({
    tabela_id: tabelaId,
    produto_id: formData.get('produto_id') as string,
    preco: parseFloat(formData.get('preco') as string) || 0,
  })

  if (error) return { error: error.message }
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  return { ok: true }
}

export async function removerItemTabela(id: string, tabelaId: string) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('itens_tabela_preco').delete().eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  redirect(`/painel/tabelas-preco/${tabelaId}`)
}

export async function atualizarPrecoItem(id: string, tabelaId: string, preco: number) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  const { error } = await supabase
    .from('itens_tabela_preco')
    .update({ preco })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
}

export async function importarTodosComMultiplicador(tabelaId: string, multiplicador: number) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()

  const [{ data: produtos }, { data: jaExistem }] = await Promise.all([
    supabase.from('produtos').select('id, preco').not('preco', 'is', null),
    supabase.from('itens_tabela_preco').select('produto_id').eq('tabela_id', tabelaId),
  ])

  const jaSet = new Set((jaExistem ?? []).map((i) => i.produto_id))
  const novos = (produtos ?? [])
    .filter((p) => !jaSet.has(p.id) && (p.preco ?? 0) > 0)
    .map((p) => ({
      tabela_id: tabelaId,
      produto_id: p.id,
      preco: Math.round((p.preco! * multiplicador) * 100) / 100,
    }))

  if (novos.length > 0) {
    const { error } = await supabase.from('itens_tabela_preco').insert(novos)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  return novos.length
}

export async function toggleTabela(id: string, ativa: boolean) {
  await requirePermissao('produtos')
  const supabase = await createServiceClient()
  await supabase.from('tabelas_preco').update({ ativa }).eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${id}`)
  revalidatePath('/painel/tabelas-preco')
}
