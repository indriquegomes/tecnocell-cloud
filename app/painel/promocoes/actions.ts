'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function criarPromocao(formData: FormData) {
  const supabase = await createServiceClient()

  const { error } = await supabase.from('promocoes').insert({
    nome: formData.get('nome') as string,
    tipo: formData.get('tipo') as string,
    valor: parseFloat(formData.get('valor') as string) || 0,
    data_inicio: formData.get('data_inicio') as string || null,
    data_fim: formData.get('data_fim') as string || null,
    descricao: formData.get('descricao') as string || null,
    ativa: true,
  })

  if (error) redirect(`/painel/promocoes?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/promocoes')
  redirect('/painel/promocoes?ok=1')
}

export async function togglePromocao(id: string, ativa: boolean) {
  const supabase = await createServiceClient()
  await supabase.from('promocoes').update({ ativa: !ativa }).eq('id', id)
  revalidatePath('/painel/promocoes')
  redirect('/painel/promocoes')
}

export async function deletarPromocao(id: string) {
  const supabase = await createServiceClient()
  await supabase.from('promocoes').delete().eq('id', id)
  revalidatePath('/painel/promocoes')
  redirect('/painel/promocoes')
}
