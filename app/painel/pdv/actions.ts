'use server'

import { createServiceClient, fetchAll, requirePermissao, permissoesEfetivas } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { hojeSP } from '@/lib/utils'

// Itens de UMA tabela de preço, sob demanda (o PDV não embute mais os 45k itens
// de todas as tabelas — carrega só a escolhida). Ordena por id p/ paginação estável.
export async function buscarItensTabela(
  accessToken: string,
  tabelaId: string,
): Promise<{ produto_id: string; preco: number; quantidade_minima: number | null }[]> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  return fetchAll<{ produto_id: string; preco: number; quantidade_minima: number | null }>(
    (from, to) => supabase.from('itens_tabela_preco')
      .select('produto_id, preco, quantidade_minima')
      .eq('tabela_id', tabelaId).order('id').range(from, to),
  )
}

// tira acento + minúscula (igual ao casaBusca do client) pra bater com busca_norm/nome_norm
function semAcentoServ(s: string): string {
  return s.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
}

export type ProdutoPDV = {
  id: string; nome: string; preco: number; codigo: string | null; marca: string | null
  categoria: string | null; descricao: string | null; imagem_url: string | null
  controla_serie: boolean; prateleira: string | null; estoquePorDeposito: Record<string, number>
}

// Busca de produto SOB DEMANDA (o PDV não embute mais os 7.983 produtos no HTML).
// Cada palavra do termo tem que aparecer em busca_norm (nome+código+marca, sem acento).
// Retorna também os IMEIs em estoque dos produtos serializados encontrados.
// linha do supabase → ProdutoPDV (usado na busca e no catálogo completo)
function mapRowToProdutoPDV(p: Record<string, unknown>): ProdutoPDV {
  const linhas = (p.estoque as { deposito_id: string; quantidade: number }[] | null) ?? []
  const estoquePorDeposito: Record<string, number> = {}
  for (const e of linhas) estoquePorDeposito[e.deposito_id] = (estoquePorDeposito[e.deposito_id] ?? 0) + e.quantidade
  return {
    id: p.id as string, nome: p.nome as string, preco: p.preco as number, codigo: p.codigo as string | null,
    marca: p.marca as string | null, categoria: (p.categoria as string | null) ?? null,
    descricao: (p.descricao as string | null) ?? null, imagem_url: (p.imagem_url as string | null) ?? null,
    controla_serie: (p.controla_serie as boolean | null) ?? false, prateleira: (p.prateleira as string | null) ?? null,
    estoquePorDeposito,
  }
}

const SEL_PRODUTO_PDV = 'id, nome, preco, codigo, marca, categoria, descricao, imagem_url, controla_serie, prateleira, estoque(deposito_id, quantidade)'

// Catálogo completo, leve, pra busca 100% LOCAL no PDV (instantânea, sem rede por tecla).
// Paginado com fetchAll pra não bater no cap de 1000 do PostgREST.
export async function carregarCatalogoPDV(accessToken: string): Promise<ProdutoPDV[]> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const rows = await fetchAll<Record<string, unknown>>(
    (from, to) => supabase.from('produtos').select(SEL_PRODUTO_PDV).eq('ativo', true).order('nome').range(from, to),
  )
  return rows.map(mapRowToProdutoPDV)
}

export async function buscarProdutosPDV(
  accessToken: string,
  termo: string,
): Promise<{ produtos: ProdutoPDV[]; series: Record<string, Record<string, string[]>> }> {
  await requirePermissao('pdv', accessToken)
  const t = termo.trim()
  if (t.length < 1) return { produtos: [], series: {} }
  const supabase = await createServiceClient()
  const palavras = semAcentoServ(t).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return { produtos: [], series: {} }

  const sel = 'id, nome, preco, codigo, marca, categoria, descricao, imagem_url, controla_serie, prateleira, estoque(deposito_id, quantidade)'
  let q = supabase.from('produtos').select(sel).eq('ativo', true)
  for (const w of palavras) q = q.ilike('busca_norm', `%${w}%`)
  let { data, error } = await q.order('nome').limit(60)
  // Fallback se a migration do busca_norm ainda não rodou: busca por nome/código/marca
  // (com acento). Depois de rodar a migration, o caminho de cima (sem acento) assume.
  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select(sel).eq('ativo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%,marca.ilike.%${w}%`)
    ;({ data } = await f.order('nome').limit(60))
  }

  const produtos: ProdutoPDV[] = (data ?? []).map(mapRowToProdutoPDV)

  // IMEIs em estoque só dos serializados encontrados: { produto_id: { deposito_id: [serie] } }
  const series: Record<string, Record<string, string[]>> = {}
  const idsSerie = produtos.filter((p) => p.controla_serie).map((p) => p.id)
  if (idsSerie.length > 0) {
    const { data: ser } = await supabase.from('numeros_serie')
      .select('produto_id, deposito_id, serie').eq('status', 'em_estoque').in('produto_id', idsSerie).order('serie')
    for (const s of (ser ?? []) as { produto_id: string; deposito_id: string; serie: string }[]) {
      if (!s.produto_id || !s.deposito_id) continue
      ;(series[s.produto_id] ??= {})[s.deposito_id] ??= []
      series[s.produto_id][s.deposito_id].push(s.serie)
    }
  }
  return { produtos, series }
}

