'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function toggleCatalogo(id: string, visivel: boolean) {
  await requireAuth()
  const supabase = await createServiceClient()
  await supabase.from('produtos').update({ visivel_catalogo: !visivel }).eq('id', id)
  revalidatePath('/painel/catalogo')
  redirect('/painel/catalogo')
}

export async function salvarDescricaoCatalogo(formData: FormData) {
  await requireAuth()
  const supabase = await createServiceClient()
  const id = formData.get('id') as string
  const { error } = await supabase
    .from('produtos')
    .update({
      descricao: formData.get('descricao') as string,
      imagem_url: formData.get('imagem_url') as string || null,
    })
    .eq('id', id)
  if (error) redirect(`/painel/catalogo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/catalogo')
  redirect('/painel/catalogo?ok=1')
}
