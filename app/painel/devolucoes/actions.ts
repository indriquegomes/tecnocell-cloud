'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { logAtividade } from '@/lib/log-atividade'
import { verificarSenhaLiberacao } from '@/lib/senha-liberacao'
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
import { palavrasBusca } from '@/lib/busca-produtos'

export interface ItemVendaParaDevolucao {
  produto_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  total_item: number
  series: string[]   // IMEIs vendidos deste produto nesta venda (vazio p/ não serializado)
}

export interface VendaParaDevolucao {
  id: string
  numero: number | null
  total: number
  total_original: number   // soma dos itens a preço cheio (antes do desconto da venda) — base fixa do rateio do desconto, mesmo após devolução parcial
  taxa_cartao: number   // taxa de cartão embutida no total — NÃO reembolsável na devolução
  created_at: string
  pessoa_id: string | null
  pessoa_nome: string | null
  telefone: string | null
  vendedor_nome: string | null
  deposito_id: string | null
  deposito_nome: string | null
  forma_pagamento_nome: string | null
  lancamento_pendente: boolean
  fiado_restante: number   // quanto da venda ainda é dívida (fiado em aberto)
  /**
   * Como a venda foi PAGA de verdade (só o que trouxe dinheiro — fiado e vale
   * ficam de fora). A tela usa pra já sugerir o reembolso do mesmo jeito que
   * entrou: entrou R$50 dinheiro + R$50 PIX → devolve igual, sem a operadora
   * ter que lembrar. Ela pode mudar tudo depois se o cliente pedir diferente.
   */
  pagamentos: { tipo: string; nome: string; valor: number }[]
  itens: ItemVendaParaDevolucao[]
}

export interface DevolucaoResumo {
  id: string
  venda_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  valor_total: number
  tipo_credito: string
  motivo: string | null
  created_at: string
}

export interface VendaResumo {
  id: string
  numero: number | null
  pessoa_nome: string | null
  total: number
  created_at: string
  /** nomes dos produtos da venda — pra busca por item mostrar o que cada venda tem */
  itens: string[]
}

