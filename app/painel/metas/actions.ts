'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function salvarMeta(formData: FormData) {
  await requirePermissao('metas')
  const s = await createServiceClient()
  const id = (formData.get('id') as string) || null
  const meta = {
    loja_id: (formData.get('loja_id') as string) || null,
    rotulo: (formData.get('rotulo') as string)?.trim() || 'Meta',
    data_inicio: formData.get('data_inicio') as string,
    data_fim: formData.get('data_fim') as string,
    dias_uteis: parseInt((formData.get('dias_uteis') as string) || '26', 10) || 26,
    pessoas: parseInt((formData.get('pessoas') as string) || '4', 10) || 4,
    ativo: formData.getAll('ativo').includes('1'),
  }

  const nomes = formData.getAll('faixa_nome') as string[]
  const valores = formData.getAll('faixa_valor') as string[]
  const premios = formData.getAll('faixa_premio') as string[]
  const faixas = nomes
    .map((n, i) => ({ nome: (n || '').trim(), valor: parseFloat(valores[i] || '0') || 0, premio: parseFloat(premios[i] || '0') || 0 }))
    .filter((f) => f.nome && f.valor > 0)
    .sort((a, b) => a.valor - b.valor)
    .map((f, i) => ({ ...f, ordem: i }))

  let metaId = id
  if (id) {
    await s.from('metas').update(meta).eq('id', id)
    await s.from('metas_faixas').delete().eq('meta_id', id)
  } else {
    const { data, error } = await s.from('metas').insert(meta).select('id').single()
    if (error) redirect(`/painel/metas?erro=${encodeURIComponent(error.message)}`)
    metaId = data?.id ?? null
  }
  if (metaId && faixas.length) await s.from('metas_faixas').insert(faixas.map((f) => ({ ...f, meta_id: metaId })))

  revalidatePath('/painel/metas')
  revalidatePath('/painel')
  // redirect com query (URL diferente) força o router a buscar dados frescos —
  // redirect pra mesma URL serviria a lista velha do cache do router
  redirect('/painel/metas?ok=1')
}

export async function deletarMeta(id: string) {
  await requirePermissao('metas')
  const s = await createServiceClient()
  await s.from('metas').delete().eq('id', id)
  revalidatePath('/painel/metas')
  revalidatePath('/painel')
}
