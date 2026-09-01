'use server'

import crypto from 'node:crypto'
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
  // Math.max(0, ...): campo de dinheiro mascarado não digita negativo pela UI normal,
  // mas o valor real vem de input escondido -- sem essa trava dava pra forçar um
  // lançamento negativo (confirmado em teste 25/08, mesmo buraco achado em produtos).
  const valorTotal = Math.max(0, parseFloat((formData.get('valor') as string) || '0'))
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
  // redirect (não throw): mesmo motivo do editarLancamento — throw num <form
  // action> sem error boundary derruba a tela inteira.
  if (error) redirect(`/painel/financeiro/novo?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function editarLancamento(id: string, formData: FormData) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { error } = await supabase.from('lancamentos').update({
    descricao: formData.get('descricao') as string,
    valor: Math.max(0, parseFloat((formData.get('valor') as string) || '0')),
    tipo: formData.get('tipo') as string,
    data_competencia: (formData.get('data_competencia') as string) || null,
    data_vencimento: (formData.get('data_vencimento') as string) || null,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    categoria: (formData.get('categoria') as string) || null,
    conta_id: (formData.get('conta_id') as string) || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  // redirect (não throw): um erro lançado num <form action={...}> sem error
  // boundary derruba a página inteira pra tela genérica "This page couldn't
  // load" — a mensagem nunca chegava a aparecer (mesmo achado de produtos,
  // 26/08).
  if (error) redirect(`/painel/financeiro/${id}/editar?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/financeiro')
  redirect('/painel/financeiro')
}

export async function marcarPago(id: string, formData?: FormData) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const { data: antes, error: erroAntes } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, forma_pagamento, pessoa_nome, tipo')
    .eq('id', id)
    .maybeSingle()
  // Sem essa checagem, uma falha na consulta virava "antes = undefined" e o
  // valor pago descia pra 0 silenciosamente — o lançamento saía da cobrança
  // como se tivesse sido pago, mas nada entrava na gaveta.
  // redirect (não throw): marcarPago é chamado por um <form action={...}> sem
  // error boundary (financeiro/page.tsx) — throw derruba a tela inteira.
  if (erroAntes) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroAntes.message)}`)

  // COMO foi pago — vem do select ao lado do botão "Pago".
  // Antes isto assumia 'Dinheiro' quando o lançamento não tinha forma, e fiado
  // criado pela venda nasce SEM forma (finalizar_venda não grava forma_pagamento).
  // Enquanto o recebimento só aparecia numa lista, o chute passava despercebido;
  // com ele entrando no ESPERADO do fechamento de caixa, um fiado quitado por PIX
  // passa a ser cobrado como cédula que deveria estar na gaveta — falta falsa,
  // culpando quem fez certo. Não dá pra adivinhar: sem forma, recusa e explica.
  // Mesmo princípio do lib/caixa.ts, que se recusa a chutar a loja.
  const formaInformada = ((formData?.get('forma_pagamento') as string) ?? '').trim()
  const forma = formaInformada || (antes?.forma_pagamento ?? '')
  if (antes?.tipo === 'receber' && !forma) {
    redirect(`/painel/financeiro?erro=${encodeURIComponent('Escolha a forma de pagamento antes de marcar como pago — ela entra na conferência do caixa.')}`)
  }

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
    // Grava a forma escolhida: sem isso o lançamento seguia sem forma e o
    // relatório por forma de pagamento ficava cego justamente pro fiado quitado.
    ...(forma ? { forma_pagamento: forma } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) redirect(`/painel/financeiro?erro=${encodeURIComponent(error.message)}`)

  // O dinheiro precisa aparecer na gaveta — mas só quando é RECEBER (fiado sendo
  // pago = dinheiro entrando). Pra PAGAR (fornecedor, aluguel...) é dinheiro
  // SAINDO — registrarNoCaixa só sabe gravar 'recebimento', então chamar ela aqui
  // pra um pagar criava um recebimento fantasma, inflando a gaveta do valor
  // exato que na verdade tinha saído (achado testando o Financeiro na prática,
  // 28/08). Conta a pagar quitada já é refletida no saldo da conta via
  // lib/saldos-contas.ts (lancamentos status='pago' + conta_id) — não precisa
  // (e não pode) duplicar em movimentos_caixa.
  const faltava = valor - Number(antes?.valor_pago ?? 0)
  if (faltava > 0 && antes?.tipo === 'receber') {
    const lojaId = await lojaDoLancamento(supabase, id)
    await registrarNoCaixa(
      supabase,
      lojaId,
      Math.round(faltava * 100) / 100,
      forma,   // nunca vazio aqui: 'receber' sem forma já foi recusado acima
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
  // redirect (não throw): chamado pelo BotaoExcluir, que é um <form
  // action={...}> por baixo — sem isso, uma falha (ex: FK bloqueando o
  // delete) derrubava a tela inteira em vez de mostrar o motivo.
  if (error) redirect(`/painel/financeiro?erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/financeiro')
}

