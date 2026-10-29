'use server'

import crypto from 'node:crypto'
import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { logAtividade } from '@/lib/log-atividade'
import { registrarNoCaixa, lojaDoLancamento } from '@/lib/caixa'
import { travarSeMesFechado } from '@/lib/fechamento'
import { hojeSP } from '@/lib/utils'
import { SETORES } from '@/lib/financeiro-setores'
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

// Comprovante de pagamento (Pix) — imagem pro bucket privado `pagamentos`.
// Mesmo padrão do lembretes/actions.ts: extensão vem do content-type, não do nome.
const EXT_COMPROVANTE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
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
  const lojaId = (formData.get('loja_id') as string) || null

  const repeticao = (formData.get('repeticao') as string) || 'nao'
  const n = Math.max(1, Math.min(60, parseInt((formData.get('repeticoes') as string) || '1', 10) || 1))
  const vezes = repeticao === 'nao' ? 1 : n
  // parcelar divide o valor; mensal repete o mesmo
  const valorParcela = repeticao === 'parcelar' ? Math.round((valorTotal / vezes) * 100) / 100 : valorTotal

  // Trava de mês fechado: não deixa criar lançamento com vencimento num mês já
  // fechado (backdate mudaria o resultado do passado auditado).
  const erroTravaCriar = await travarSeMesFechado(supabase, vencimento, 'criar lançamento')
  if (erroTravaCriar) redirect(`/painel/financeiro/novo?erro=${encodeURIComponent(erroTravaCriar)}`)

  const linhas = Array.from({ length: vezes }, (_, i) => ({
    id: crypto.randomUUID(),
    descricao: vezes > 1 ? `${descricao} (${i + 1}/${vezes})` : descricao,
    valor: valorParcela,
    tipo,
    categoria: (formData.get('categoria') as string) || null,
    subcategoria: (formData.get('subcategoria') as string) || null,
    data_competencia: competencia,
    data_vencimento: i === 0 ? vencimento : somaMeses(vencimento, i),
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    conta_id: contaId,
    loja_id: lojaId,
    // só a 1ª pode nascer quitada; as futuras ficam pendentes
    status: quitado && i === 0 ? 'pago' : 'pendente',
    data_pagamento: quitado && i === 0 ? new Date().toISOString() : null,
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
  // Trava de mês fechado: não deixa editar um lançamento que mora (ou que vai
  // morar) num mês já fechado — mudaria o resultado do passado auditado.
  const vencimentoNovo = (formData.get('data_vencimento') as string) || null
  const { data: atual } = await supabase.from('lancamentos').select('data_vencimento').eq('id', id).maybeSingle()
  const vencimentoAtual = (atual as { data_vencimento?: string | null } | null)?.data_vencimento?.slice(0, 10) ?? null
  const erroTrava = (await travarSeMesFechado(supabase, vencimentoNovo, 'editar este lançamento'))
    ?? (await travarSeMesFechado(supabase, vencimentoAtual, 'editar este lançamento'))
  if (erroTrava) redirect(`/painel/financeiro/${id}/editar?erro=${encodeURIComponent(erroTrava)}`)

  const { error } = await supabase.from('lancamentos').update({
    descricao: formData.get('descricao') as string,
    valor: Math.max(0, parseFloat((formData.get('valor') as string) || '0')),
    tipo: formData.get('tipo') as string,
    data_competencia: (formData.get('data_competencia') as string) || null,
    data_vencimento: (formData.get('data_vencimento') as string) || null,
    forma_pagamento: (formData.get('forma_pagamento') as string) || null,
    pessoa_nome: (formData.get('pessoa_nome') as string) || null,
    categoria: (formData.get('categoria') as string) || null,
    subcategoria: (formData.get('subcategoria') as string) || null,
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
    .select('valor, valor_pago, forma_pagamento, pessoa_nome, tipo, data_vencimento')
    .eq('id', id)
    .maybeSingle()
  // Sem essa checagem, uma falha na consulta virava "antes = undefined" e o
  // valor pago descia pra 0 silenciosamente — o lançamento saía da cobrança
  // como se tivesse sido pago, mas nada entrava na gaveta.
  // redirect (não throw): marcarPago é chamado por um <form action={...}> sem
  // error boundary (financeiro/page.tsx) — throw derruba a tela inteira.
  if (erroAntes) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroAntes.message)}`)

  // Trava de mês fechado: não marca pago (nem desfaz) lançamento de mês já fechado —
  // baixar uma despesa antiga mudaria o resultado do passado auditado.
  const erroTrava = await travarSeMesFechado(supabase, (antes as { data_vencimento?: string | null } | null)?.data_vencimento?.slice(0, 10) ?? null, 'marcar este lançamento como pago')
  if (erroTrava) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroTrava)}`)

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
  if (!forma) {
    redirect(`/painel/financeiro?erro=${encodeURIComponent('Escolha a forma de pagamento (dinheiro ou banco/pix) antes de marcar como pago.')}`)
  }

  // Comprovante do Pix (opcional) — vai pro bucket privado `pagamentos`, caminho
  // gravado no lançamento e aberto depois por URL assinada na listagem.
  let comprovanteUrl: string | null = null
  const comprovante = (formData?.get('comprovante') as File | null) ?? null
  if (comprovante && comprovante.size > 0) {
    if (comprovante.size > 10 * 1024 * 1024) {
      redirect(`/painel/financeiro?erro=${encodeURIComponent('Comprovante muito grande (máximo 10 MB).')}`)
    }
    const ext = EXT_COMPROVANTE[comprovante.type]
    if (!ext) redirect(`/painel/financeiro?erro=${encodeURIComponent('Comprovante deve ser imagem (JPG, PNG, WEBP ou GIF).')}`)
    const path = `lancamentos/${id}/${hojeSP()}.${ext}`
    const buffer = Buffer.from(await comprovante.arrayBuffer())
    const { error: upErr } = await supabase.storage.from('pagamentos').upload(path, buffer, {
      contentType: comprovante.type,
      upsert: true,
    })
    if (upErr) redirect(`/painel/financeiro?erro=${encodeURIComponent(upErr.message)}`)
    comprovanteUrl = path
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
    data_pagamento: new Date().toISOString(),
    valor_pago: valor,
    // Grava a forma escolhida: sem isso o lançamento seguia sem forma e o
    // relatório por forma de pagamento ficava cego justamente pro fiado quitado.
    ...(forma ? { forma_pagamento: forma } : {}),
    ...(comprovanteUrl ? { comprovante_url: comprovanteUrl } : {}),
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
      id,
      'financeiro',
    )
  }

  revalidatePath('/painel/financeiro')
  revalidatePath('/painel/fiados')
}

