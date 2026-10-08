'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Marca a entrega como feita (motoboy entregou). Grava quem entregou + a hora.
export async function marcarEntregue(formData: FormData) {
  await requirePermissao('pdv')
  const supabase = await createServiceClient()
  const vendaId = (formData.get('venda_id') as string) || ''
  const motoboy = ((formData.get('motoboy') as string) || '').trim() || null
  if (!vendaId) return
  const { error } = await supabase.from('vendas').update({
    entregue_em: new Date().toISOString(),
    entregue_por: motoboy,
  }).eq('id', vendaId)
  if (error) console.error('marcarEntregue:', error.message)
  revalidatePath('/painel/entregas')
}

// Gera a conta a pagar do motoboy pro dia: soma as rotas NÃO pagas e aplica o
// combinado dele (diária fixa + por entrega + por extra). Cria UM lançamento
// (tipo pagar, categoria Motoboy) e marca as rotas com o id dele — assim aparece
// no Financeiro/Fluxo/Relatórios como qualquer outra conta, e não paga 2x.
export async function gerarPagamentoMotoboy(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const perfilId = (formData.get('perfil_id') as string) || null
  const data = (formData.get('data') as string) || null
  if (!perfilId || !data) redirect('/painel/entregas?erro=' + encodeURIComponent('Escolha o motoboy e a data.'))

  const { data: rotas, error: eRotasSel } = await supabase
    .from('rotas_motoboy')
    .select('id, loja_id, entregas, extras')
    .eq('perfil_id', perfilId)
    .eq('data', data)
    .is('lancamento_id', null)
  if (eRotasSel) redirect('/painel/entregas?erro=' + encodeURIComponent(eRotasSel.message))
  if (!rotas || rotas.length === 0) redirect('/painel/entregas?erro=' + encodeURIComponent('Sem rotas pendentes pra essa data.'))

  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome, motoboy_valor_fixo, motoboy_adicional_loja, motoboy_adicional_extra, pdv_loja_id')
    .eq('id', perfilId)
    .maybeSingle()
  if (!perfil) redirect('/painel/entregas?erro=' + encodeURIComponent('Motoboy não encontrado.'))

  const fixo = Number(perfil.motoboy_valor_fixo ?? 0)
  const porLoja = Number(perfil.motoboy_adicional_loja ?? 0)
  const porExtra = Number(perfil.motoboy_adicional_extra ?? 0)
  let entregas = 0
  let extras = 0
  const lojas = new Set<string>()
  for (const rota of (rotas as { id: string; loja_id: string | null; entregas: number | null; extras: number | null }[])) {
    entregas += Number(rota.entregas ?? 0)
    extras += Number(rota.extras ?? 0)
    if (rota.loja_id) lojas.add(rota.loja_id)
  }
  const total = Math.round((fixo + entregas * porLoja + extras * porExtra) * 100) / 100
  if (total <= 0) redirect('/painel/entregas?erro=' + encodeURIComponent('Total zerado. Confira o cadastro do motoboy.'))

  const lojaId = lojas.size === 1 ? [...lojas][0] : ((perfil as { pdv_loja_id?: string | null }).pdv_loja_id ?? null)
  // Id determinístico: 2º clique gera o MESMO id → unique violation → não paga 2x.
  const lancId = 'motoboy-' + perfilId + '-' + data
  const { error: eLanc } = await supabase.from('lancamentos').insert({
    id: lancId,
    descricao: `Motoboy — ${perfil.nome} — ${data} (${entregas} ent + ${extras} extra)`,
    valor: total,
    tipo: 'pagar',
    categoria: 'Motoboy',
    pessoa_nome: (perfil as { nome: string }).nome,
    loja_id: lojaId,
    data_competencia: data,
    data_vencimento: data,
    status: 'pendente',
    valor_pago: 0,
    updated_at: new Date().toISOString(),
  })
  if (eLanc) {
    if (eLanc.code === '23505') redirect('/painel/entregas?erro=' + encodeURIComponent('Já existe conta a pagar pra esse motoboy nessa data.'))
    redirect('/painel/entregas?erro=' + encodeURIComponent(eLanc.message))
  }

  const { error: eRotas } = await supabase
    .from('rotas_motoboy')
    .update({ lancamento_id: lancId })
    .in('id', (rotas as { id: string }[]).map((r) => r.id))
  if (eRotas) redirect('/painel/entregas?erro=' + encodeURIComponent(eRotas.message))

  revalidatePath('/painel/entregas')
  redirect('/painel/entregas?ok=' + encodeURIComponent(`Conta a pagar criada: ${(perfil as { nome: string }).nome} — R$ ${total.toFixed(2)} (${entregas} ent + ${extras} extra)`))
}
