'use server'

// AÇÕES DO PAINEL FINANCEIRO (protótipo aprovado pelo dono, 25/11/2026).
//
// Duas regras do projeto que estas ações seguem à risca:
//   • dinheiro de verdade nunca é chutado — toda escrita confere valor, mês
//     fechado e resolve a CONTA pela forma de pagamento (PIX → banco, dinheiro
//     → cofre), como o Financeiro faz;
//   • baixa de conta a pagar/receber NÃO é reimplementada aqui: o botão Pagar/
//     Receber do painel chama o `marcarPago` do Financeiro (mesmas travas de
//     caixa, nota do fornecedor e mês fechado), só informando para onde voltar.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { travarSeMesFechado } from '@/lib/fechamento'
import { calcularSaldosContas } from '@/lib/saldos-contas'
import { formatBRL, hojeSP } from '@/lib/utils'

const PAINEL = '/painel/painel-financeiro'

// Saldo do painel = saldo das contas − o que está guardado nas metas.
// "Guardar" é reserva: o dinheiro continua no banco, mas não está disponível.
async function saldoDisponivel(supabase: Awaited<ReturnType<typeof createServiceClient>>) {
  const [{ data: contas }, { data: metas }] = await Promise.all([
    supabase.from('contas').select('id, saldo_inicial, tipo, loja_id').eq('ativa', true),
    supabase.from('metas_poupanca').select('atual').eq('ativo', true).eq('escopo', 'empresa'),
  ])
  const saldos = await calcularSaldosContas(supabase, (contas ?? []) as { id: string; saldo_inicial?: number | null; tipo?: string | null; loja_id?: string | null }[])
  const totalContas = Object.values(saldos).reduce((s, v) => s + v, 0)
  const guardado = (metas ?? []).reduce((s, m) => s + Number((m as { atual?: number | null }).atual ?? 0), 0)
  return { totalContas, guardado, disponivel: totalContas - guardado }
}

export async function salvarMovimentacao(formData: FormData) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const tipoEntrada = formData.get('tipo') === 'entrada'
  const valor = Math.max(0, parseFloat(String(formData.get('valor') ?? '0').replace(',', '.')) || 0)
  const categoria = String(formData.get('categoria') ?? '').trim() || (tipoEntrada ? 'Venda' : 'Outros')
  const forma = String(formData.get('forma_pagamento') ?? 'Dinheiro').trim() || 'Dinheiro'

  if (!(valor > 0)) {
    redirect(`${PAINEL}?aba=nova&msg=${encodeURIComponent('Informe o valor antes de salvar.')}`)
  }
  const hoje = hojeSP()
  const trava = await travarSeMesFechado(supabase, hoje, 'criar movimentação')
  if (trava) redirect(`${PAINEL}?aba=nova&msg=${encodeURIComponent(trava)}`)

  // Conta pela forma: sem conta o dinheiro não aparece em saldo nenhum — é o
  // mesmo motivo pelo qual o Financeiro resolve a conta da baixa pela forma.
  const alvo = forma.toLowerCase().includes('pix') ? 'banco' : forma.toLowerCase().includes('dinheiro') ? 'cofre' : null
  let contaId: string | null = null
  if (alvo) {
    const { data: contasAlvo } = await supabase.from('contas').select('id, tipo').eq('ativa', true).eq('tipo', alvo)
    contaId = ((contasAlvo ?? [])[0] as { id?: string } | undefined)?.id ?? null
  }

  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: categoria,
    valor,
    tipo: tipoEntrada ? 'receber' : 'pagar',
    categoria,
    status: 'pago',
    valor_pago: valor,
    data_pagamento: new Date().toISOString(),
    data_vencimento: hoje,
    forma_pagamento: forma,
    conta_id: contaId,
    criado_por: usuario?.id ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) redirect(`${PAINEL}?aba=nova&msg=${encodeURIComponent('Não deu para salvar: ' + error.message)}`)

  revalidatePath(PAINEL)
  revalidatePath('/painel/financeiro')
  revalidatePath('/painel/contas')
  redirect(`${PAINEL}?aba=inicio&msg=${encodeURIComponent('Movimentação salva.')}`)
}

export async function guardarNaMeta(formData: FormData) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const metaId = String(formData.get('meta_id') ?? '')
  const pedido = Math.max(0, parseFloat(String(formData.get('valor') ?? '500').replace(',', '.')) || 0)
  const { data: meta } = await supabase.from('metas_poupanca')
    .select('id, nome, atual, objetivo').eq('id', metaId).eq('escopo', 'empresa').maybeSingle()
  if (!meta) {
    redirect(`${PAINEL}?aba=metas&msg=${encodeURIComponent('Meta não encontrada.')}`)
  }
  const atual = Number((meta as { atual?: number }).atual ?? 0)
  const objetivo = Number((meta as { objetivo?: number }).objetivo ?? 0)
  const nome = String((meta as { nome?: string }).nome ?? 'meta')
  const valor = Math.min(pedido, Math.max(0, objetivo - atual))
  if (!(valor > 0)) {
    redirect(`${PAINEL}?aba=metas&msg=${encodeURIComponent(`Meta ${nome} já está atingida.`)}`)
  }

  const { disponivel } = await saldoDisponivel(supabase)
  if (disponivel < valor) {
    redirect(`${PAINEL}?aba=metas&msg=${encodeURIComponent('Saldo insuficiente para guardar.')}`)
  }

  const { error: erroMeta } = await supabase.from('metas_poupanca')
    .update({ atual: Math.round((atual + valor) * 100) / 100, updated_at: new Date().toISOString() })
    .eq('id', metaId)
  if (erroMeta) {
    redirect(`${PAINEL}?aba=metas&msg=${encodeURIComponent('Não deu para guardar: ' + erroMeta.message)}`)
  }
  // Registro do aporte: guardar tira do disponível, então precisa de rastro.
  await supabase.from('aportes_poupanca').insert({
    id: crypto.randomUUID(),
    meta_id: metaId,
    valor,
    criado_por: usuario?.id ?? null,
  })

  const chegou = Math.round((atual + valor) * 100) / 100 >= objetivo
  revalidatePath(PAINEL)
  revalidatePath('/painel/contas')
  redirect(`${PAINEL}?aba=metas&msg=${encodeURIComponent(
    chegou ? `Meta ${nome} atingida.` : `${formatBRL(valor)} guardados em ${nome}.`)}`)
}