export async function buscarVendaParaDevolucao(
  accessToken: string,
  vendaId: string,
): Promise<VendaParaDevolucao | null> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  const [vendaRes, itensRes, lancRes, seriesRes, pagRes, devolucoesRes] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, vendedor_nome, forma_pagamento_id, pessoa_id, deposito_id, pessoas!pessoa_id(nome, telefone, celular)')
      .eq('id', vendaId)
      .maybeSingle(),
    supabase
      .from('itens_venda')
      .select('quantidade, preco_unitario, total_item, produto_id, produtos(nome)')
      .eq('venda_id', vendaId),
    supabase
      .from('lancamentos')
      .select('id, status, valor, valor_pago')
      .eq('tipo', 'receber')
      .eq('status', 'pendente')
      .eq('venda_id', vendaId),
    supabase
      .from('numeros_serie')
      .select('produto_id, serie')
      .eq('venda_id', vendaId)
      .eq('status', 'vendido'),
    supabase
      .from('pagamentos_venda')
      .select('taxa, valor, status, forma_pagamento_id, formas_pagamento(nome, tipo)')
      .eq('venda_id', vendaId),
    supabase
      .from('devolucoes')
      .select('id')
      .eq('venda_id', vendaId)
      .eq('status', 'concluida'),
  ])

  // IMEIs vendidos agrupados por produto (aparelhos serializados desta venda)
  const seriesPorProduto: Record<string, string[]> = {}
  for (const s of (seriesRes.data ?? []) as { produto_id: string; serie: string }[]) {
    ;(seriesPorProduto[s.produto_id] ??= []).push(s.serie)
  }

  // Já devolvido desta venda (devolução parcial): subtrai pra não oferecer devolver
  // de novo a peça que já saiu — era o "item cancelado que não sai da nota" e deixava
  // devolver a MESMA peça duas vezes quando a nota tinha outro item pra devolver.
  const devolvidoPorProduto: Record<string, number> = {}
  const devIds = ((devolucoesRes.data ?? []) as { id: string }[]).map((d) => d.id)
  if (devIds.length) {
    const { data: itensDev } = await supabase
      .from('itens_devolucao')
      .select('produto_id, quantidade')
      .in('devolucao_id', devIds)
    for (const it of (itensDev ?? []) as { produto_id: string; quantidade: number | null }[]) {
      if (it.produto_id) devolvidoPorProduto[it.produto_id] = (devolvidoPorProduto[it.produto_id] ?? 0) + (it.quantidade ?? 0)
    }
  }

  if (!vendaRes.data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vRaw = vendaRes.data as any
  const pessoaNome = (vRaw.pessoas?.nome ?? vRaw.vendedor_nome ?? null) as string | null
  // Taxa de cartão embutida no total (repasse do custo da maquininha). NÃO é valor de
  // produto → não reembolsa na devolução (pedido Isa 28/07): a base do reembolso é
  // `total − taxa`. Cartão TON etc. gravam taxa em pagamentos_venda; dinheiro/fiado = 0.
  const taxaCartao = ((pagRes.data ?? []) as { taxa: number | null }[]).reduce((s, p) => s + (p.taxa ?? 0), 0)

  // Formas que trouxeram dinheiro de verdade: status 'pago'. Fiado ('pendente')
  // é dívida e o vale ('vale') saiu do saldo do cliente — nenhum dos dois entra
  // no reembolso, a devolução trata cada um no seu lugar.
  type FormaEmb = { nome: string | null; tipo: string | null }
  const embForma = (p: unknown): FormaEmb | null => {
    const f = (p as { formas_pagamento?: FormaEmb | FormaEmb[] | null }).formas_pagamento
    return Array.isArray(f) ? (f[0] ?? null) : (f ?? null)
  }
  const pagamentosPagos = ((pagRes.data ?? []) as unknown[])
    .filter((p) => (p as { status: string | null }).status === 'pago')
    .map((p) => ({
      tipo: embForma(p)?.tipo ?? 'outros',
      nome: embForma(p)?.nome ?? 'Outra forma',
      valor: Number((p as { valor: number | null }).valor ?? 0),
    }))
    .filter((p) => p.valor > 0 && p.tipo !== 'fiado' && p.tipo !== 'vale_credito')

  const [formaRes, depositoRes] = await Promise.all([
    vRaw.forma_pagamento_id
      ? supabase.from('formas_pagamento').select('nome').eq('id', vRaw.forma_pagamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    vRaw.deposito_id
      ? supabase.from('depositos').select('nome').eq('id', vRaw.deposito_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: vRaw.id,
    numero: vRaw.numero ?? null,
    total: vRaw.total,
    total_original: ((itensRes.data ?? []) as { total_item?: number | null }[]).reduce((s, i) => s + (Number(i.total_item) || 0), 0),
    taxa_cartao: taxaCartao,
    created_at: vRaw.created_at,
    pessoa_id: (vRaw.pessoa_id ?? null) as string | null,
    pessoa_nome: pessoaNome,
    telefone: (vRaw.pessoas?.celular ?? vRaw.pessoas?.telefone ?? null) as string | null,
    vendedor_nome: vRaw.vendedor_nome ?? null,
    deposito_id: (vRaw.deposito_id ?? null) as string | null,
    deposito_nome: (depositoRes as { data: { nome: string } | null }).data?.nome ?? null,
    forma_pagamento_nome: (formaRes as { data: { nome: string } | null }).data?.nome ?? null,
    lancamento_pendente: (lancRes.data ?? []).length > 0,
    fiado_restante: (lancRes.data ?? []).reduce(
      (s, l) => s + (((l as { valor: number | null }).valor ?? 0) - ((l as { valor_pago: number | null }).valor_pago ?? 0)),
      0,
    ),
    pagamentos: pagamentosPagos,
    itens: ((itensRes.data ?? []) as unknown as {
      produto_id: string; quantidade: number; preco_unitario: number
      total_item: number; produtos: { nome: string } | null
    }[]).map((i) => {
      const preco = i.total_item != null && i.quantidade > 0 ? i.total_item / i.quantidade : i.preco_unitario
      return {
        produto_id: i.produto_id,
        nome: i.produtos?.nome ?? '—',
        quantidade: Math.max(0, i.quantidade - (devolvidoPorProduto[i.produto_id] ?? 0)),
        preco_unitario: preco,
        total_item: i.total_item,
        series: seriesPorProduto[i.produto_id] ?? [],
      }
    }).filter((i) => i.quantidade > 0),
  }
}

export async function buscarVendasRecentes(
  accessToken: string,
  busca: string,
): Promise<VendaResumo[]> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()

  // Busca no BANCO (não filtra 50 recentes na memória — assim acha QUALQUER venda):
  // número → busca exata por `numero`; texto → nome do cliente (resolve os ids em pessoas)
  // com fallback pro vendedor. Vazio → as 50 últimas (lista padrão do modal).
  const b = busca.trim()
  // 90 dias corridos atrás — limite da busca de devolução pra não varrer os 12
  // meses inteiros (ficava pesado). As outras telas continuam sem esse limite.
  const corte = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const sel = 'id, numero, total, created_at, vendedor_nome, pessoa_id, pessoas!pessoa_id(nome)'
  let vsel
  if (/^\d+$/.test(b)) {
    vsel = await supabase.from('vendas').select(sel).eq('status', 'concluida').eq('numero', Number(b)).gte('created_at', corte).limit(20)
  } else if (b) {
    // Busca inteligente: cada palavra pode ser CLIENTE ou ITEM. Se o termo tem
    // palavra que casa com cliente E palavra que casa com item ("otica frontal"),
    // restringe as vendas DO CLIENTE às que têm aquele item. Senão: cliente OU
    // item OU vendedor.
    const palavras = palavrasBusca(b)

    // clientes que casam com alguma palavra
    const anyPessoa = palavras.map((w) => `nome_norm.ilike.%${w}%`).join(',')
    const { data: ps } = palavras.length
      ? await supabase.from('pessoas').select('id').eq('ativo', true).or(anyPessoa).limit(60)
      : { data: [] as { id: string }[] }
    const pids = ((ps ?? []) as { id: string }[]).map((p) => p.id)

    // vendas dos clientes encontrados
    let idsPessoa: string[] = []
    if (pids.length) {
      const { data: vp } = await supabase.from('vendas').select('id').eq('status', 'concluida').in('pessoa_id', pids).gte('created_at', corte).order('created_at', { ascending: false }).limit(200)
      idsPessoa = (vp ?? []).map((v) => v.id as string)
    }

    // tem palavra que casa com ITEM (produto)?
    const anyProduto = palavras.map((w) => `busca_norm.ilike.%${w}%`).join(',')
    const { data: prods } = palavras.length
      ? await supabase.from('produtos').select('id').eq('ativo', true).or(anyProduto).limit(200)
      : { data: [] as { id: string }[] }
    const prodIds = ((prods ?? []) as { id: string }[]).map((p) => p.id)

    let ids: string[]
    if (idsPessoa.length && prodIds.length) {
      // CLIENTE + ITEM: das vendas do cliente, fica só a que tem item casando.
      // Busca direta nos itens do cliente — não depende do limite de produtos.
      const { data: its } = await supabase
        .from('itens_venda')
        .select('venda_id, produtos(busca_norm)')
        .in('venda_id', idsPessoa)
      const set = new Set<string>()
      for (const it of (its ?? []) as { venda_id: string; produtos: { busca_norm: string }[] | { busca_norm: string } | null }[]) {
        const pr = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
        const bn = pr?.busca_norm?.toLowerCase() ?? ''
        if (palavras.some((w) => bn.includes(w))) set.add(it.venda_id)
      }
      ids = [...set]
    } else if (idsPessoa.length) {
      ids = idsPessoa
    } else {
      // sem cliente: item OU vendedor
      let idsItem: string[] = []
      if (prodIds.length) {
        const { data: its } = await supabase.from('itens_venda').select('venda_id').in('produto_id', prodIds).limit(500)
        idsItem = [...new Set(((its ?? []) as { venda_id: string }[]).map((i) => i.venda_id))]
      }
      const { data: vv } = await supabase.from('vendas').select('id').eq('status', 'concluida').ilike('vendedor_nome', `%${b}%`).gte('created_at', corte).limit(50)
      ids = [...new Set([...idsItem, ...((vv ?? []).map((v) => v.id as string))])]
    }

    vsel = ids.length
      ? await supabase.from('vendas').select(sel).eq('status', 'concluida').in('id', ids).gte('created_at', corte).order('created_at', { ascending: false }).limit(50)
      : { data: [], error: null }
  } else {
    vsel = await supabase.from('vendas').select(sel).eq('status', 'concluida').gte('created_at', corte).order('created_at', { ascending: false }).limit(50)
  }
  const { data, error } = vsel

  if (error) throw new Error(error.message)

  // Esconde vendas já totalmente devolvidas (evita devolução dupla).
  // Soma o valor devolvido por venda e compara com o DEVOLVÍVEL = total − taxa de cartão
  // (a taxa não é reembolsável, então o devolvido máximo é o valor de produto, não o total
  // com taxa — senão a venda toda devolvida reaparecia por causa dos centavos da taxa).
  const ids = (data ?? []).map((v) => v.id as string)
  const devolvidoPorVenda: Record<string, number> = {}
  const taxaPorVenda: Record<string, number> = {}
  if (ids.length) {
    const { data: devs } = await supabase
      .from('devolucoes').select('venda_id, valor_total').in('venda_id', ids)
    for (const d of (devs ?? []) as { venda_id: string | null; valor_total: number | null }[]) {
      if (d.venda_id) devolvidoPorVenda[d.venda_id] = (devolvidoPorVenda[d.venda_id] ?? 0) + (d.valor_total ?? 0)
    }
    const { data: pgs } = await supabase
      .from('pagamentos_venda').select('venda_id, taxa').in('venda_id', ids)
    for (const p of (pgs ?? []) as { venda_id: string | null; taxa: number | null }[]) {
      if (p.venda_id) taxaPorVenda[p.venda_id] = (taxaPorVenda[p.venda_id] ?? 0) + (p.taxa ?? 0)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sobreviventes = (data ?? [])
    .filter((v: any) => (devolvidoPorVenda[v.id] ?? 0) < ((v.total as number) - (taxaPorVenda[v.id] ?? 0)) - 0.01)

  // Nomes dos produtos de cada venda — a busca por item precisa mostrar O QUE a
  // venda tem (junto do cliente) pra operadora achar a venda certa sem abrir uma a uma.
  const itensPorVenda: Record<string, string[]> = {}
  const sobrevIds = sobreviventes.map((v: any) => v.id as string)
  if (sobrevIds.length) {
    const { data: its } = await supabase.from('itens_venda').select('venda_id, produtos(nome)').in('venda_id', sobrevIds)
    for (const it of (its ?? []) as { venda_id: string; produtos: { nome: string }[] | { nome: string } | null }[]) {
      const prod = Array.isArray(it.produtos) ? it.produtos[0] : it.produtos
      const nome = prod?.nome
      if (nome) (itensPorVenda[it.venda_id] ??= []).push(nome)
    }
  }

  const rows = sobreviventes.map((v: any) => ({
    id: v.id as string,
    numero: v.numero as number | null,
    pessoa_nome: (v.pessoas?.nome ?? v.vendedor_nome ?? null) as string | null,
    total: v.total as number,
    created_at: v.created_at as string,
    itens: itensPorVenda[v.id as string] ?? [],
  }))

  return rows
}

export interface RegistrarDevolucaoInput {
  venda_id: string
  deposito_id: string | null
  pessoa_id: string | null
  pessoa_nome: string | null
  vendedor_nome: string | null
  motivo: string
  /** motivo FECHADO (teste | defeito_alegado | cliente_desistiu | peca_errada | outro) */
  motivo_tipo: string
  tipo_credito: string
  /**
   * Reembolso MISTO: parte em dinheiro, parte em PIX, parte como crédito.
   * Opcional — sem isto, usa `tipo_credito` (uma forma só), como sempre foi.
   * A soma tem que fechar com o reembolso; o RPC recusa a devolução se não bater.
   */
  reembolsos?: { tipo: string; valor: number; conta_id?: string | null }[]
  itens: { produto_id: string; nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string; series?: string[] }[]
  lancamento_pendente: boolean
  /**
   * Senha de liberação do dono. Quando a devolução fura uma regra de dinheiro, ele
   * digita esta senha e a devolução passa NAQUELA VEZ, com registro. A senha é
   * conferida no servidor (hash scrypt ou variável de ambiente) — nunca no navegador.
   */
  senhaLiberacao?: string
}

// Em produção o Next ESCONDE a mensagem de erro lançada por server action: o
// atendente recebe "An error occurred in the Server Components render" + digest, sem
// saber o motivo. Foi o que aconteceu em 22/10 (vendas 9094/9095): a trava nova de
// PIX-em-venda-de-dinheiro recusou, mas a tela mostrou o erro genérico em vez do texto.
// Por isso a função pública devolve o erro como DADO (ok:false) e a mensagem de
// negócio chega legível na tela.
export type ResultadoRegistroDevolucao =
  | { ok: true; id: string; abate_fiado: number; reembolso: number; saldo_devedor: number | null; liberadoPorSenha?: boolean }
  | { ok: false; erro: string; podeLiberarComSenha?: boolean }

// Erro de REGRA (bloqueio de dinheiro) — a tela usa isto para oferecer o campo da
// senha de liberação do dono em vez de só mostrar o texto.
class ErroDeRegra extends Error {}

export async function registrarDevolucao(
  accessToken: string,
  input: RegistrarDevolucaoInput,
): Promise<ResultadoRegistroDevolucao> {
  try {
    return { ok: true, ...(await registrarDevolucaoInterno(accessToken, input)) }
  } catch (erro) {
    const msg = erro instanceof Error && erro.message ? erro.message : 'Erro ao registrar devolução.'
    console.error('registrarDevolucao recusou:', msg)
    return { ok: false, erro: msg, podeLiberarComSenha: erro instanceof ErroDeRegra }
  }
}

async function registrarDevolucaoInterno(
  accessToken: string,
  input: RegistrarDevolucaoInput,
): Promise<{ id: string; abate_fiado: number; reembolso: number; saldo_devedor: number | null; liberadoPorSenha: boolean }> {
  const usuario = await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()
  // As regras de devolução valem para TODOS, inclusive o master (decisão do dono em
  // 22/10) — por isso esta função não consulta mais o perfil para liberar exceção.

  // Dados da venda pra travar o reembolso na forma certa (não confia no cliente).
  const [{ data: vendaOrig }, { data: pagOrig }] = await Promise.all([
    supabase.from('vendas').select('created_at').eq('id', input.venda_id).maybeSingle(),
    supabase.from('pagamentos_venda').select('forma_pagamento_id, formas_pagamento(tipo)').eq('venda_id', input.venda_id),
  ])
  const vendaDia = ((vendaOrig as { created_at?: string } | null)?.created_at ?? '').slice(0, 10)
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const tipoDePag = (p: { formas_pagamento?: { tipo?: string } | { tipo?: string }[] | null }) => {
    const f = p.formas_pagamento
    return Array.isArray(f) ? (f[0]?.tipo ?? '') : (f?.tipo ?? '')
  }
  const tiposPag = ((pagOrig ?? []) as { formas_pagamento?: { tipo?: string } | { tipo?: string }[] | null }[]).map(tipoDePag)
  const temCartao = tiposPag.some((t) => t === 'cartao_credito' || t === 'cartao_debito')
  // Venda 100% em dinheiro: o dinheiro entrou na GAVETA, não no banco. Devolver por
  // PIX tira o valor da conta errada (a gaveta fica com o dinheiro e o banco paga).
  // Confirmado em produção em 22/10 (venda #9049, teste do dono): passava direto
  // porque a única trava de PIX olhava cartão.
  const soDinheiro = tiposPag.length > 0 && tiposPag.every((t) => t === 'dinheiro')
  const vaiSairPix = input.reembolsos && input.reembolsos.length > 0
    ? input.reembolsos.some((r) => r.tipo === 'pix' && r.valor > 0.005)
    : input.tipo_credito === 'pix'

  // TRAVA: devolver DINHEIRO exige caixa aberto.
  //
  // Dinheiro devolvido sai da gaveta e é registrado como movimento do caixa —
  // é o único lugar onde esse valor existe (o RPC não cria lançamento pra
  // dinheiro, de propósito: é evento de caixa, não conta a pagar). Sem caixa
  // aberto não havia onde gravar: a nota saía da mão da atendente e o sistema
  // ficava só com um aviso no log que ninguém lê. O estoque voltava, a
  // devolução aparecia na lista, mas o dinheiro sumia do controle.
  //
  // Checado ANTES do RPC pra não deixar a devolução meio-feita: ou dá tudo
  // certo, ou nada acontece.
  const vaiSairDinheiro = input.reembolsos && input.reembolsos.length > 0
    ? input.reembolsos.some((r) => r.tipo === 'dinheiro' && r.valor > 0.005)
    : input.tipo_credito === 'dinheiro'

  // ═══ REGRAS DE DEVOLUÇÃO — política do dono (22/10) ═════════════════════════
  // Princípio: a devolução sai pela MESMA forma que entrou.
  //   dinheiro  → dinheiro (só no mesmo dia)
  //   PIX       → PIX
  //   cartão    → estorno na maquininha
  //   crédito   → sempre permitido (é saldo na loja, não sai dinheiro de lugar nenhum)
  // SEM EXCEÇÃO (decisão do dono em 22/10): nem o master libera. A regra é dura para
  // todos; o aviso ensina o caminho correto e o que fazer quando não houver como
  // (devolver como crédito). Cada bloqueio fica registrado.
  const nomeForma: Record<string, string> = {
    dinheiro: 'DINHEIRO', pix: 'PIX', cartao_credito: 'CARTÃO DE CRÉDITO',
    cartao_debito: 'CARTÃO DE DÉBITO', vale_credito: 'VALE-CRÉDITO', fiado: 'FIADO',
  }
  const classeDaForma = (t: string) => (t === 'cartao_credito' || t === 'cartao_debito' ? 'cartao' : t)
  const classesVenda = [...new Set(tiposPag.map(classeDaForma))]
  const comoEntrou = [...new Set(tiposPag.map((t) => nomeForma[t] ?? t))].join(' + ') || 'forma não identificada'
  const ddVenda = vendaDia ? vendaDia.slice(8, 10) + '/' + vendaDia.slice(5, 7) + '/' + vendaDia.slice(0, 4) : '—'
  const mesmoDia = !!vendaDia && vendaDia === hoje

  // Recusa fica REGISTRADA. Quando a regra bloqueava, não sobrava nada no banco — em
  // 22/10 o dono tentou 3x na venda #9137 e não deu pra saber por quê. Agora cada
  // bloqueio vira linha em logs_atividade.
  // SENHA DO DONO: se ele digitou a senha de liberação e ela conferiu, a regra fica
  // anotada como liberada e a devolução segue — registrando quem estava logado e qual
  // regra foi furada. Sem senha (ou senha errada), bloqueia como sempre.
  const regrasLiberadas: string[] = []
  const senhaFornecida = (input.senhaLiberacao ?? '').trim()
  let senhaOk = false
  if (senhaFornecida) {
    // Anti-chute: 3 erros em 10 minutos bloqueiam por 10 minutos.
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { count: erros } = await supabase
      .from('logs_atividade')
      .select('id', { count: 'exact', head: true })
      .eq('tipo_acao', 'devolucao.senha_liberacao_errada')
      .eq('usuario_id', usuario.id)
      .gte('created_at', desde)
    if ((erros ?? 0) >= 3) {
      throw new Error('Muitas tentativas de senha erradas (3 em 10 minutos). Aguarde 10 minutos e tente de novo.')
    }
    const verificado = await verificarSenhaLiberacao(senhaFornecida)
    if (!verificado.ok) {
      await logAtividade('devolucao.senha_liberacao_errada', {
        venda_id: input.venda_id,
        pessoa_nome: input.pessoa_nome,
        motivo: verificado.motivo,
      }, usuario, '/painel/devolucoes')
      throw new Error(
        verificado.motivo === 'nao_configurada'
          ? 'A senha de liberação ainda não foi configurada no sistema. Devolva na forma da regra ou como crédito.'
          : 'Senha de liberação incorreta. Confira com o dono e tente de novo.',
      )
    }
    senhaOk = true
  }

  const barrar = async (regra: string, resumo: string, alternativa: string): Promise<void> => {
    if (senhaOk) { regrasLiberadas.push(regra); return }
    await logAtividade('devolucao.regra_bloqueada', {
      regra,
      motivo: resumo,
      venda_id: input.venda_id,
      pessoa_nome: input.pessoa_nome,
      valor: input.reembolsos?.length ? input.reembolsos.reduce((t, r) => t + Number(r.valor || 0), 0) : null,
      formas: input.reembolsos ?? input.tipo_credito,
      como_a_venda_foi_paga: tiposPag,
    }, usuario, '/painel/devolucoes')
    throw new ErroDeRegra(
      `⚠️ REGRA: ${resumo}\n\nO correto agora: ${alternativa}\n\n` +
      'Se o DONO autorizar mesmo assim, ele digita a senha de liberação abaixo: a devolução passa só nesta vez e fica registrada.',
    )
  }

  // REGRA 1: DINHEIRO só no MESMO dia da venda (a gaveta daquele dia já foi contada).
  if (vaiSairDinheiro && vendaDia && !mesmoDia) {
    await barrar(
      'REGRA 1 (dinheiro só no mesmo dia)',
      `devolução em DINHEIRO só no mesmo dia da venda — esta venda é de ${ddVenda}, e o caixa daquele dia já foi fechado.`,
      'devolver em PIX ou como crédito.',
    )
  }

  // REGRA 2: venda em CARTÃO devolve por ESTORNO na maquininha.
  if (temCartao && vaiSairPix) {
    await barrar(
      'REGRA 2 (cartão devolve por estorno)',
      'venda paga em CARTÃO devolve por ESTORNO na maquininha — o dinheiro está na adquirente, não na conta.',
      'fazer o estorno na maquininha ou devolver como crédito.',
    )
  }

  // REGRA 3: venda em DINHEIRO devolve em DINHEIRO.
  // O valor entrou na GAVETA; devolver por PIX paga com dinheiro do banco e deixa a
  // gaveta com a venda na mão (aconteceu de verdade na venda #9049 em 22/10).
  if (soDinheiro && vaiSairPix) {
    await barrar(
      'REGRA 3 (dinheiro devolve em dinheiro)',
      'esta venda foi paga em DINHEIRO — o valor está na gaveta, não no banco.',
      mesmoDia
        ? 'devolver em dinheiro (a venda é de hoje) ou como crédito.'
        : `devolver como crédito (a venda é de ${ddVenda}, e o dinheiro daquele dia já foi contado).`,
    )
  }

  // REGRA 4: venda que NÃO entrou em dinheiro não devolve em DINHEIRO.
  // Espelho da regra 3. Em 22/10 a venda #9137 (R$ 61,00 em PIX) foi devolvida em
  // dinheiro e o caixa perdeu R$ 61 que nunca passaram pela gaveta.
  if (vaiSairDinheiro && tiposPag.length > 0 && !classesVenda.includes('dinheiro')) {
    await barrar(
      'REGRA 4 (venda sem dinheiro não devolve em dinheiro)',
      `esta venda foi paga em ${comoEntrou} — nenhum valor entrou na gaveta, então devolver em DINHEIRO tira da gaveta um dinheiro que não veio dela.`,
      `devolver na MESMA forma que entrou (${comoEntrou}) ou como crédito.`,
    )
  }

  // REGRA 5: venda que NÃO passou na maquininha não devolve por ESTORNO de cartão.
  // "Cartão só em estorno" (política do dono): estorno é desfazer uma passada na
  // adquirente. Se a venda entrou em dinheiro/PIX, não existe transação para estornar.
  // Atenção: a forma de reembolso usa as chaves 'debito'/'credito' (não
  // 'cartao_debito'/'cartao_credito'), por isso a classe é normalizada aqui.
  const classeDoReembolso = (t: string) => (t === 'debito' || t === 'credito' ? 'cartao' : t)
  const vaiSairCartao = input.reembolsos && input.reembolsos.length > 0
    ? input.reembolsos.some((r) => classeDoReembolso(r.tipo) === 'cartao' && r.valor > 0.005)
    : classeDoReembolso(input.tipo_credito) === 'cartao'
  if (vaiSairCartao && tiposPag.length > 0 && !classesVenda.includes('cartao')) {
    await barrar(
      'REGRA 5 (estorno só de venda no cartão)',
      `esta venda foi paga em ${comoEntrou} — não passou na maquininha, então não há o que estornar.`,
      'devolver na MESMA forma que entrou ou como crédito.',
    )
  }

  if (vaiSairDinheiro) {
    if (!input.deposito_id) {
      throw new Error('Devolução em dinheiro precisa saber de qual loja sai — esta venda está sem depósito. Devolva como crédito, PIX ou cartão.')
    }
    const { data: dep, error: erroDep } = await supabase
      .from('depositos').select('loja_id').eq('id', input.deposito_id).maybeSingle()
    if (erroDep) throw new Error('Não deu pra conferir a loja do depósito: ' + erroDep.message)
    const lojaId = (dep as { loja_id: string | null } | null)?.loja_id ?? null
    if (!lojaId) {
      throw new Error('O depósito desta venda não está ligado a nenhuma loja, então não dá pra tirar dinheiro da gaveta. Devolva como crédito, PIX ou cartão.')
    }
    const { data: caixa, error: erroCaixa } = await supabase
      .from('caixas').select('id').eq('status', 'aberto').eq('loja_id', lojaId)
      .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
    if (erroCaixa) throw new Error('Não deu pra conferir o caixa: ' + erroCaixa.message)
    if (!caixa) {
      throw new Error('Não tem caixa aberto nesta loja. Devolução em dinheiro sai da gaveta, então precisa de caixa aberto pra ficar registrada. Abra o caixa e refaça, ou devolva como crédito/PIX/cartão.')
    }
  }

  // Tudo numa transação atômica no RPC (migration 2026-07-03): devolução + itens +
  // retorno ao estoque + financeiro. Falha em qualquer passo reverte o conjunto —
  // sem devolução órfã nem estoque retornado pela metade.
  // IMEIs devolvidos (aparelhos serializados) — cada um com o status escolhido
  const series = input.itens.flatMap((i) =>
    (i.series ?? []).map((serie) => ({ produto_id: i.produto_id, serie, status_produto: i.status_produto })),
  )

  const { data, error } = await supabase.rpc('registrar_devolucao', {
    p_venda_id: input.venda_id,
    p_deposito_id: input.deposito_id,
    p_pessoa_id: input.pessoa_id,
    p_pessoa_nome: input.pessoa_nome,
    p_vendedor_nome: input.vendedor_nome,
    p_motivo: input.motivo,
    p_tipo_credito: input.tipo_credito,
    p_itens: input.itens,
    p_lancamento_pendente: input.lancamento_pendente,
    p_series: series,
    p_reembolsos: input.reembolsos && input.reembolsos.length > 0 ? input.reembolsos : null,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('RPC registrar_devolucao retornou vazio.')

  const devolucaoId = (data as { devolucao_id: string }).devolucao_id
  const abateFiado = Number((data as { abate_fiado?: number }).abate_fiado ?? 0)
  const reembolso = Number((data as { reembolso?: number }).reembolso ?? 0)
  // Só a fatia em DINHEIRO sai da gaveta. No misto, o resto já virou crédito ou
  // lançamento dentro do RPC — usar o reembolso cheio aqui tiraria do caixa
  // dinheiro que na verdade voltou por PIX/cartão.
  const reembolsoDinheiro = Number((data as { reembolso_dinheiro?: number }).reembolso_dinheiro ?? 0)

  for (const item of input.itens) {
    void sincronizarEstoqueML(item.produto_id)
  }

  // DINHEIRO devolvido SAI DA GAVETA — registra a saída no caixa aberto da loja.
  // O RPC já não cria lançamento financeiro pra dinheiro (migration de 15/07): o
  // dinheiro é evento de CAIXA, não conta a pagar. Aqui fechamos o outro lado —
  // sem isto, a gaveta perdia o dinheiro físico e o sistema não registrava, e o
  // fechamento acusava falta. Débito/crédito/PIX NÃO passam por aqui (não saem da
  // gaveta). Fora do RPC de propósito: uma escrita de caixa não deve reverter a
  // devolução (estoque/crédito) se der ruim — ela é secundária ao ato de devolver.
  if (reembolsoDinheiro > 0.005 && input.deposito_id) {
    const { data: dep, error: erroDep } = await supabase.from('depositos').select('loja_id').eq('id', input.deposito_id).maybeSingle()
    if (erroDep) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolsoDinheiro} em dinheiro sem registro nenhum — falha ao buscar loja do depósito:`, erroDep.message)
    const lojaId = (dep as { loja_id: string | null } | null)?.loja_id ?? null
    if (lojaId) {
      const { data: caixa, error: erroCaixa } = await supabase
        .from('caixas').select('id').eq('status', 'aberto').eq('loja_id', lojaId)
        .order('aberto_em', { ascending: false }).limit(1).maybeSingle()
      if (erroCaixa) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolsoDinheiro} em dinheiro sem registro nenhum — falha ao buscar caixa aberto:`, erroCaixa.message)
      const caixaId = (caixa as { id: string } | null)?.id ?? null
      if (caixaId) {
        const { error: erroMov } = await supabase.from('movimentos_caixa').insert({
          caixa_id: caixaId,
          tipo: 'devolucao',
          forma_pagamento: 'Dinheiro',
          valor: reembolsoDinheiro,
          motivo: `Devolução — ${input.pessoa_nome ?? 'Cliente'}`,
        })
        if (erroMov) console.error(`Devolução ${devolucaoId}: reembolso de ${reembolsoDinheiro} em dinheiro não gravou no caixa:`, erroMov.message)
      } else if (!erroCaixa) {
        // Nenhum caixa aberto nesta loja — o RPC não cria lançamento pra
        // dinheiro (é evento de caixa, não conta a pagar), então sem isto o
        // reembolso não fica registrado em NENHUM lugar. Não trava a
        // devolução por causa disso (estoque/crédito já foram revertidos de
        // verdade), mas precisa ficar visível pra alguém conferir na mão.
        console.error(`Devolução ${devolucaoId}: reembolso de ${reembolsoDinheiro} em dinheiro NÃO tem registro nenhum — nenhum caixa aberto na loja ${lojaId} no momento da devolução.`)
      }
    }
  }

  // O motivo é um RÓTULO, não dinheiro — grava DEPOIS, fora do RPC. Não mexo no
  // registrar_devolucao (que move estoque, crédito e fiado numa transação atômica)
  // só pra carregar uma etiqueta: o risco não compensa.
  if (input.motivo_tipo) {
    await supabase.from('devolucoes').update({ motivo_tipo: input.motivo_tipo }).eq('id', devolucaoId)
  }

  // Câmera de segurança: registra QUEM devolveu, qual venda e quanto. Nunca derruba a
  // devolução se o log falhar (a própria logAtividade engole o erro).
  await logAtividade('devolucao.criar', {
    devolucao_id: devolucaoId,
    venda_id: input.venda_id,
    pessoa_nome: input.pessoa_nome,
    tipo_credito: input.tipo_credito,
    motivo: input.motivo_tipo || input.motivo || null,
    reembolso,
  }, usuario, '/painel/devolucoes')

  // REGISTRO DA LIBERAÇÃO: o dono digitou a senha e a devolução furou uma regra de
  // dinheiro. Guarda qual regra foi furada, o valor, as formas e QUEM estava logado —
  // é a diferença entre "o dono autorizou" e "alguém usou a senha sem ele saber".
  if (regrasLiberadas.length > 0) {
    await logAtividade('devolucao.regra_liberada_por_senha', {
      devolucao_id: devolucaoId,
      venda_id: input.venda_id,
      pessoa_nome: input.pessoa_nome,
      regras: regrasLiberadas,
      como_a_venda_foi_paga: tiposPag,
      formas: input.reembolsos ?? input.tipo_credito,
      reembolso,
    }, usuario, '/painel/devolucoes')
  }
  // Saldo devedor ATUALIZADO do cliente (depois do abate) — a mensagem de
  // cancelamento de fiado mostra quanto ele AINDA deve. Só por pessoa_id (FK de
  // verdade); sem pessoa_id não dá pra confiar (nome duplicado é problema real).
  let saldoDevedor: number | null = null
  if (input.pessoa_id) {
    const { data: lancs } = await supabase.from('lancamentos')
      .select('valor, valor_pago')
      .eq('pessoa_id', input.pessoa_id)
      .eq('tipo', 'receber')
      .eq('status', 'pendente')
    saldoDevedor = (lancs ?? []).reduce(
      (s, l) => s + Math.max(0, ((l as { valor: number | null }).valor ?? 0) - ((l as { valor_pago: number | null }).valor_pago ?? 0)),
      0,
    )
  }

  return { id: devolucaoId, abate_fiado: abateFiado, reembolso, saldo_devedor: saldoDevedor, liberadoPorSenha: regrasLiberadas.length > 0 }
}

export async function buscarItensDevolucao(
  accessToken: string,
  devolucaoId: string,
): Promise<{ nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]> {
  await requirePermissao('devolucoes', accessToken)
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('itens_devolucao')
    .select('nome, quantidade, preco_unitario, total_item, status_produto')
    .eq('devolucao_id', devolucaoId)
  return (data ?? []) as { nome: string; quantidade: number; preco_unitario: number; total_item: number; status_produto: string }[]
}