export type PessoaPDV = {
  id: string; nome: string; cpf_cnpj: string | null; telefone: string | null
  endereco: string | null; bairro: string | null; cidade: string | null
  estado: string | null; cep: string | null; tabela_preco_id: string | null
}

// Busca de cliente SOB DEMANDA (não embute mais as 2.397 pessoas no HTML).
// Só dígitos → CPF/CNPJ/telefone; senão cada palavra em nome_norm (sem acento).
export async function buscarClientesPDV(accessToken: string, termo: string): Promise<PessoaPDV[]> {
  await requirePermissao('pdv', accessToken)
  const raw = termo.trim()
  if (raw.length < 1) return []
  const supabase = await createServiceClient()
  let q = supabase.from('pessoas')
    .select('id, nome, cpf_cnpj, telefone, endereco, bairro, cidade, estado, cep, tabela_preco_id')
    .eq('ativo', true).in('tipo', ['cliente', 'ambos'])
  const digitos = raw.replace(/\D/g, '')
  const soDigitos = digitos.length >= 4 && /^[\d.\-/()\s]+$/.test(raw)
  if (soDigitos) {
    q = q.or(`cpf_cnpj.ilike.%${digitos}%,telefone.ilike.%${digitos}%,celular.ilike.%${digitos}%`)
  } else {
    const palavras = semAcentoServ(raw).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
    if (palavras.length === 0) return []
    for (const w of palavras) q = q.ilike('nome_norm', `%${w}%`)
  }
  const { data } = await q.order('nome').limit(30)
  return (data ?? []) as PessoaPDV[]
}

// Situação de fiado do cliente: quanto já deve (lancamentos a receber pendentes,
// ligados por NOME) e o limite cadastrado. Serve pro vendedor decidir se estende mais fiado.
export async function buscarFiadoCliente(
  accessToken: string,
  pessoaId: string,
): Promise<{ limite: number; devendo: number; disponivel: number }> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data: pessoa } = await supabase
    .from('pessoas').select('nome, limite_credito').eq('id', pessoaId).maybeSingle()
  if (!pessoa) return { limite: 0, devendo: 0, disponivel: 0 }
  const limite = Number(pessoa.limite_credito) || 0
  const { data: lancs } = await supabase
    .from('lancamentos').select('valor, valor_pago')
    .eq('tipo', 'receber').eq('status', 'pendente').eq('pessoa_nome', pessoa.nome)
  const devendo = (lancs ?? []).reduce((s, l) => s + ((Number(l.valor) || 0) - (Number(l.valor_pago) || 0)), 0)
  return { limite, devendo, disponivel: limite > 0 ? limite - devendo : 0 }
}

// Confere a senha de desconto da loja no servidor (a senha nunca vai pro cliente)
export async function validarSenhaDesconto(lojaId: string, senha: string): Promise<boolean> {
  const supabase = await createServiceClient()
  const { data } = await supabase.from('lojas').select('senha_desconto').eq('id', lojaId).maybeSingle()
  const esperada = (data?.senha_desconto ?? '').trim()
  return !esperada || senha.trim() === esperada
}

interface ItemCarrinho {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
}

export interface PagamentoInput {
  forma_pagamento_id: string
  valor: number
  taxa: number
  maquina: string
  parcelas: number
  status: 'pago' | 'pendente'
}

