'use server'

import { createServiceClient, requireAuth } from '@/lib/supabase/server'

type State = { ok: boolean; erro: string | null }

export async function salvarConfiguracoes(_prev: State, formData: FormData): Promise<State> {
  await requireAuth()
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

  if (error) return { ok: false, erro: error.message }
  return { ok: true, erro: null }
}
