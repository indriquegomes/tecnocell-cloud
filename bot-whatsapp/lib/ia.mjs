import { env } from '../../bot/lib/env.mjs'
import { primeiroJson } from '../../bot/lib/util.mjs'

const DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY')
const MODELO = env('BOT_WHATSAPP_MODELO', 'deepseek-chat')

// Termina em "Mensagem do cliente: " de propósito — classificaPergunta() concatena
// o texto (via JSON.stringify, pra aspas dentro da mensagem do cliente não quebrar
// o prompt) na hora da chamada. NÃO usar template string com ${texto} aqui dentro:
// isso é uma constante de módulo, calculada uma vez só, antes de qualquer mensagem existir.
const PROMPT_BASE = `Mensagem de um cliente pra uma loja de celulares, recebida no WhatsApp.
Diga se é uma pergunta sobre PREÇO ou DISPONIBILIDADE (tem em estoque) de um
produto ou peça específico — ex: "quanto custa a tela do iphone 12", "vcs tem
bateria pra moto g54", "qual valor da capinha do redmi note 12".
NÃO é isso: reclamação, pergunta de horário/endereço, negociação de prazo,
conversa geral, cumprimento sem produto nenhum, e pergunta de STATUS sobre um
pedido/conversa anterior — tipo "aquele que eu perguntei ontem, chegou?" ou
"já ficou pronto?" — mesmo citando um produto, isso não é pergunta de preço
nem disponibilidade nova, é acompanhamento de algo já combinado antes.
Responda SÓ JSON: {"eh_pergunta_produto": <true|false>, "texto_busca": "<como o
cliente descreveu o produto, nas palavras dele, sem traduzir pro nome oficial;
null se eh_pergunta_produto for false>"}

Mensagem do cliente: `

export async function classificaPergunta(texto) {
  if (!DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY não configurada')
  const prompt = PROMPT_BASE + JSON.stringify(texto)
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    }),
  })
  if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  const textoResposta = data.choices?.[0]?.message?.content || ''
  const j = primeiroJson(textoResposta)
  if (!j) return { ehPerguntaProduto: false, textoBusca: null }
  return {
    ehPerguntaProduto: j.eh_pergunta_produto === true,
    textoBusca: j.eh_pergunta_produto === true ? (j.texto_busca || texto) : null,
  }
}