// Salva o carrinho atual como ORÇAMENTO (pré-venda) sem finalizar. Aparece no F3
// (buscarPedidosAbertos carrega status 'rascunho') e no módulo Pedidos p/ faturar depois.
export async function salvarOrcamentoPDV(
  accessToken: string,
  input: {
    itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number }[]
    pessoa_id: string | null
    desconto: number
    observacoes: string
    deposito_id: string | null
    tabela_preco_id: string | null
    forma_pagamento_id: string | null
  },
): Promise<{ id: string }> {
  const usuario = await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  if (input.itens.length === 0) throw new Error('Carrinho vazio.')

  const { data: perfil } = await supabase.from('perfis').select('nome').eq('id', usuario.id).maybeSingle()
  const vendedorNome = (perfil as { nome?: string } | null)?.nome ?? usuario.email ?? ''

  const subtotal = input.itens.reduce((s, i) => s + i.quantidade * i.preco_unitario, 0)
  const total = Math.max(0, subtotal - (input.desconto || 0))

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    tipo: 'orcamento',
    pessoa_id: input.pessoa_id,
    observacoes: input.observacoes || null,
    deposito_id: input.deposito_id,
    tabela_preco_id: input.tabela_preco_id,
    forma_pagamento_id: input.forma_pagamento_id,
    origem: 'pdv',
    vendedor_id: usuario.id,
    vendedor_nome: vendedorNome,
    desconto: input.desconto || 0,
    status: 'rascunho',
    total,
  }).select('id').single()
  if (error) throw new Error(error.message)

  const rows = input.itens.map((i) => ({
    pedido_id: pedido!.id,
    produto_id: i.produto_id,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    total_item: i.quantidade * i.preco_unitario,
  }))
  const { error: eItens } = await supabase.from('itens_pedido').insert(rows)
  if (eItens) throw new Error(eItens.message)

  return { id: pedido!.id }
}

// Caixa da loja está aberto? (pro PDV avisar/bloquear antes de vender). Por loja;
// fallback global se a migração caixa-por-loja ainda não rodou.
export async function caixaAbertoDaLoja(accessToken: string, lojaId: string): Promise<boolean> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  let q = supabase.from('caixas').select('id').eq('status', 'aberto').limit(1)
  if (lojaId) q = q.eq('loja_id', lojaId)
  const { data, error } = await q.maybeSingle()
  if (error && error.message?.includes('loja_id')) {
    const { data: g } = await supabase.from('caixas').select('id').eq('status', 'aberto').limit(1).maybeSingle()
    return !!g
  }
  return !!data
}

export async function finalizarVenda(
  accessToken: string,
  itens: ItemCarrinho[],
  pagamentos: PagamentoInput[],
  pessoa_id: string | null,
  desconto: number,
  observacoes: string,
  deposito_id: string = '',
  series: { produto_id: string; serie: string }[] = [],
  credito_valor: number = 0,
  desconto_manual: number = 0,
): Promise<
  | { erro: string }
  | { vendaId: string; vendaNumero: number | null; total: number; estoqueAtualizado: Record<string, number>; vendedorNome: string }
