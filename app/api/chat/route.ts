import { NextRequest } from 'next/server'
import { createClient, createServiceClient, permissoesEfetivas, fetchAll } from '@/lib/supabase/server'
import { createHash } from 'crypto'
import { temPermissao } from '@/lib/permissoes'
import { streamChatComFerramentas, buildSystemPrompt, type ChatMessage, type Ferramenta } from '@/lib/chat-ia'

// Rate-limit simples em memória por IP.
const hits = new Map<string, number[]>()
function limitado(ip: string, max = 20, janelaMs = 60_000): boolean {
  const agora = Date.now()
  const recentes = (hits.get(ip) ?? []).filter((t) => agora - t < janelaMs)
  recentes.push(agora)
  hits.set(ip, recentes)
  return recentes.length > max
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido'
  if (limitado(ip)) return new Response('Muitas requisições. Aguarde um momento.', { status: 429 })

  const raw = await req.text()
  if (raw.length > 16000) return new Response('Mensagem muito grande.', { status: 413 })
  let body
  try { body = JSON.parse(raw) } catch { return new Response('JSON inválido.', { status: 400 }) }
  if (!body || !Array.isArray(body.mensagens) || body.mensagens.length < 1 || body.mensagens.length > 20 ||
      body.mensagens.some((m: ChatMessage) => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 4000)) {
    return new Response('Mensagens inválidas.', { status: 400 })
  }
  const { mensagens, tipo: tipoRequisitado = 'cliente' } = body as { mensagens: ChatMessage[]; tipo: 'funcionario' | 'cliente' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const service = await createServiceClient()
  const { data: reservado, error: erroLimite } = await service.rpc('reservar_chat', { p_chave: createHash('sha256').update(user?.id ?? ip).digest('hex') })
  if (erroLimite) return new Response('Chat temporariamente indisponível.', { status: 503 })
  if (!reservado) return new Response('Limite do chat atingido. Aguarde um minuto.', { status: 429 })

  let podeFuncionario = false
  if (user) {
    const { permissoes, isMaster, ativo } = await permissoesEfetivas(user.id)
    podeFuncionario = ativo && temPermissao(permissoes, 'chat_ia', isMaster)
  }
  const tipo: 'funcionario' | 'cliente' = (tipoRequisitado === 'funcionario' && podeFuncionario) ? 'funcionario' : 'cliente'

  let nomeUsuario: string | undefined
  if (user) {
    const { data: perfil } = await service.from('perfis').select('nome').eq('id', user.id).maybeSingle()
    nomeUsuario = perfil?.nome ?? undefined
  }

  const ferramentas = montaFerramentas(tipo, service)
  const systemPrompt = buildSystemPrompt(tipo, {}, nomeUsuario)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChatComFerramentas(mensagens, systemPrompt, ferramentas)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (e) {
        controller.enqueue(encoder.encode('[Erro: ' + String(e) + ']'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  })
}

function montaFerramentas(tipo: 'funcionario' | 'cliente', service: any): Ferramenta[] {
  const publico = tipo === 'cliente'
  const fs: Ferramenta[] = [buscarProdutos(service, publico)]
  if (!publico) {
    fs.push(estoqueProduto(service))
    fs.push(buscarCliente(service))
    fs.push(fiadoCliente(service))
    fs.push(financeiroResumo(service))
    fs.push(vendasPeriodo(service))
    fs.push(maisVendidos(service))
  }
  return fs
}

// "tela" = "frontal" = "display" (e "redmi" = "xiaomi"): o cliente fala um,
// o catálogo grava outro. Sem isso, "tela iphone 11" não acha "FRONTAL IPHONE 11".
function variantesDeBusca(t: string): string[] {
  const sin: Array<[RegExp, string[]]> = [
    [/\btelas?\b/i, ['frontal', 'display']],
    [/\bfrontal\b/i, ['tela', 'display']],
    [/\bdisplay\b/i, ['tela', 'frontal']],
    [/\bredmi\b/i, ['xiaomi']],
  ]
  const variantes = [t]
  for (const [re, subs] of sin) if (re.test(t)) for (const s of subs) variantes.push(t.replace(re, s))
  return [...new Set(variantes)]
}

function buscarProdutos(service: any, publico: boolean): Ferramenta {
  return {
    nome: 'buscar_produtos',
    descricao: 'Busca produtos do catálogo por nome ou código (trecho). Devolve nome, preço, marca e categoria.',
    parametros: { type: 'object', properties: { termo: { type: 'string', description: 'parte do nome ou código do produto' } }, required: ['termo'] },
    executar: async (args) => {
      const t = String(args.termo ?? '').trim()
      if (!t) return JSON.stringify({ erro: 'informe o termo de busca' })
      const orBusca = variantesDeBusca(t).flatMap((v) => ['nome.ilike.%' + v + '%,codigo.ilike.%' + v + '%'])
      let q = service.from('produtos').select('nome, preco, marca, categoria, codigo').or(orBusca.join(',')).eq('ativo', true)
      if (publico) q = q.eq('visivel_catalogo', true)
      const { data, error } = await q.limit(15)
      if (error) return JSON.stringify({ erro: error.message })
      return JSON.stringify({ resultados: data ?? [] })
    },
  }
}

function estoqueProduto(service: any): Ferramenta {
  return {
    nome: 'estoque_produto',
    descricao: 'Estoque atual de um produto, separado por depósito.',
    parametros: { type: 'object', properties: { termo: { type: 'string', description: 'nome ou código do produto' } }, required: ['termo'] },
    executar: async (args) => {
      const t = String(args.termo ?? '').trim()
      if (!t) return JSON.stringify({ erro: 'informe o produto' })
      const { data: prods } = await service.from('produtos').select('id, nome').or('nome.ilike.%' + t + '%,codigo.ilike.%' + t + '%').eq('ativo', true).limit(5)
      if (!prods?.length) return JSON.stringify({ erro: 'produto não encontrado' })
      const ids = prods.map((p: any) => p.id)
      const { data: est } = await service.from('estoque').select('produto_id, quantidade, depositos(nome)').in('produto_id', ids)
      const porProduto: Record<string, Array<{ deposito: string; quantidade: number }>> = {}
      for (const e of est ?? []) {
        const nome = prods.find((p: any) => p.id === e.produto_id)?.nome ?? e.produto_id;
        (porProduto[nome] ??= []).push({ deposito: e.depositos?.nome ?? '?', quantidade: e.quantidade ?? 0 })
      }
      return JSON.stringify({ estoque: porProduto })
    },
  }
}

function buscarCliente(service: any): Ferramenta {
  return {
    nome: 'buscar_cliente',
    descricao: 'Dados de um cliente por nome ou telefone: tabela de preço, limite de crédito, se pode comprar fiado, se está bloqueado para venda.',
    parametros: { type: 'object', properties: { termo: { type: 'string', description: 'nome ou telefone do cliente' } }, required: ['termo'] },
    executar: async (args) => {
      const t = String(args.termo ?? '').trim()
      if (!t) return JSON.stringify({ erro: 'informe nome ou telefone' })
      const { data } = await service.from('pessoas').select('nome, telefone, celular, tabela_preco_id, limite_credito, permite_fiado, nao_vender, nao_vender_motivo').or('nome.ilike.%' + t + '%,telefone.ilike.%' + t + '%,celular.ilike.%' + t + '%').limit(5)
      if (!data?.length) return JSON.stringify({ erro: 'cliente não encontrado' })
      const tabIds = [...new Set(data.map((p: any) => p.tabela_preco_id).filter(Boolean))] as string[]
      let tabNome: Record<string, string> = {}
      if (tabIds.length) {
        const { data: tabs } = await service.from('tabelas_preco').select('id, nome').in('id', tabIds)
        tabNome = Object.fromEntries((tabs ?? []).map((t: any) => [t.id, t.nome]))
      }
      const resultado = data.map((p: any) => ({ nome: p.nome, telefone: p.telefone, celular: p.celular, tabela: p.tabela_preco_id ? (tabNome[p.tabela_preco_id] ?? p.tabela_preco_id) : 'sem tabela', limite_credito: p.limite_credito, permite_fiado: p.permite_fiado, nao_vender: p.nao_vender, nao_vender_motivo: p.nao_vender_motivo }))
      return JSON.stringify({ clientes: resultado })
    },
  }
}

function fiadoCliente(service: any): Ferramenta {
  return {
    nome: 'fiado_cliente',
    descricao: 'Quanto um cliente deve em aberto (fiado pendente). Busca pelo nome do cliente.',
    parametros: { type: 'object', properties: { termo: { type: 'string', description: 'nome do cliente' } }, required: ['termo'] },
    executar: async (args) => {
      const t = String(args.termo ?? '').trim()
      if (!t) return JSON.stringify({ erro: 'informe o nome do cliente' })
      const { data } = await service.from('lancamentos').select('pessoa_nome, valor, valor_pago').eq('tipo', 'receber').eq('status', 'pendente').ilike('pessoa_nome', '%' + t + '%').limit(200)
      if (!data?.length) return JSON.stringify({ erro: 'nada em aberto para esse cliente' })
      const porNome: Record<string, number> = {}
      for (const l of data) {
        const n = l.pessoa_nome ?? '?'
        porNome[n] = (porNome[n] ?? 0) + Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0))
      }
      return JSON.stringify({ fiado: Object.entries(porNome).map(([cliente, em_aberto]) => ({ cliente, em_aberto })) })
    },
  }
}

