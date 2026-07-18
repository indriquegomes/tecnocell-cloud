'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { logAtividade } from '@/lib/log-atividade'
import { registrarNoCaixa, lojaDoLancamento } from '@/lib/caixa'
import { hojeSP } from '@/lib/utils'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// soma N meses a uma data YYYY-MM-DD (mantém o dia; ajusta pra fim do mês curto)
function somaMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = new Date(y, m - 1 + n, 1)
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  base.setDate(Math.min(d, ultimoDia))
  return base.toISOString().slice(0, 10)
}

export async function criarLancamento(formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const quitado = formData.getAll('quitado').includes('1')
  const valorTotal = parseFloat((formData.get('valor') as string) || '0')
  const hoje = hojeSP()
  const descricao = formData.get('descricao') as string
  const tipo = formData.get('tipo') as string
  const competencia = (formData.get('data_competencia') as string) || null
  const vencimento = (formData.get('data_vencimento') as string) || hoje
  const contaId = (formData.get('conta_id') as string) || null

  const repeticao = (formData.get('repeticao') as string) || 'nao'
  const n = Math.max(1, Math.min(60, parseInt((formData.get('repeticoes') as string) || '1', 10) || 1))
  const vezes = repeticao === 'nao' ? 1 : n
  // parcelar divide o valor; mensal repete o mesmo
  const valorParcela = repeticao === 'parcelar' ? Math.round((valorTotal / vezes) * 100) / 100 : valorTotal

  const linhas = Array.from({ length: vezes }, (_, i) => ({
    id: crypto.randomUUID(),
    descricao: vezes > 1 ? `${descricao} (${i + 1}/${vezes})` : descricao,
    valor: valorParcela,
    tipo,
    categoria: (formData.get('categoria') as string) || null,
    data_competencia: competencia,
    data_vencimento: i === 0 ? vencimento : somaMeses(vencimento, i),
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    conta_id: contaId,
    // só a 1ª pode nascer quitada; as futuras ficam pendentes
    status: quitado && i === 0 ? 'pago' : 'pendente',
    data_pagamento: quitado && i === 0 ? hoje : null,
    valor_pago: quitado && i === 0 ? valorParcela : 0,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('lancamentos').insert(linhas)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function editarLancamento(id: string, formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').update({
    descricao: formData.get('descricao') as string,
    valor: parseFloat((formData.get('valor') as string) || '0'),
    tipo: formData.get('tipo') as string,
    data_competencia: (formData.get('data_competencia') as string) || null,
    data_vencimento: (formData.get('data_vencimento') as string) || null,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    categoria: (formData.get('categoria') as string) || null,
    conta_id: (formData.get('conta_id') as string) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function marcarPago(id: string) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { data: antes } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, forma_pagamento, pessoa_nome')
    .eq('id', id)
    .maybeSingle()
  await logAtividade('pagamento.marcar_pago', {
    lancamento_id: id,
    valor: antes?.valor ?? null,
    cliente: antes?.pessoa_nome ?? null,
  }, usuario, '/painel/financeiro')
  // valor_pago junto do status: os relatórios de fiado medem o que falta por
  // (valor - valor_pago). Marcar 'pago' deixando valor_pago em 0 fazia a nota sumir
  // da cobrança mas continuar contando como saldo devedor em quem lê a diferença.
  const valor = Number(antes?.valor ?? 0)
  const { error } = await supabase.from('lancamentos').update({
    status: 'pago',
    data_pagamento: hojeSP(),
    valor_pago: valor,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw new Error(error.message)

  // O dinheiro precisa aparecer na gaveta. Sem isto a baixa pelo Financeiro sumia do
  // caixa (o PDV já registrava; só esta porta não registrava).
  const faltava = valor - Number(antes?.valor_pago ?? 0)
  if (faltava > 0) {
    const lojaId = await lojaDoLancamento(supabase, id)
    await registrarNoCaixa(
      supabase,
      lojaId,
      Math.round(faltava * 100) / 100,
      antes?.forma_pagamento ?? 'Dinheiro',
      `Fiado recebido — ${antes?.pessoa_nome ?? 'cliente'}`,
    )
  }

  revalidatePath('/painel/financeiro')
  revalidatePath('/painel/fiados')
}

export async function deletarLancamento(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/painel/financeiro')
}