> {
  if (itens.length === 0) return { erro: 'Carrinho vazio' }
  if (!deposito_id) return { erro: 'Depósito não selecionado' }
  if (pagamentos.length === 0) return { erro: 'Selecione a forma de pagamento' }

  let usuario: { id: string; email: string | null }
  try {
    usuario = await requirePermissao('pdv', accessToken)
  } catch (e) {
    return { erro: 'Sessão expirada. Recarregue a página (F5) e entre novamente. ' + (e instanceof Error ? e.message : '') }
  }

  // Limite de operação: só quem tem 'venda_desconto' pode dar desconto MANUAL.
  // (desconto de promoção é automático e não conta.)
  if (desconto_manual > 0) {
    const { permissoes, isMaster } = await permissoesEfetivas(usuario.id)
    if (!temPermissao(permissoes, 'venda_desconto', isMaster)) {
      return { erro: 'Seu cargo não permite dar desconto. Chame o gerente.' }
    }
  }

  // Piso de venda: item abaixo do preco_minimo exige 'venda_abaixo_minimo'.
  try {
    const svc = await createServiceClient()
    const { data: pisos } = await svc.from('produtos')
      .select('id, nome, preco_minimo')
      .in('id', itens.map((i) => i.produto_id))
      .gt('preco_minimo', 0)
    const abaixo = (pisos ?? [])
      .map((p) => ({ ...p, item: itens.find((i) => i.produto_id === p.id) }))
      .filter((p) => p.item && p.item.preco_unitario < Number(p.preco_minimo))
    if (abaixo.length > 0) {
      const { permissoes, isMaster } = await permissoesEfetivas(usuario.id)
      if (!temPermissao(permissoes, 'venda_abaixo_minimo', isMaster)) {
        const p = abaixo[0]
        return { erro: `"${p.nome}" está abaixo do preço mínimo (R$ ${Number(p.preco_minimo).toFixed(2)}). Seu cargo não permite vender abaixo do piso.` }
      }
    }
  } catch { /* coluna preco_minimo ainda não existe — sem piso */ }

  let supabase: Awaited<ReturnType<typeof createServiceClient>>
  try {
    supabase = await createServiceClient()
  } catch (e) {
    return { erro: 'Erro ao conectar ao banco: ' + String(e) }
  }

  // TRAVA (Isa): o caixa DESTA LOJA precisa estar aberto pra vender. Escopo por
  // loja (do depósito da venda); se a migração caixa-por-loja ainda não rodou,
  // cai numa checagem global (qualquer caixa aberto).
  let caixaId: string | null = null
  try {
    const { data: depo } = await supabase.from('depositos').select('loja_id').eq('id', deposito_id).maybeSingle()
    const lojaVenda = (depo as { loja_id?: string | null } | null)?.loja_id ?? null
    let q = supabase.from('caixas').select('id').eq('status', 'aberto').limit(1)
    if (lojaVenda) q = q.eq('loja_id', lojaVenda)
    const { data: cx, error: cxErr } = await q.maybeSingle()
    if (cxErr && cxErr.message?.includes('loja_id')) {
      const { data: cxG } = await supabase.from('caixas').select('id').eq('status', 'aberto').limit(1).maybeSingle()
      caixaId = cxG?.id ?? null
    } else {
      caixaId = cx?.id ?? null
    }
  } catch { caixaId = null }
  if (!caixaId) return { erro: 'O caixa desta loja está fechado. Abra o caixa em "Operação do PDV" antes de registrar vendas.' }

  // Busca nome do vendedor no perfil
  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome')
    .eq('id', usuario.id)
    .maybeSingle()
  const vendedorNome = perfil?.nome ?? usuario.email ?? ''

  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: itens,
    p_pagamentos: pagamentos,
    p_pessoa_id: pessoa_id,
    p_desconto: desconto,
    p_observacoes: observacoes || null,
    p_deposito_id: deposito_id,
    p_series: series,
    p_vendedor_id: usuario.id,
    p_vendedor_nome: vendedorNome,
    p_credito_valor: credito_valor,
  })

  if (error) return { erro: error.message }
  if (!data) return { erro: 'RPC retornou vazio. Verifique o banco.' }

  // Amarra a venda ao caixa aberto (pro fechamento X/Z reconciliar por caixa).
  // Silencioso se a coluna caixa_id ainda não existe (pré-migração).
  try { await supabase.from('vendas').update({ caixa_id: caixaId }).eq('id', data.venda_id as string) } catch { /* pré-migração */ }

  // Vendedor (rastreabilidade), fiado vinculado e baixa de IMEI já nascem
  // dentro do RPC finalizar_venda — sem escrita posterior nem race.

  return {
    vendaId: data.venda_id as string,
    vendaNumero: data.venda_numero as number | null,
    total: data.total as number,
    estoqueAtualizado: data.estoque_atualizado as Record<string, number>,
    vendedorNome,
  }
}

export interface PagamentoHistorico {
  valor: number
  forma: string
  data: string
  tipo?: 'desconto'   // sem tipo = dinheiro que entrou de verdade
}

export interface CrediarioItem {
  id: string
  descricao: string
  valor: number
  valor_pago: number
  pessoa_nome: string | null
  data_vencimento: string | null
  created_at: string
  codigo: number | null
  venda_id: string | null
  historico_pagamentos: PagamentoHistorico[] | null
}

export interface DetalheVenda {
  id: string
  numero: number | null
  total: number
  desconto: number
  created_at: string
  vendedor_nome: string | null
  deposito_nome: string | null
  observacoes: string | null
  forma_pagamento_nome: string | null
  itens: { nome: string; quantidade: number; preco_unitario: number; total_item: number }[]
}

