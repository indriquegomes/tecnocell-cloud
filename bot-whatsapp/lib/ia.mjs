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

async function chamaDeepSeek(prompt, maxTokens) {
  if (!DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY não configurada')
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELO,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    }),
  })
  if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}: ${await resp.text()}`)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function classificaPergunta(texto) {
  const prompt = PROMPT_BASE + JSON.stringify(texto)
  const j = primeiroJson(await chamaDeepSeek(prompt, 200))
  if (!j) return { ehPerguntaProduto: false, textoBusca: null }
  return {
    ehPerguntaProduto: j.eh_pergunta_produto === true,
    textoBusca: j.eh_pergunta_produto === true ? (j.texto_busca || texto) : null,
  }
}

// Termina em "Mensagem do cliente: " pelo mesmo motivo do PROMPT_BASE acima —
// concatenar depois via JSON.stringify, nunca template string aqui dentro.
const PROMPT_ESCOLHE_BASE = `Um cliente de uma loja de celulares está perguntando sobre um produto.
Aqui está uma lista de produtos do catálogo que podem ser o que ele quer:

`

// Deixa a IA escolher entre candidatos usando entendimento de verdade (sinônimo,
// termo comum, cor, apelido — não precisa bater palavra por palavra como a busca
// no banco exige). Só narra UMA escolha quando está confiante; ambíguo continua
// ambíguo — quem chama trata "indice: null" como "ainda não sei", nunca chuta.
//
// "indice: null" sozinho não dizia POR QUE: "são vários, falta o cliente
// escolher a cor" e "nenhum desses é o que ele pediu" viravam a mesma coisa —
// o bot mostrava a lista toda de qualquer jeito, mesmo quando a busca larga
// (buscaProdutosAmplo) só achou produto de categoria errada (achou só porque
// bateu no modelo do aparelho, não na peça pedida). Confirmado em produção
// 24/08: "frontal iphone 13 pro max" (loja não vende tela/frontal de iPhone)
// voltava "CAPAS CASE IPHONE 11/12/13" como se fossem opção. `nenhumServe`
// separa os dois casos — e resolve pra qualquer catálogo, grande ou pequeno,
// porque quem decide é a IA entendendo a pergunta, não contagem de palavra.
export async function escolheProduto(textoCliente, candidatos) {
  if (!candidatos || candidatos.length === 0) return { indice: null, nenhumServe: false }
  // Sem atalho pra length===1: quem chama de sessao.mjs também usa isso pra
  // checar candidato ÚNICO vindo da busca ampla (fraca) — confirmar às cegas
  // reintroduziria o mesmo bug que essa função existe pra evitar.

  const lista = candidatos.map((p, i) => `${i + 1}. ${p.nome}`).join('\n')
  const prompt = PROMPT_ESCOLHE_BASE + lista +
    `\n\nMensagem do cliente: ` + JSON.stringify(textoCliente) +
    `\n\nQual desses produtos (se algum) é o que o cliente quer? Considere sinônimo,
termo comum, cor, apelido, resposta curta tipo "a primeira" ou "o pro max" —
não precisa bater palavra por palavra. IMPORTANTE: só escolha um índice
específico se a MENSAGEM DO CLIENTE realmente indicar qual variante ele quer.
Se os itens da lista só se diferenciam por algo que o cliente não mencionou
(ex.: só varia a cor e ele não disse a cor nenhuma vez) -> indice null, sempre
— não adivinhe a variante, deixe o cliente escolher. Responda SÓ JSON:
{"indice": <número de 1 a ${candidatos.length} SE E SOMENTE SE a mensagem do
cliente aponta claramente pra essa opção; null se não dá pra saber qual>,
"nenhum_serve": <compare o TIPO de peça que o cliente pediu (o
substantivo principal: tela, frontal, tampa, capa, bateria, espátula, cabo...)
com o tipo de CADA item da lista.
- Todos os itens são do MESMO tipo pedido, só varia cor/modelo/tamanho/marca
  entre eles -> nenhum_serve false (é só o cliente escolher qual variante,
  isso é ambiguidade normal, não invente diferença).
- NENHUM item é do tipo pedido (tipo diferente, mesmo que relacionado — ex.:
  cliente pediu "tela/frontal" e a lista só tem CAPA, CASE ou CARCAÇA; carcaça
  pode até vir com peça extra junto, mas não é uma tela) -> nenhum_serve true.
Não marque true só por faltar informação dentro do mesmo tipo de peça.>}`

  const j = primeiroJson(await chamaDeepSeek(prompt, 80))
  const nenhumServe = j?.nenhum_serve === true
  const indice = j?.indice
  if (typeof indice !== 'number' || !Number.isInteger(indice) || indice < 1 || indice > candidatos.length) {
    return { indice: null, nenhumServe }
  }
  return { indice, nenhumServe: false }
}
