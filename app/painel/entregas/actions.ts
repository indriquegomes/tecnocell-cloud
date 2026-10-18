'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { calcMotoboy, semanaSegSab, type MotoboyTipo } from '@/lib/motoboy'
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

// Gera o pagamento da SEMANA (seg→sáb) do motoboy. O dono fecha no sábado.
//   fixo     → cria a conta já PAGA (débito automático PagBank), valor = salário fixo.
//              Não soma rotas: o salário é fechado e já debitou sozinho.
//   variavel → soma as rotas NÃO pagas da semana (entregas×porEntrega + extras×porExtra),
//              cria conta PENDENTE pro PIX de sábado, e marca as rotas como pagas.
// Id determinístico (perfil + sábado): 2º clique dá unique violation → não paga 2x.
export async function gerarPagamentoMotoboy(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const perfilId = (formData.get('perfil_id') as string) || null
  const data = (formData.get('data') as string) || null
  if (!perfilId || !data) redirect('/painel/entregas?erro=' + encodeURIComponent('Escolha o motoboy e a data.'))

  const { seg, sab } = semanaSegSab(data)

  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome, motoboy_tipo, motoboy_valor_fixo, motoboy_adicional_loja, motoboy_adicional_extra, pdv_loja_id')
    .eq('id', perfilId)
    .maybeSingle()
  if (!perfil) redirect('/painel/entregas?erro=' + encodeURIComponent('Motoboy não encontrado.'))

  const tipo = ((perfil as { motoboy_tipo?: string | null }).motoboy_tipo ?? 'variavel') as MotoboyTipo
  const fixo = Number((perfil as { motoboy_valor_fixo?: number | null }).motoboy_valor_fixo ?? 0)
  const porEntrega = Number((perfil as { motoboy_adicional_loja?: number | null }).motoboy_adicional_loja ?? 0)
  const porExtra = Number((perfil as { motoboy_adicional_extra?: number | null }).motoboy_adicional_extra ?? 0)
  const pdvLojaId = (perfil as { pdv_loja_id?: string | null }).pdv_loja_id ?? null

  let entregas = 0
  let extras = 0
  let rotas: { id: string; loja_id: string | null; entregas: number | null; extras: number | null }[] = []
  const lojas = new Set<string>()

  if (tipo === 'fixo') {
    // salário fechado — não depende de rota. custo vai pra loja de origem (pdv_loja_id).
    if (pdvLojaId) lojas.add(pdvLojaId)
  } else {
    const { data: rotasSel, error: eRotasSel } = await supabase
      .from('rotas_motoboy')
      .select('id, loja_id, entregas, extras')
      .eq('perfil_id', perfilId)
      .gte('data', seg)
      .lte('data', sab)
      .is('lancamento_id', null)
    if (eRotasSel) redirect('/painel/entregas?erro=' + encodeURIComponent(eRotasSel.message))
    rotas = (rotasSel ?? []) as { id: string; loja_id: string | null; entregas: number | null; extras: number | null }[]
    if (rotas.length === 0) redirect('/painel/entregas?erro=' + encodeURIComponent('Sem rotas pendentes nesta semana (' + seg + ' a ' + sab + ').'))
    for (const rota of rotas) {
      entregas += Number(rota.entregas ?? 0)
      extras += Number(rota.extras ?? 0)
      if (rota.loja_id) lojas.add(rota.loja_id)
    }
  }

  const { total, ehFixo } = calcMotoboy(tipo, fixo, porEntrega, porExtra, entregas, extras)
  if (total <= 0) redirect('/painel/entregas?erro=' + encodeURIComponent('Total zerado. Confira o cadastro do motoboy.'))

  const lojaId = lojas.size === 1 ? [...lojas][0] : pdvLojaId
  const lancId = 'motoboy-' + perfilId + '-' + sab
  const nome = (perfil as { nome: string }).nome
  const desc = ehFixo
    ? `Motoboy — ${nome} — semana ${seg} a ${sab} (fixo)`
    : `Motoboy — ${nome} — semana ${seg} a ${sab} (${entregas} ent + ${extras} extra)`

  const { error: eLanc } = await supabase.from('lancamentos').insert({
    id: lancId,
    descricao: desc,
    valor: total,
    tipo: 'pagar',
    categoria: 'Motoboy',
    pessoa_nome: nome,
    loja_id: lojaId,
    data_competencia: sab,
    data_vencimento: sab,
    // fixo já debitou no PagBank → nasce pago. variável → pendente pro PIX de sábado.
    status: ehFixo ? 'pago' : 'pendente',
    data_pagamento: ehFixo ? sab : null,
    valor_pago: ehFixo ? total : 0,
    forma_pagamento: ehFixo ? 'Débito automático PagBank' : null,
    updated_at: new Date().toISOString(),
  })
  if (eLanc) {
    if (eLanc.code === '23505') {
      // Conta já existe pra essa semana (2º clique, ou 1ª tentativa que gravou a
      // conta mas falhou ao marcar as rotas). Cura o caso órfão: marca as rotas
      // mesmo assim, e devolve aviso amigável.
      if (!ehFixo && rotas.length > 0) {
        await supabase.from('rotas_motoboy').update({ lancamento_id: lancId }).in('id', rotas.map((r) => r.id))
      }
      redirect('/painel/entregas?erro=' + encodeURIComponent('Já existe conta pra esse motoboy nessa semana (' + seg + ' a ' + sab + ').'))
    }
    redirect('/painel/entregas?erro=' + encodeURIComponent(eLanc.message))
  }

  if (!ehFixo && rotas.length > 0) {
    const { error: eRotas } = await supabase
      .from('rotas_motoboy')
      .update({ lancamento_id: lancId })
      .in('id', rotas.map((r) => r.id))
    if (eRotas) redirect('/painel/entregas?erro=' + encodeURIComponent(eRotas.message))
  }

  revalidatePath('/painel/entregas')
  const msg = ehFixo
    ? `Conta registrada como paga (débito automático): ${nome} — R$ ${total.toFixed(2)}`
    : `Conta a pagar criada: ${nome} — R$ ${total.toFixed(2)} (${entregas} ent + ${extras} extra)`
  redirect('/painel/entregas?ok=' + encodeURIComponent(msg))
}