// DESFAZER PAGAMENTO — reverte uma quitação do botão "Pago" (marcarPago).
// Antes não dava: pagamento com forma errada ficava preso, e excluir o lançamento
// deixava o dinheiro órfão na gaveta. Agora o movimento do caixa guarda
// lancamento_id (via registrarNoCaixa) e origem: o desfazer apaga SÓ o movimento
// de origem 'financeiro' (botão "Pago") e devolve o lançamento pra pendente. O
// fiado pago no PDV também liga lancamento_id agora (auditoria), mas com origem
// 'pdv' — e fica FORA deste desfazer (não tira dinheiro real da gaveta).
export async function desfazerPagamento(id: string) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()

  const { data: lanc, error: erroLanc } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, tipo, status, pessoa_nome, data_vencimento')
    .eq('id', id)
    .maybeSingle()
  if (erroLanc) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroLanc.message)}`)

  const erroTrava = await travarSeMesFechado(supabase, (lanc as { data_vencimento?: string | null } | null)?.data_vencimento?.slice(0, 10) ?? null, 'desfazer este pagamento')
  if (erroTrava) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroTrava)}`)
  if (!lanc || lanc.status !== 'pago') {
    redirect(`/painel/financeiro?erro=${encodeURIComponent('Só é possível desfazer um lançamento já pago.')}`)
  }

  // Movimentos que o "Pago" jogou no caixa (só receber gera movimento) — é o que
  // sai da gaveta agora.
  const { data: movs, error: erroMov } = await supabase
    .from('movimentos_caixa')
    .select('id, valor, caixa_id')
    .eq('lancamento_id', id)
    .eq('tipo', 'recebimento')
    .eq('origem', 'financeiro')
  if (erroMov) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroMov.message)}`)
  const lista = (movs ?? []) as { id: string; valor: number | null; caixa_id: string | null }[]
  const valorMovido = Math.round(lista.reduce((s, m) => s + Number(m.valor ?? 0), 0) * 100) / 100

  // Pago fora do Financeiro (PDV/OS) não tem movimento ligado — desfazer aqui
  // voltaria a dívida mas deixaria o dinheiro na gaveta (o mesmo bug, ao contrário).
  if (lanc.tipo === 'receber' && lista.length === 0) {
    redirect(`/painel/financeiro?erro=${encodeURIComponent('Esse pagamento não tem movimento no caixa pra desfazer (foi feito fora do Financeiro).')}`)
  }

  // Caixa já fechado: o dinheiro foi contado no fechamento. Apagar o movimento
  // mudaria o passado — recusa e pede estorno manual.
  const caixaIds = [...new Set(lista.map((m) => m.caixa_id).filter((c): c is string => !!c))]
  if (caixaIds.length > 0) {
    const { data: caixas, error: erroCx } = await supabase
      .from('caixas')
      .select('id, status')
      .in('id', caixaIds)
    if (erroCx) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroCx.message)}`)
    if ((caixas ?? []).some((c) => c.status === 'fechado')) {
      redirect(`/painel/financeiro?erro=${encodeURIComponent('Caixa já fechado — não dá pra desfazer sem estorno manual.')}`)
    }
  }

  // Receber: devolve só o que o "Pago" adicionou (preserva parcial anterior).
  // Pagar: não tem movimento na gaveta → zera o pago.
  const pagoAtual = Number(lanc.valor_pago ?? 0)
  const novoPago = lanc.tipo === 'receber'
    ? Math.max(0, Math.round((pagoAtual - valorMovido) * 100) / 100)
    : 0

  await logAtividade('pagamento.desfazer', {
    lancamento_id: id,
    valor_estornado: valorMovido,
    cliente: lanc.pessoa_nome ?? null,
  }, usuario, '/painel/financeiro')

  if (lista.length > 0) {
    const { error: erroDel } = await supabase.from('movimentos_caixa').delete().eq('lancamento_id', id).eq('tipo', 'recebimento').eq('origem', 'financeiro')
    if (erroDel) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroDel.message)}`)
  }

  const { error } = await supabase.from('lancamentos').update({
    status: 'pendente',
    valor_pago: novoPago,
    data_pagamento: null,
    forma_pagamento: null,
    comprovante_url: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) redirect(`/painel/financeiro?erro=${encodeURIComponent(error.message)}`)

  revalidatePath('/painel/financeiro')
  revalidatePath('/painel/fiados')
}

export async function deletarLancamento(id: string) {
  await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  // Trava de mês fechado: não apaga lançamento de mês já fechado.
  const { data: alvo } = await supabase.from('lancamentos').select('data_vencimento').eq('id', id).maybeSingle()
  const erroTrava = await travarSeMesFechado(supabase, (alvo as { data_vencimento?: string | null } | null)?.data_vencimento?.slice(0, 10) ?? null, 'apagar este lançamento')
  if (erroTrava) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroTrava)}`)

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

