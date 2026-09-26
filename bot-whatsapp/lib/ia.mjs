import { env } from '../../bot/lib/env.mjs'
import { primeiroJson } from '../../bot/lib/util.mjs'

const DEEPSEEK_API_KEY = env('DEEPSEEK_API_KEY')
const MODELO = env('BOT_WHATSAPP_MODELO', 'deepseek-chat')

// Termina em "Mensagem do cliente: " de propósito — classificaPergunta() concatena
// o texto (via JSON.stringify, pra aspas dentro da mensagem do cliente não quebrar
// o prompt) na hora da chamada. NÃO usar template string com ${texto} aqui dentro:
// isso é uma constante de módulo, calculada uma vez só, antes de qualquer mensagem existir.
const PROMPT_BASE = `Mensagem de um cliente pra uma loja de celulares, recebida no WhatsApp.
Classifique em DOIS pontos:

1) PERGUNTA DE PRODUTO (preço ou disponibilidade): o cliente pergunta preço ou
se tem em estoque de um produto/peça específico — ex: "quanto custa a tela do
iphone 12", "vcs tem bateria pra moto g54", "qual valor da capinha do redmi
note 12". NÃO é: reclamação, horário/endereço, negociação de prazo, conversa
geral, cumprimento sem produto, e pergunta de STATUS de pedido anterior
("aquele que eu perguntei ontem chegou?", "já ficou pronto?").
Também é pergunta de produto quando o cliente SÓ manda o nome da peça/modelo,
sem verbo nenhum — ex: "frontal iphone 12", "tampa redmi 8 pro", "cabo tipo c"
— nesse caso ele quer saber preço/disponibilidade disso.

2) INTENÇÃO DE COMPRA (quer fechar agora): o cliente já decidiu levar — ex:
"quero 1", "me vê uma", "vou levar", "quero comprar", "fecha pra mim", "pode
separar", "me vende". NÃO é intenção de compra: perguntar preço, perguntar se
tem, ou conversa geral. Só é compra quando ele já demonstra que VAI fechar.

EXEMPLOS (siga EXATAMENTE esta lógica):
- "a bateria não veio" → eh_pergunta_produto FALSE (é RECLAMAÇÃO, não pergunta de preço)
- "a tela veio quebrada" → eh_pergunta_produto FALSE (reclamação)
- "cadê meu pedido" / "já mandou as telas" → eh_pergunta_produto FALSE (status de pedido)
- "quanto custa a bateria do iphone 12" → eh_pergunta_produto TRUE
- "tela do iphone 11" → eh_pergunta_produto TRUE (nome de peça sem verbo)
- "quero 1 tela do iphone 12" → eh_pergunta_produto FALSE e eh_compra TRUE
- "vcs tem bateria pra moto g54" → eh_pergunta_produto TRUE (pergunta se TEM = disponibilidade)
- "essa tela serve no iphone 11 pro max?" → eh_pergunta_produto TRUE (dúvida de compatibilidade é pergunta de produto)
- "meu celular caiu na água, conserta?" → eh_pergunta_produto FALSE (conserto/reparo, não preço de peça)
- "parcela no cartão?" / "vende fiado?" / "tem garantia?" → eh_pergunta_produto FALSE (forma de pagamento/política)
- "me vende essa bateria" → eh_pergunta_produto FALSE e eh_compra TRUE

Responda SÓ JSON: {"eh_pergunta_produto": <true|false>, "texto_busca": "<como o
cliente descreveu o produto, nas palavras dele, sem traduzir pro nome oficial;
null se eh_pergunta_produto for false>", "eh_compra": <true|false>}

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

export async function classificaPergunta(texto, resumo = '') {
  const prompt = (resumo ? resumo + '\n\n' : '') + PROMPT_BASE + JSON.stringify(texto)
  const j = primeiroJson(await chamaDeepSeek(prompt, 300))
  if (!j) return { ehPerguntaProduto: false, textoBusca: null, ehCompra: false }
  return {
    ehPerguntaProduto: j.eh_pergunta_produto === true,
    textoBusca: j.eh_pergunta_produto === true ? (j.texto_busca || texto) : null,
    ehCompra: j.eh_compra === true,
  }
}

const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',')

// Resposta natural (passo "mais humano"): a IA escreve o texto, mas ancorada SÓ
// nos dados reais do catálogo (nome, preço, estoque) que a busca trouxe. Mantém
// a precisão (não inventa preço) e deixa a conversa natural. Quem chama faz o
// fallback pro template fixo (montaResposta) se isto lançar.
export async function geraResposta(textoCliente, produtos, linkEncomendas) {
  const descreve = (p) => `${p.nome} | preço: ${brl(p.preco)} | ${p.estoque > 0 ? p.estoque + ' em estoque' : 'sem estoque'}`
  const dados = produtos.length === 1
    ? `Produto encontrado: ${descreve(produtos[0])}`
    : produtos.length > 1
      ? 'Opções encontradas:\n' + produtos.map((p) => `- ${descreve(p)}`).join('\n')
      : '(nenhum produto encontrado)'
  const prompt = `Você é o atendente do WhatsApp de uma loja de celulares (TecnoCell). Escreva a resposta pro cliente.

Regras:
- Português, curto, simpático e natural, como um vendedor de verdade (máximo 1-2 emojis).
- Use SÓ os dados do catálogo abaixo. NÃO invente preço, estoque nem produto.
- Se for "Produto encontrado" (UMA opção): responda naturalmente com preço e estoque. NÃO use número nem peça pra responder número.
- Se for "Opções encontradas" (VÁRIAS): liste com NÚMERO (1, 2, 3...) e preço, e peça pro cliente responder só o número.
- Se sem estoque, ofereça encomenda (link: ${linkEncomendas}).
- Se nenhum produto, peça o nome/modelo completo.

Cliente: ${textoCliente}

Catálogo:
${dados}

Resposta:`
  const r = await chamaDeepSeek(prompt, 200)
  return (r || '').trim()
}
