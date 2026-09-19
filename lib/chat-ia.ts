// IA do chat (widget do painel + loja virtual). Usa a API da DeepSeek — barata e
// forte, e a chave já existe no .env.local (a mesma do bot WhatsApp). A API é
// compatível com OpenAI, então é só um fetch puro — sem SDK novo.
//
// Antes era o Claude (Anthropic), mas a chave ANTHROPIC_API_KEY não estava
// configurada e o modelo saía caro pra uso contínuo no balcão.

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MODELO = process.env.CHAT_IA_MODELO || 'deepseek-chat'

export type ChatRole = 'user' | 'assistant'
export interface ChatMessage { role: ChatRole; content: string }

// Apelidos carinhosos das funcionárias (trecho do nome no cadastro -> apelido).
const APELIDOS: Array<{ chave: string; apelido: string }> = [
  { chave: 'indrique', apelido: 'El Mestre' },
  { chave: 'brunna', apelido: 'Tia Buna' },
  { chave: 'joao vitor', apelido: 'VT' },
  { chave: 'maria eduarda', apelido: 'Duda' },
  { chave: 'mariana', apelido: 'Mary' },
  { chave: 'isabela', apelido: 'Isa' },
]

function apelidoDe(nome?: string): string | undefined {
  if (!nome) return undefined
  const n = nome.toLowerCase()
  return APELIDOS.find((a) => n.includes(a.chave))?.apelido
}

export function buildSystemPrompt(
  tipo: 'funcionario' | 'cliente',
  contexto: Record<string, unknown>,
  nomeUsuario?: string
): string {
  const base = `Você é a assistente virtual da TecnoCell Cloud, loja de smartphones, acessórios e eletrônicos com unidades em Petrópolis e Teresópolis (RJ).
Seja MEIGA e carinhosa, mas SUCINTA e OBJETIVA: responda em no máximo 2 ou 3 frases, direto ao ponto, sem enrolação.
Nunca invente informações. Para responder com dados reais, use as FERRAMENTAS disponíveis (chame a ferramenta certa e aguarde o resultado antes de responder). Só use os dados que as ferramentas devolverem.`

  if (tipo === 'funcionario') {
    const apelido = apelidoDe(nomeUsuario)
    const ehMestre = apelido === 'El Mestre'
    const tratamento = ehMestre
      ? 'Você está conversando com o DONO da TecnoCell Cloud. Chame-o de "El Mestre". Seja submissa e amável com ele.'
      : `Você está conversando com uma FUNCIONÁRIA da TecnoCell Cloud${nomeUsuario ? ` (${nomeUsuario})` : ''}.\nTrate-a com carinho${apelido ? ` e chame-a de "${apelido}"` : ' e chame-a pelo primeiro nome'}.`
    return `${base}

${tratamento}
Pode responder sobre dados internos: estoque, financeiro, clientes, fornecedores.

CONTEXTO ATUAL DO SISTEMA:
${JSON.stringify(contexto, null, 2)}

Seja analítica e direta. Pode usar termos técnicos, mas sempre com jeitinho.`
  }

  return `${base}

Você está conversando com um CLIENTE da TecnoCell Cloud.
Apenas responda sobre: produtos disponíveis, preços, disponibilidade em estoque e informações gerais da loja.
NÃO divulgue dados financeiros, custos internos ou informações de outros clientes.

CATÁLOGO DISPONÍVEL:
${JSON.stringify(contexto, null, 2)}`
}

// Streaming via SSE da DeepSeek. Devolve os pedaços de texto conforme chegam,
// no mesmo formato que o antigo streamChat do Claude — os consumidores não mudam.
export async function* streamChat(
  mensagens: ChatMessage[],
  systemPrompt: string
): AsyncGenerator<string> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY não configurada')

  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: 'system', content: systemPrompt },
        ...mensagens.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      max_tokens: 1024,
    }),
  })

  if (!resp.ok || !resp.body) {
    throw new Error(`DeepSeek API ${resp.status}: ${await resp.text().catch(() => '')}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE: uma linha "data: {...}" por evento. A última linha do buffer pode
      // ter vindo pela metade — guarda pra próxima leitura.
      const linhas = buffer.split('\n')
      buffer = linhas.pop() ?? ''

      for (const linha of linhas) {
        const s = linha.trim()
        if (!s.startsWith('data:')) continue
        const payload = s.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const j = JSON.parse(payload)
          const delta = j.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) yield delta
        } catch { /* linha malformada — ignora */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
// ---- Ferramentas (function calling): a IA chama uma ferramenta, o código
// roda a consulta no Supabase e devolve só o resultado — assim ela acessa
// qualquer dado do app sem precisar de tudo no prompt. ----

export interface Ferramenta {
  nome: string
  descricao: string
  parametros: Record<string, unknown>
  executar: (args: Record<string, unknown>) => Promise<string>
}

type MsgDeepSeek = {
  role: string
  content?: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

async function chamaDeepSeekNaoStream(mensagens: MsgDeepSeek[], ferramentas: Ferramenta[]): Promise<{ content: string | null; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY não configurada')
  const resp = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: MODELO,
      messages: mensagens,
      tools: ferramentas.map((f) => ({ type: 'function', function: { name: f.nome, description: f.descricao, parameters: f.parametros } })),
      tool_choice: 'auto',
      max_tokens: 1024,
    }),
  })
  if (!resp.ok) throw new Error('DeepSeek API ' + resp.status + ': ' + (await resp.text().catch(() => '')))
  const data = await resp.json()
  const msg = data.choices?.[0]?.message as { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } | undefined
  const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments ?? '{}' }))
  return { content: msg?.content ?? null, toolCalls }
}

export async function* streamChatComFerramentas(
  mensagens: ChatMessage[],
  systemPrompt: string,
  ferramentas: Ferramenta[]
): AsyncGenerator<string> {
  const historico: MsgDeepSeek[] = [
    { role: 'system', content: systemPrompt },
    ...mensagens.map((m) => ({ role: m.role, content: m.content })),
  ]

  let resposta: string | null = null
  for (let rodada = 0; rodada < 4; rodada++) {
    const ret = await chamaDeepSeekNaoStream(historico, ferramentas)
    if (ret.toolCalls.length === 0) { resposta = ret.content; break }

    historico.push({
      role: 'assistant',
      content: ret.content ?? '',
      tool_calls: ret.toolCalls.map((tc) => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } })),
    })

    for (const tc of ret.toolCalls) {
      const f = ferramentas.find((x) => x.nome === tc.name)
      let resultado: string
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {}
        resultado = f ? await f.executar(args) : JSON.stringify({ erro: 'ferramenta não existe' })
      } catch (e) {
        resultado = JSON.stringify({ erro: String(e) })
      }
      historico.push({ role: 'tool', tool_call_id: tc.id, content: resultado })
    }
  }

  yield resposta ?? 'Não consegui montar uma resposta agora. Pode reformular a pergunta?'
}