// Busca cliente/fornecedor JÁ cadastrado (qualquer tipo) pro campo do lançamento.
// Sob demanda — pessoas tem ~2.5k, não cabe em select.
export async function buscarPessoasFinanceiro(accessToken: string, termo: string): Promise<{ id: string; nome: string }[]> {
  await requirePermissao('financeiro', accessToken)
  const raw = termo.trim()
  if (raw.length < 1) return []
  const supabase = await createServiceClient()
  let q = supabase.from('pessoas').select('id, nome').eq('ativo', true)
  const digitos = raw.replace(/\D/g, '')
  const soDigitos = digitos.length >= 4 && /^[\d.\-/()\s]+$/.test(raw)
  if (soDigitos) {
    q = q.or(`cpf_cnpj.ilike.%${digitos}%,telefone.ilike.%${digitos}%,celular.ilike.%${digitos}%`)
  } else {
    const semAcento = raw.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
    const palavras = semAcento.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
    if (palavras.length === 0) return []
    for (const w of palavras) q = q.ilike('nome_norm', `%${w}%`)
  }
  const { data } = await q.order('nome').limit(15)
  return data ?? []
}

// Cria uma pessoa rápida (só o nome) quando não existe — pro campo Cliente/Fornecedor.
// pessoas é tabela do SIGE (PK TEXT) → precisa gerar o id. nome_norm é gerado no banco.
export async function criarPessoaRapida(accessToken: string, nome: string): Promise<{ ok: true; id: string; nome: string } | { ok: false; erro: string }> {
  await requirePermissao('financeiro', accessToken)
  const limpo = nome.trim()
  if (limpo.length < 2) return { ok: false, erro: 'Nome muito curto.' }
  const supabase = await createServiceClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('pessoas').insert({ id, nome: limpo, tipo: 'ambos', pessoa_fisica: false, ativo: true })
  if (error) return { ok: false, erro: error.message }
  return { ok: true, id, nome: limpo }
}

// Sangria/Retirada: tira dinheiro de um caixa em 1 clique (vira um lançamento
// 'pagar' já PAGO naquela conta → subtrai do saldo pela via normal).
export async function registrarSangria(formData: FormData) {
  await requirePermissao('financeiro')
  const contaId = (formData.get('conta_id') as string) || ''
  const valor = parseFloat((formData.get('valor') as string) || '0')
  const motivo = ((formData.get('motivo') as string) || '').trim() || 'Sangria / Retirada'
  if (!contaId || !(valor > 0)) redirect(`/painel/contas?aba=saldos&erro=${encodeURIComponent('Escolha a conta e um valor maior que zero.')}`)
  const supabase = await createServiceClient()
  const hoje = hojeSP()
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: motivo, valor, tipo: 'pagar', categoria: 'Sangria / Retirada',
    data_competencia: hoje, data_vencimento: hoje, conta_id: contaId,
    status: 'pago', data_pagamento: hoje, valor_pago: valor, updated_at: new Date().toISOString(),
  })
  if (error) redirect(`/painel/contas?aba=saldos&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas'); revalidatePath('/painel/financeiro')
  redirect(`/painel/contas?aba=saldos&ok=${Date.now()}`)
}