export async function buscarCrediario(accessToken: string): Promise<CrediarioItem[]> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('lancamentos')
    .select('id, descricao, valor, valor_pago, pessoa_nome, data_vencimento, created_at, codigo, venda_id, historico_pagamentos')
    .eq('tipo', 'receber')
    .eq('status', 'pendente')
    .order('data_vencimento', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CrediarioItem[]
}

export async function buscarDetalheVenda(accessToken: string, vendaId: string): Promise<DetalheVenda | null> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, pagamentosRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, desconto, observacoes, created_at, vendedor_nome, forma_pagamento_id, deposito_id')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produtos(nome)')
      .eq('venda_id', vendaId),
    supabase
      .from('pagamentos_venda')
      .select('forma_pagamento_id')
      .eq('venda_id', vendaId),
  ])

  if (!vendaRes.data) return null
  const v = vendaRes.data as { id: string; numero: number | null; total: number; desconto: number | null; observacoes: string | null; created_at: string; vendedor_nome: string | null; forma_pagamento_id: string | null; deposito_id: string | null }

  // Formas de pagamento reais (pagamento misto via pagamentos_venda;
  // fallback p/ forma_pagamento_id em vendas antigas)
  const formaIds = [...new Set(
    ((pagamentosRes.data ?? []) as { forma_pagamento_id: string | null }[])
      .map((p) => p.forma_pagamento_id)
      .filter((id): id is string => !!id)
  )]
  if (formaIds.length === 0 && v.forma_pagamento_id) formaIds.push(v.forma_pagamento_id)

  const [formasRes, depositoRes] = await Promise.all([
    formaIds.length
      ? supabase.from('formas_pagamento').select('nome').in('id', formaIds)
      : Promise.resolve({ data: [] }),
    v.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', v.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const formaNome = ((formasRes as { data: { nome: string }[] | null }).data ?? [])
    .map((f) => f.nome).join(' + ') || null

  return {
    id: v.id,
    numero: v.numero,
    total: v.total,
    desconto: v.desconto ?? 0,
    created_at: v.created_at,
    vendedor_nome: v.vendedor_nome ?? null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    observacoes: v.observacoes,
    forma_pagamento_nome: formaNome,
    itens: ((itensRes.data ?? []) as unknown as { quantidade: number; preco_unitario: number; total_item: number; produtos: { nome: string } | null }[]).map((i) => ({
      nome: i.produtos?.nome ?? '—',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      total_item: i.total_item,
    })),
  }
}

// 2ª via: remonta o snapshot do cupom a partir de uma venda salva (mesma forma
// que o snap gerado na finalização), pra reimprimir do modal de vendas.
export interface CupomSnap {
  numero: number | null
  itens: { codigo: string | null; nome: string; quantidade: number; preco_unitario: number; prateleira: string | null }[]
  pagamentos: { forma_nome: string; valor: number; taxa: number; parcelas: number; status: string }[]
  cliente: string | null; clienteTelefone: string | null; clienteEndereco: string | null
  vendedor: string | null; deposito: string | null
  loja: string | null; lojaRazao: string | null; lojaCnpj: string | null; lojaIE: string | null
  lojaEndereco: string | null; lojaTelefone: string | null; lojaLogo: string | null; lojaTermos: string | null
  desconto: number; horario: string
}

export async function buscarCupomVenda(accessToken: string, vendaId: string): Promise<CupomSnap | null> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data: v } = await supabase
    .from('vendas')
    .select('numero, total, desconto, observacoes, created_at, vendedor_nome, pessoa_id, deposito_id')
    .eq('id', vendaId).maybeSingle()
  if (!v) return null

  const [itensRes, pagsRes, depRes, cliRes] = await Promise.all([
    supabase.from('itens_venda').select('quantidade, preco_unitario, produtos(nome, codigo, prateleira)').eq('venda_id', vendaId),
    supabase.from('pagamentos_venda').select('valor, taxa, parcelas, status, formas_pagamento(nome)').eq('venda_id', vendaId),
    v.deposito_id ? supabase.from('depositos').select('nome, loja_id').eq('id', v.deposito_id).maybeSingle() : Promise.resolve({ data: null }),
    v.pessoa_id ? supabase.from('pessoas').select('nome, telefone, endereco, bairro, cidade, estado, cep').eq('id', v.pessoa_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const dep = (depRes as { data: { nome: string | null; loja_id: string | null } | null }).data
  const { data: loja } = dep?.loja_id
    ? await supabase.from('lojas').select('nome, razao_social, cnpj, inscricao_estadual, endereco, numero, complemento, bairro, cidade, uf, cep, whatsapp, telefone, logo_url, termos_venda').eq('id', dep.loja_id).maybeSingle()
    : { data: null }

  const cli = (cliRes as { data: { nome: string; telefone: string | null; endereco: string | null; bairro: string | null; cidade: string | null; estado: string | null; cep: string | null } | null }).data
  const clienteEndereco = cli
    ? ([cli.endereco, cli.bairro, cli.cidade && cli.estado ? `${cli.cidade}/${cli.estado}` : (cli.cidade ?? cli.estado), cli.cep].filter(Boolean).join(', ') || null)
    : null
  const lojaEndereco = loja
    ? ([[loja.endereco, loja.numero].filter(Boolean).join(', '), loja.complemento, loja.bairro,
        loja.cidade && loja.uf ? `${loja.cidade}/${loja.uf}` : (loja.cidade ?? loja.uf), loja.cep ? `CEP: ${loja.cep}` : null].filter(Boolean).join(' - ') || null)
    : null

  return {
    numero: v.numero,
    itens: ((itensRes.data ?? []) as unknown as { quantidade: number; preco_unitario: number; produtos: { nome: string; codigo: string | null; prateleira: string | null } | null }[])
      .map((i) => ({ codigo: i.produtos?.codigo ?? null, nome: i.produtos?.nome ?? '—', quantidade: i.quantidade, preco_unitario: i.preco_unitario, prateleira: i.produtos?.prateleira ?? null })),
    pagamentos: ((pagsRes.data ?? []) as unknown as { valor: number; taxa: number | null; parcelas: number | null; status: string | null; formas_pagamento: { nome: string } | null }[])
      .map((p) => ({ forma_nome: p.formas_pagamento?.nome ?? '—', valor: Number(p.valor) || 0, taxa: Number(p.taxa) || 0, parcelas: p.parcelas ?? 1, status: p.status ?? 'pago' })),
    cliente: cli?.nome ?? null,
    clienteTelefone: cli?.telefone ?? null,
    clienteEndereco,
    vendedor: v.vendedor_nome ?? null,
    deposito: dep?.nome ?? null,
    loja: loja?.nome ?? null,
    lojaRazao: loja?.razao_social ?? null,
    lojaCnpj: loja?.cnpj ?? null,
    lojaIE: loja?.inscricao_estadual ?? null,
    lojaEndereco,
    lojaTelefone: loja?.whatsapp ?? loja?.telefone ?? null,
    lojaLogo: loja?.logo_url ?? null,
    lojaTermos: loja?.termos_venda ?? null,
    desconto: Number(v.desconto) || 0,
    horario: new Date(v.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' }),
  }
}

// Resolve em qual conta o dinheiro do fiado recebido cai, a partir do texto da forma
// (ex: 'dinheiro' → forma "Dinheiro" → conta_destino_id). Assim o saldo da conta é atualizado.
async function contaDaFormaTexto(supabase: Awaited<ReturnType<typeof createServiceClient>>, texto: string): Promise<string | null> {
  const t = (texto || '').trim().toLowerCase()
  if (!t) return null
  const { data } = await supabase.from('formas_pagamento').select('nome, tipo, conta_destino_id')
  const f = (data ?? []).find((x) => (x.nome ?? '').toLowerCase() === t || (x.tipo ?? '').toLowerCase() === t)
  return (f?.conta_destino_id as string | null) ?? null
}

// FIADO RECEBIDO ENTRA NO CAIXA.
//
// Buraco que existia: a Duda cobrava R$50 de fiado em espécie, o dinheiro ia pra
// gaveta, e o caixa não sabia de nada. No fechamento a contagem dava R$50 a MAIS que o
// esperado e o sistema acusava SOBRA — culpando quem tinha feito tudo certo.
//
// Agora todo recebimento de crediário vira um movimento do caixa aberto DAQUELA LOJA:
//   dinheiro → soma na gaveta (é cédula que entrou de verdade)
//   PIX/cartão → não é gaveta, mas aparece na linha do seu tipo pra conferir
//                (o comprovante do PIX de um fiado também precisa bater)
//
// Se não há caixa aberto na loja, não registra — e não quebra o recebimento: o dinheiro
// entrou de qualquer forma, e travar a cobrança por causa disso seria pior.
async function registrarNoCaixa(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  lojaId: string | null | undefined,
  valor: number,
  formaTexto: string,
  motivo: string,
): Promise<void> {
  if (!lojaId || !(valor > 0)) return
  const { data: caixa } = await supabase
    .from('caixas')
    .select('id')
    .eq('status', 'aberto')
    .eq('loja_id', lojaId)
    .maybeSingle()
  if (!caixa) return
  await supabase.from('movimentos_caixa').insert({
    caixa_id: caixa.id,
    tipo: 'recebimento',
    motivo,
    forma_pagamento: formaTexto || 'Dinheiro',
    valor,
  })
}

export async function pagarLancamentos(
  accessToken: string,
  ids: string[],
  formaPagamento = 'dinheiro',
  lojaId?: string | null,
): Promise<void> {
  if (ids.length === 0) return
  await requirePermissao('crediario_receber', accessToken)
  const supabase = await createServiceClient()
  const today = hojeSP()
  const contaId = await contaDaFormaTexto(supabase, formaPagamento)

  // pega o que sobrou de cada um ANTES de quitar — é esse valor que entra no caixa
  const { data: antes } = await supabase
    .from('lancamentos')
    .select('id, valor, valor_pago, pessoa_nome')
    .in('id', ids)

  const { data, error } = await supabase
    .from('lancamentos')
    .update({ status: 'pago', data_pagamento: today, forma_pagamento: formaPagamento, conta_id: contaId, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Pagamento não registrado — sem permissão ou lançamento não encontrado.')

  const total = (antes ?? []).reduce((s, l) => s + Math.max(0, (Number(l.valor) || 0) - (Number(l.valor_pago) || 0)), 0)
  const quem = (antes ?? []).length === 1 ? ((antes ?? [])[0].pessoa_nome ?? 'cliente') : `${(antes ?? []).length} fiados`
  await registrarNoCaixa(supabase, lojaId, Math.round(total * 100) / 100, formaPagamento, `Fiado recebido — ${quem}`)
}

export async function registrarPagamentoParcial(
  accessToken: string,
  id: string,
  valorPago: number,
  formaPagamento: string,
  lojaId?: string | null,
): Promise<{ quitado: boolean }> {
  await requirePermissao('crediario_receber', accessToken)
  const supabase = await createServiceClient()

  const { data: lanc, error: errBusca } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, historico_pagamentos, pessoa_nome')
    .eq('id', id)
    .single()
  if (errBusca || !lanc) throw new Error('Lançamento não encontrado.')

  const totalPagoAtualizado = (lanc.valor_pago ?? 0) + valorPago
  const quitado = totalPagoAtualizado >= lanc.valor
  const today = hojeSP()

  const novoRegistro: PagamentoHistorico = {
    valor: valorPago,
    forma: formaPagamento,
    data: new Date().toISOString(),
  }
  const historicoAtualizado = [...((lanc.historico_pagamentos as PagamentoHistorico[] | null) ?? []), novoRegistro]

  const update: Record<string, unknown> = {
    valor_pago: totalPagoAtualizado,
    forma_pagamento: formaPagamento,
    historico_pagamentos: historicoAtualizado,
    updated_at: new Date().toISOString(),
  }
  if (quitado) {
    update.status = 'pago'
    update.data_pagamento = today
    update.conta_id = await contaDaFormaTexto(supabase, formaPagamento)
  }

  const { error } = await supabase.from('lancamentos').update(update).eq('id', id)
  if (error) throw new Error(error.message)

  await registrarNoCaixa(supabase, lojaId, valorPago, formaPagamento, `Fiado recebido — ${lanc.pessoa_nome ?? 'cliente'}`)

  return { quitado }
}

// DESCONTO no fiado — perdoar parte da dívida (arredondar centavos, negociar cobrança).
//
// Desconto NÃO é forma de pagamento, mesmo aparecendo do lado das outras no modal.
// Se ele entrasse como "pagamento" o financeiro registraria dinheiro que nunca entrou
// no caixa — o cliente deve 100, paga 95, e o sistema diria que recebemos 100.
//
// Então o desconto ABATE A DÍVIDA: `valor` cai de 100 pra 95. O `valor_pago` só sobe
// com dinheiro de verdade. Assim o faturamento continua contando só o que entrou.
export async function aplicarDescontoCrediario(
  accessToken: string,
  id: string,
  valorDesconto: number,
  motivo: string,
): Promise<{ quitado: boolean; novoValor: number }> {
  await requirePermissao('crediario_receber', accessToken)
  await requirePermissao('venda_desconto', accessToken)   // perdoar dívida = dar desconto
  const supabase = await createServiceClient()

  const { data: lanc, error: errBusca } = await supabase
    .from('lancamentos')
    .select('valor, valor_pago, historico_pagamentos')
    .eq('id', id)
    .single()
  if (errBusca || !lanc) throw new Error('Lançamento não encontrado.')

  const valor = Number(lanc.valor) || 0
  const pago = Number(lanc.valor_pago) || 0
  const restante = Math.round((valor - pago) * 100) / 100

  // trava: nunca perdoar mais do que o cliente ainda deve (senão a dívida vira negativa)
  const desconto = Math.min(Math.round(valorDesconto * 100) / 100, restante)
  if (!(desconto > 0)) throw new Error('Desconto inválido.')

  const novoValor = Math.round((valor - desconto) * 100) / 100
  const quitado = pago >= novoValor

  const historico = (lanc.historico_pagamentos as PagamentoHistorico[] | null) ?? []
  const registro: PagamentoHistorico = {
    valor: desconto,
    forma: motivo.trim() ? `Desconto — ${motivo.trim()}` : 'Desconto',
    data: new Date().toISOString(),
    tipo: 'desconto',
  }

  const update: Record<string, unknown> = {
    valor: novoValor,
    historico_pagamentos: [...historico, registro],
    updated_at: new Date().toISOString(),
  }
  if (quitado) {
    update.status = 'pago'
    update.data_pagamento = hojeSP()
    // a conta é a do ÚLTIMO pagamento REAL — o desconto não move dinheiro nenhum.
    // Se a dívida foi 100% perdoada, conta_id fica null e nada entra em conta (correto).
    const ultimoReal = [...historico].reverse().find((h) => h.tipo !== 'desconto')
    if (ultimoReal) update.conta_id = await contaDaFormaTexto(supabase, ultimoReal.forma)
  }

  const { error } = await supabase.from('lancamentos').update(update).eq('id', id)
  if (error) throw new Error(error.message)
  return { quitado, novoValor }
}

export interface ItemPedido {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  codigo: string | null
}

export interface PedidoResumo {
  id: string
  tipo: string
  status: string
  total: number
  created_at: string
  pessoa_id: string | null
  pessoa_nome: string | null
  itens: ItemPedido[]
}

export async function buscarPedidosAbertos(accessToken: string): Promise<PedidoResumo[]> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      id, tipo, status, total, created_at, pessoa_id,
      pessoa:pessoas(nome),
      itens:itens_pedido(produto_id, quantidade, preco_unitario, produto:produtos(nome, codigo))
    `)
    .in('status', ['rascunho', 'pendente', 'aprovado'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    tipo: p.tipo ?? 'orcamento',
    status: p.status,
    total: p.total ?? 0,
    created_at: p.created_at,
    pessoa_id: p.pessoa_id ?? null,
    pessoa_nome: p.pessoa?.nome ?? null,
    itens: (p.itens ?? []).map((i: any) => ({
      produto_id: i.produto_id,
      nome: i.produto?.nome ?? 'Produto',
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      codigo: i.produto?.codigo ?? null,
    })),
  }))
}

export interface VendaResumo {
  id: string
  total: number
  desconto: number
  created_at: string
  forma_pagamento_id: string | null
  pessoa_id: string | null
}

// Buscar as últimas vendas concluídas para consulta no PDV (#9 Buscar Vendas)
export async function buscarVendas(accessToken: string, limite: number = 30): Promise<VendaResumo[]> {
  await requirePermissao('pdv', accessToken)
  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('vendas')
    .select('id, total, desconto, created_at, forma_pagamento_id, pessoa_id')
    .eq('status', 'concluida')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) throw new Error(error.message)
  return (data ?? []) as VendaResumo[]
}
