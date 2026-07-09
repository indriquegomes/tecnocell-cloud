'use server'

import { createServiceClient, requireAuth, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// RH lança uma entrada no banco de horas (+ adiciona / - retira)
export async function lancarHora(formData: FormData) {
  const user = await requireAuth()
  await requirePermissao('rh')
  const s = await createServiceClient()
  const horasNum = parseFloat(((formData.get('horas') as string) || '0').replace(',', '.'))
  const retirar = formData.get('operacao') === 'retirar'
  const horas = retirar ? -Math.abs(horasNum) : Math.abs(horasNum)
  const usuario_id = formData.get('usuario_id') as string
  if (!usuario_id || !horasNum) redirect('/painel/rh?erro=Preencha pessoa e horas')
  await s.from('banco_horas').insert({
    usuario_id,
    horas,
    data: (formData.get('data') as string) || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    motivo: (formData.get('motivo') as string) || null,
    obs: (formData.get('obs') as string) || null,
    criado_por: user.id,
  })
  revalidatePath('/painel/rh')
  revalidatePath('/painel/meu-perfil')
  redirect('/painel/rh?ok=1')
}

export async function excluirHora(id: string) {
  await requirePermissao('rh')
  const s = await createServiceClient()
  await s.from('banco_horas').delete().eq('id', id)
  revalidatePath('/painel/rh')
}
