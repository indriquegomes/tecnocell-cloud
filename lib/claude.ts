import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

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

export async function* streamChat(
  mensagens: ChatMessage[],
  systemPrompt: string
): AsyncGenerator<string> {
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: mensagens.map((m) => ({ role: m.role, content: m.content })),
  })

  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield chunk.delta.text
    }
  }
}