function financeiroResumo(service: any): Ferramenta {
  return {
    nome: 'financeiro_resumo',
    descricao: 'Resumo financeiro: total a receber e total a pagar (pendentes).',
    parametros: { type: 'object', properties: {} },
    executar: async () => {
      const lancs = await fetchAll<{ valor: number | null; valor_pago: number | null; tipo: string }>((from, to) => service.from('lancamentos').select('valor, valor_pago, tipo').eq('status', 'pendente').order('id').range(from, to))
      const aReceber = (lancs ?? []).filter((l) => l.tipo === 'receber').reduce((s, l) => s + Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0)), 0)
      const aPagar = (lancs ?? []).filter((l) => l.tipo === 'pagar').reduce((s, l) => s + Math.max(0, (l.valor ?? 0) - (l.valor_pago ?? 0)), 0)
      return JSON.stringify({ a_receber: aReceber, a_pagar: aPagar })
    },
  }
}

function vendasPeriodo(service: any): Ferramenta {
  return {
    nome: 'vendas_periodo',
    descricao: 'Resumo de vendas concluídas num período (quantidade e total).',
    parametros: { type: 'object', properties: { de: { type: 'string', description: 'data inicial AAAA-MM-DD' }, ate: { type: 'string', description: 'data final AAAA-MM-DD' } }, required: ['de', 'ate'] },
    executar: async (args) => {
      const de = String(args.de ?? ''), ate = String(args.ate ?? '')
      if (!de || !ate) return JSON.stringify({ erro: 'informe de e ate (AAAA-MM-DD)' })
      const vs = await fetchAll<{ total: number | null }>((from, to) => service.from('vendas').select('total').eq('status', 'concluida').gte('created_at', de + 'T00:00:00').lte('created_at', ate + 'T23:59:59').range(from, to))
      const total = (vs ?? []).reduce((s, v) => s + (v.total ?? 0), 0)
      return JSON.stringify({ quantidade: vs?.length ?? 0, total })
    },
  }
}

