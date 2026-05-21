'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function salvarConfiguracoes(formData: FormData) {
  const supabase = await createServiceClient()

  const valor = {
    nome_empresa: formData.get('nome_empresa') as string,
    cnpj: formData.get('cnpj') as string,
    telefone: formData.get('telefone') as string,
    endereco: formData.get('endereco') as string,
    cidade: formData.get('cidade') as string,
    estado: formData.get('estado') as string,
    site: formData.get('site') as string,
    moeda: formData.get('moeda') as string,
    timezone: formData.get('timezone') as string,
  }

  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave: 'empresa', valor }, { onConflict: 'chave' })

  if (error) redirect(`/painel/configuracoes?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/configuracoes')
  redirect('/painel/configuracoes?ok=1')
}