// Mesma busca, mas já no formato que o <BuscaSugestao> espera ({label, value}).
// O BuscaSugestao é client component — server action passada DIRETO (não inline)
// é o que serializa certo pra fronteira do navegador.
export async function buscarPessoasSugestao(accessToken: string, termo: string): Promise<{ label: string; value: string }[]> {
  const pessoas = await buscarPessoasFinanceiro(accessToken, termo)
  return pessoas.map((p) => ({ label: p.nome, value: p.nome }))
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
  // Loja vem da conta (ex.: Caixa Petrópolis → Petrópolis) — sem isso a sangria
  // nascia sem loja_id e caía em "Sem loja" no financeiro.
  const { data: conta } = await supabase.from('contas').select('loja_id').eq('id', contaId).maybeSingle()
  const { error } = await supabase.from('lancamentos').insert({
    id: crypto.randomUUID(),
    descricao: motivo, valor, tipo: 'pagar', categoria: 'Sangria / Retirada',
    data_competencia: hoje, data_vencimento: hoje, conta_id: contaId,
    loja_id: (conta as { loja_id?: string | null } | null)?.loja_id ?? null,
    status: 'pago', data_pagamento: new Date().toISOString(), valor_pago: valor, updated_at: new Date().toISOString(),
  })
  if (error) redirect(`/painel/contas?aba=saldos&erro=${encodeURIComponent(error.message)}`)
  revalidatePath('/painel/contas'); revalidatePath('/painel/financeiro')
  redirect(`/painel/contas?aba=saldos&ok=${Date.now()}`)
}

