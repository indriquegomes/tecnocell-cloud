'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function campos(formData: FormData) {
  const saldoRaw = parseFloat((formData.get('saldo_inicial') as string) || '0')
  return {
    nome: (formData.get('nome') as string)?.trim(),
    tipo: (formData.get('tipo') as string) === 'caixa' ? 'caixa' : 'banco',
    saldo_inicial: isNaN(saldoRaw) ? 0 : saldoRaw,
    loja_id: (formData.get('loja_id') as string) || null,   // vínculo com a loja (empresa)
    // Pix desta conta — sai na cobrança de fiado pelo WhatsApp. Vazio vira
    // null pra não gravar string em branco e a cobrança conseguir só omitir.
    chave_pix: ((formData.get('chave_pix') as string) || '').trim() || null,
    titular:   ((formData.get('titular')   as string) || '').trim() || null,
  }
}

// Todo redirect volta com `aba=contas`: o cadastro de conta e a transferência
// moram nessa aba, mas a tela abre em "saldos" por padrão. Sem isso, salvar
// jogava a pessoa noutra aba e o registro recém-criado sumia da frente — quem
// cadastra acha que não salvou e cadastra de novo. (Achado no check-up de 27/08.)
export async function criarConta(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').insert({ ...campos(formData), ativa: true })
  if (error) redirect(`/painel/contas?aba=contas&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect(`/painel/contas?aba=contas&ok=${Date.now()}`)
}

export async function editarConta(id: string, formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas')
    .update({ ...campos(formData), ativa: formData.get('ativa') === 'true' })
    .eq('id', id)
  if (error) redirect(`/painel/contas?editar=${id}&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas')
  revalidatePath('/painel/formas-pagamento')
  redirect(`/painel/contas?aba=contas&ok=${Date.now()}`)
}

export async function criarTransferencia(formData: FormData) {
  await requirePermissao('financeiro')
  const origem = formData.get('conta_origem_id') as string
  const destino = formData.get('conta_destino_id') as string
  const valor = parseFloat(formData.get('valor') as string) || 0
  const data = (formData.get('data') as string) || hojeSP()
  const observacao = ((formData.get('observacao') as string) || '').trim() || null
  const err = (m: string) => redirect(`/painel/contas?aba=contas&erro=${encodeURIComponent(m)}`)
  if (!origem || !destino) err('Escolha a conta de origem e a de destino.')
  if (origem === destino) err('Origem e destino não podem ser a mesma conta.')
  if (valor <= 0) err('Informe um valor maior que zero.')

  const supabase = await createServiceClient()
  const { error } = await supabase.from('transferencias').insert({ conta_origem_id: origem, conta_destino_id: destino, valor, data, observacao })
  if (error) err(error.message)
  revalidatePath('/painel/contas')
  redirect(`/painel/contas?aba=contas&ok=${Date.now()}`)
}

export async function deletarTransferencia(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  await supabase.from('transferencias').delete().eq('id', id)
  revalidatePath('/painel/contas')
}

export async function deletarConta(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('contas').delete().eq('id', id)
  if (error) redirect(`/painel/contas?aba=contas&erro=${encodeURIComponent('Não dá pra excluir: há formas de pagamento usando esta conta.')}`)
  revalidatePath('/painel/contas')
}
