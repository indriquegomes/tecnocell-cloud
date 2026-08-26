'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

function extrairCampos(formData: FormData) {
  return {
    nome:        formData.get('nome') as string,
    loja_id:     (formData.get('loja_id') as string) || null,   // loja a que o depósito pertence
    descricao:   (formData.get('descricao') as string) || null,
    responsavel: (formData.get('responsavel') as string) || null,
    telefone:    (formData.get('telefone') as string) || null,
    email:       (formData.get('email') as string) || null,
    cep:         (formData.get('cep') as string) || null,
    cidade:      (formData.get('cidade') as string) || null,
    uf:          (formData.get('uf') as string) || null,
    ativo:       formData.get('ativo') !== 'false',
  }
}

export async function criarDeposito(formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').insert({ id: crypto.randomUUID(), ...extrairCampos(formData) })
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  revalidateTag('depositos', 'max')
  redirect(`/painel/depositos?ok=${Date.now()}`)
}

export async function editarDeposito(id: string, formData: FormData) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').update(extrairCampos(formData)).eq('id', id)
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  revalidateTag('depositos', 'max')
  redirect(`/painel/depositos?ok=${Date.now()}`)
}

export async function deletarDeposito(id: string) {
  await requirePermissao('estoque')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('depositos').delete().eq('id', id)
  // redirect (não throw): mesmo bug de produtos/financeiro — BotaoExcluir é
  // um <form action> por baixo, throw derruba a tela inteira.
  if (error) redirect(`/painel/depositos?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/depositos')
  revalidateTag('depositos', 'max')
}