// Gera a folha de salários: uma conta a pagar por funcionário ativo com salário
// > 0, na loja de origem dele (pdv_loja_id ou a única loja permitida). Comissões/
// porcentagens ainda entram à mão (não há regra definida no sistema ainda).
export async function gerarFolha(formData: FormData) {
  await requirePermissao('master')
  const supabase = await createServiceClient()
  const vencimento = (formData.get('vencimento') as string) || hojeSP()

  // Trava de mês fechado: não gera folha de salário com vencimento em mês fechado
  // (mesmo buraco de backdate que criarLancamento, mas por um caminho diferente).
  const erroTravaFolha = await travarSeMesFechado(supabase, vencimento, 'gerar folha de salários')
  if (erroTravaFolha) redirect(`/painel/financeiro?erro=${encodeURIComponent(erroTravaFolha)}`)

  // Respeita a separação por loja: só gera salário de funcionário cuja loja de
  // origem o usuário pode operar (master = todas).
  const { operaveis } = await lojasDoUsuario().catch(() => ({ operaveis: null as { id: string }[] | null }))
  const lojasPermitidasUser = operaveis ? new Set(operaveis.map((l) => l.id)) : null

  const { data } = await supabase
    .from('perfis')
    .select('nome, salario, is_master, pdv_loja_id, lojas_permitidas, vinculo')
    .eq('ativo', true)
    .gt('salario', 0)
  // Perfil de TREINAMENTO/TESTE nunca entra na folha: ele existe para a pessoa
  // treinar no sistema (gente nova ou de outra loja), não é funcionário da casa.
  const perfis = ((data ?? []) as {
    nome: string; salario: number | null; is_master: boolean | null; pdv_loja_id: string | null
    lojas_permitidas: string[] | null; vinculo: string | null
  }[]).filter((p) => !p.is_master && p.vinculo !== 'treinamento')

  // Evita duplicar se clicar 2x no mesmo vencimento: pula quem já tem salário
  // naquela data (pago ou pendente).
  const { data: jaGerados } = await supabase
    .from('lancamentos')
    .select('pessoa_nome')
    .eq('tipo', 'pagar')
    .eq('categoria', 'Salários')
    .eq('data_vencimento', vencimento)
  const jaTem = new Set(((jaGerados ?? []) as { pessoa_nome: string | null }[]).map((x) => x.pessoa_nome))

  const criados: string[] = []
  const pulados: string[] = []
  for (const p of perfis) {
    if (jaTem.has(p.nome)) continue
    const lojaId = p.pdv_loja_id ?? (p.lojas_permitidas && p.lojas_permitidas.length === 1 ? p.lojas_permitidas[0] : null)
    if (!lojaId) { pulados.push(p.nome); continue }
    if (lojasPermitidasUser && !lojasPermitidasUser.has(lojaId)) continue
    const { error } = await supabase.from('lancamentos').insert({
      id: crypto.randomUUID(),
      descricao: `Salário — ${p.nome}`,
      valor: Number(p.salario ?? 0),
      tipo: 'pagar',
      categoria: 'Salários',
      pessoa_nome: p.nome,
      loja_id: lojaId,
      data_competencia: hojeSP(),
      data_vencimento: vencimento,
      status: 'pendente',
      valor_pago: 0,
      updated_at: new Date().toISOString(),
    })
    if (error) redirect(`/painel/financeiro?erro=${encodeURIComponent(error.message)}`)
    criados.push(p.nome)
  }

  revalidatePath('/painel/financeiro')
  if (criados.length === 0) {
    redirect(`/painel/financeiro?erro=${encodeURIComponent('Nenhum salário a gerar (funcionários sem salário, já gerados nesta data, ou sem loja definida).')}`)
  }
  const msg = `${criados.length} salário(s) gerado(s)` + (pulados.length ? ` — sem loja definida: ${pulados.join(', ')}` : '')
  redirect(`/painel/financeiro?ok=${encodeURIComponent(msg)}`)
}

