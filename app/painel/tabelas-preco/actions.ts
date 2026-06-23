'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarTabela(formData: FormData) {
  await requireAuth()
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
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('tabelas_preco').delete().eq('id', id)
  revalidatePath('/painel/tabelas-preco')
  redirect('/painel/tabelas-preco')
}

export async function adicionarItemTabela(tabelaId: string, formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()

  const { error } = await supabase.from('itens_tabela_preco').insert({
    tabela_id: tabelaId,
    produto_id: formData.get('produto_id') as string,
    preco: parseFloat(formData.get('preco') as string) || 0,
  })

  if (error) redirect(`/painel/tabelas-preco/${tabelaId}?erro=${encodeURIComponent(error.message)}`)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  redirect(`/painel/tabelas-preco/${tabelaId}`)
}

export async function removerItemTabela(id: string, tabelaId: string) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('itens_tabela_preco').delete().eq('id', id)
  revalidatePath(`/painel/tabelas-preco/${tabelaId}`)
  redirect(`/painel/tabelas-preco/${tabelaId}`)
}