function maisVendidos(service: any): Ferramenta {
  return {
    nome: 'mais_vendidos',
    descricao: 'Produtos mais vendidos (quantidade) num período.',
    parametros: { type: 'object', properties: { de: { type: 'string', description: 'data inicial AAAA-MM-DD' }, ate: { type: 'string', description: 'data final AAAA-MM-DD' } }, required: ['de', 'ate'] },
    executar: async (args) => {
      const de = String(args.de ?? ''), ate = String(args.ate ?? '')
      if (!de || !ate) return JSON.stringify({ erro: 'informe de e ate (AAAA-MM-DD)' })
      const itens = await fetchAll<{ quantidade: number; produtos: { nome: string } | null }>((from, to) => service.from('itens_venda').select('quantidade, produtos(nome), vendas!inner(created_at, status)').eq('vendas.status', 'concluida').gte('vendas.created_at', de + 'T00:00:00').lte('vendas.created_at', ate + 'T23:59:59').range(from, to))
      const porProduto: Record<string, number> = {}
      for (const it of itens ?? []) {
        const nome = it.produtos?.nome ?? '?'
        porProduto[nome] = (porProduto[nome] ?? 0) + (Number(it.quantidade) || 0)
      }
      const top = Object.entries(porProduto).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([produto, quantidade]) => ({ produto, quantidade }))
      return JSON.stringify({ mais_vendidos: top })
    },
  }
}