// Edição INLINE de um campo do lançamento (direto na lista, sem abrir tela).
// Recebe o id + os campos que o form da linha manda. Não redirect pra não perder
// a posição na lista — só revalida e devolve {ok}.
export async function editarLancamentoInline(id: string, formData: FormData) {
  const usuario = await requirePermissao('financeiro')
  const supabase = await createServiceClient()
  const valor = Math.max(0, parseFloat((formData.get('valor') as string) || '0'))
  const vencimento = (formData.get('data_vencimento') as string) || null
  const forma = ((formData.get('forma_pagamento') as string) || '').trim() || null
  const categoria = ((formData.get('categoria') as string) || '').trim() || null

  // Trava de mês fechado (inline não redirect: devolve {ok:false} pra linha não sumir).
  const { data: atualInline } = await supabase.from('lancamentos').select('data_vencimento').eq('id', id).maybeSingle()
  const erroTrava = (await travarSeMesFechado(supabase, vencimento, 'editar este lançamento'))
    ?? (await travarSeMesFechado(supabase, (atualInline as { data_vencimento?: string | null } | null)?.data_vencimento?.slice(0, 10) ?? null, 'editar este lançamento'))
  if (erroTrava) return { ok: false, erro: erroTrava }

  const { error } = await supabase.from('lancamentos').update({
    valor,
    data_vencimento: vencimento ? `${vencimento}T00:00:00` : null,
    forma_pagamento: forma,
    categoria,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { ok: false, erro: error.message }

  await logAtividade('lancamento.editar_inline', { lancamento_id: id }, usuario, '/painel/financeiro')
  revalidatePath('/painel/financeiro')
  return { ok: true }
}

// SUGESTÕES DA BUSCA DO FINANCEIRO.
//
// O dono digita "sa" e quer ver a categoria "Salários" — a que existe de verdade,
// com quantos lançamentos e quanto dinheiro. O campo Buscar aceitava só texto
// livre e as opções ficavam num menu fixo; isso não acha nada.
//
// A contagem respeita a loja, o período e o campo de data que estão na tela: a
// sugestão diz o que ele VAI ver depois de clicar, não o número do banco inteiro.
export type SugestaoBusca = {
  tipo: 'termo' | 'setor' | 'categoria' | 'subcategoria' | 'pessoa'
  valor: string
  detalhe: string
  setorChave?: string
  categoria?: string
  n: number
  total: number
}

export async function sugerirFinanceiro(
  accessToken: string,
  termo: string,
  contexto: { loja?: string; de?: string; ate?: string; campo?: string } = {},
): Promise<SugestaoBusca[]> {
  await requirePermissao('financeiro', accessToken)
  const t = termo.trim()
  if (t.length < 2) return []

  // Mesma regra da busca livre: cada vogal e cada c viram curinga de uma letra,
  // então "salarios" acha "Salários" e "franca" acha "França".
  const padrao = t.length >= 3 ? t.toLowerCase().replace(/[aeiouc]/g, '_') : t
  const campo = ['data_vencimento', 'data_competencia', 'data_pagamento'].includes(contexto.campo ?? '')
    ? contexto.campo!
    : 'data_vencimento'

  const supabase = await createServiceClient()
  const base = () => {
    let q = supabase.from('lancamentos').select('categoria, subcategoria, pessoa_nome, valor')
    if (contexto.loja === 'sem') q = q.is('loja_id', null)
    else if (contexto.loja && contexto.loja !== 'todas') q = q.eq('loja_id', contexto.loja)
    if (contexto.de) q = q.gte(campo, contexto.de)
    if (contexto.ate) q = q.lte(campo, contexto.ate)
    return q
  }

  const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const [catsRes, subsRes, pessoasRes] = await Promise.all([
    base().not('categoria', 'is', null).ilike('categoria', '%' + padrao + '%').limit(4000),
    base().not('subcategoria', 'is', null).ilike('subcategoria', '%' + padrao + '%').limit(3000),
    base().not('pessoa_nome', 'is', null).ilike('pessoa_nome', '%' + padrao + '%').limit(4000),
  ])
  type Linha = { categoria: string | null; subcategoria: string | null; pessoa_nome: string | null; valor: number | null }
  const cats = (catsRes.data ?? []) as Linha[]
  const subs = (subsRes.data ?? []) as Linha[]
  const pessoas = (pessoasRes.data ?? []) as Linha[]

  // Ordem: primeiro o que COMEÇA com o que foi digitado, depois o que só contém.
  // Digitar "sa" tem que trazer "Salários" no topo, não uma categoria que só tem
  // a ver com o assunto e mais lançamentos.
  const comeca = (nome: string) => semAcento(nome).startsWith(semAcento(t)) ? 1 : 0
  function agrupar<T extends { valor: number | null }>(linhas: T[], chave: (l: T) => string | null) {
    const mapa = new Map<string, { n: number; total: number }>()
    for (const l of linhas) {
      const k = chave(l)
      if (!k) continue
      const atual = mapa.get(k) ?? { n: 0, total: 0 }
      atual.n += 1
      atual.total += Number(l.valor ?? 0)
      mapa.set(k, atual)
    }
    return [...mapa.entries()].sort((a, b) => {
      const pa = comeca(a[0]), pb = comeca(b[0])
      if (pa !== pb) return pb - pa
      return b[1].n - a[1].n
    })
  }

  const out: SugestaoBusca[] = [
    { tipo: 'termo', valor: t, detalhe: 'procurar no texto das descrições', n: 0, total: 0 },
  ]

  for (const s of SETORES) {
    if (s.label && semAcento(s.label).includes(semAcento(t))) {
      out.push({ tipo: 'setor', valor: s.label, detalhe: 'setor inteiro', setorChave: s.chave, n: 0, total: 0 })
    }
  }

  // O PostgREST corta em 1000 linhas: quando um grupo bate no teto, o valor somado
  // estaria errado. Nesse caso eu conto certo (head count) e NÃO mostro dinheiro —
  // melhor mostrar só "1.000+ lançamentos" do que um total mentiroso.
  const TETO = 1000
  const contador = (coluna: 'categoria' | 'subcategoria' | 'pessoa_nome', valor: string) => {
    let q = supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq(coluna, valor)
    if (contexto.loja === 'sem') q = q.is('loja_id', null)
    else if (contexto.loja && contexto.loja !== 'todas') q = q.eq('loja_id', contexto.loja)
    if (contexto.de) q = q.gte(campo, contexto.de)
    if (contexto.ate) q = q.lte(campo, contexto.ate)
    return q
  }
  async function grupo(coluna: 'categoria' | 'subcategoria' | 'pessoa_nome', nome: string, dados: { n: number; total: number }) {
    if (dados.n < TETO) return dados
    const { count } = await contador(coluna, nome)
    return { n: count ?? dados.n, total: 0 }
  }

  for (const [nome, dados] of agrupar(cats, (l) => l.categoria).slice(0, 6)) {
    const setor = SETORES.find((s) => s.categorias.some((c) => c.trim().toLowerCase() === nome.trim().toLowerCase()))
    out.push({
      tipo: 'categoria',
      valor: nome,
      detalhe: setor ? setor.emoji + ' ' + setor.label : 'sem setor',
      setorChave: setor?.chave,
      ...(await grupo('categoria', nome, dados)),
    })
  }

  for (const [nome, dados] of agrupar(subs, (l) => l.subcategoria).slice(0, 4)) {
    const linha = subs.find((l) => l.subcategoria === nome)
    out.push({
      tipo: 'subcategoria',
      valor: nome,
      detalhe: 'dentro de ' + (linha?.categoria ?? 'categoria'),
      categoria: linha?.categoria ?? undefined,
      ...(await grupo('subcategoria', nome, dados)),
    })
  }

  for (const [nome, dados] of agrupar(pessoas, (l) => l.pessoa_nome).slice(0, 5)) {
    out.push({ tipo: 'pessoa', valor: nome, detalhe: 'cliente / fornecedor', ...(await grupo('pessoa_nome', nome, dados)) })
  }

  return out
}
