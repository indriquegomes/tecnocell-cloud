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

export function buildSystemPrompt(
  tipo: 'funcionario' | 'cliente',
  contexto: Record<string, unknown>
): string {
  const base = `Você é um assistente virtual da TecnoCell Cloud, loja de smartphones, acessórios e eletrônicos com unidades em Petrópolis e Teresópolis (RJ).
Responda sempre em português brasileiro, de forma clara e objetiva.
Nunca invente informações — use apenas os dados fornecidos no contexto.`

  if (tipo === 'funcionario') {
    return `${base}

Você está conversando com um FUNCIONÁRIO da TecnoCell Cloud.
Pode responder sobre dados internos: estoque, financeiro, clientes, fornecedores.

CONTEXTO ATUAL DO SISTEMA:
${JSON.stringify(contexto, null, 2)}

Seja analítico e direto. Pode usar termos técnicos.`
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
