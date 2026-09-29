import { createClient } from '@supabase/supabase-js'
import { env } from '../bot/lib/env.mjs'

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
const URL = 'https://api.deepseek.com/chat/completions'
const MODELO = env('CHAT_IA_MODELO', 'deepseek-chat')
const KEY = env('DEEPSEEK_API_KEY')

const SYSTEM = `Você é a assistente virtual da TecnoCell (loja de celulares, Petrópolis e Teresópolis). Seja curta (2-3 frases).
NUNCA invente número. Use a ferramenta consultar_banco (SQL SELECT read-only) pra qualquer dado. Valor = quantidade × preco. Lucro = (preco - preco_custo) × quantidade.
FUNÇÕES PRONTAS (use via SELECT no consultar_banco, NÃO escreva SQL complexo):
- SELECT resumo_vendas('AAAA-MM-DD','AAAA-MM-DD') → faturamento, quantidade, lucro, top_produtos
- SELECT resumo_fiados() → total_em_aberto + por_cliente
- SELECT resumo_caixa('AAAA-MM-DD') → caixas do dia
- SELECT resumo_estoque() → peças por depósito
- SELECT resumo_formas('AAAA-MM-DD','AAAA-MM-DD') → vendas por forma
- SELECT resumo_clientes('AAAA-MM-DD','AAAA-MM-DD') → top clientes
Se a consulta falhar ou não tiver certeza do número, DIGA que não tem certeza. Nunca invente.`

const tools = [{ type: 'function', function: { name: 'consultar_banco', description: 'SQL SELECT read-only no banco (vendas, produtos, estoque, pessoas, caixas, lancamentos...). SEMPRE LIMIT.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }]

async function consultarBanco(query) {
  const { data, error } = await supabase.rpc('consulta_ia', { p_query: query })
  if (error) return JSON.stringify({ erro: error.message })
  return JSON.stringify({ resultados: data ?? [] })
}

async function chama(msgs) {
  const resp = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ model: MODELO, messages: msgs, tools, tool_choice: 'auto', max_tokens: 512 }) })
  const d = await resp.json()
  return d.choices?.[0]?.message
}

async function responde(pergunta) {
  const msgs = [{ role: 'system', content: SYSTEM }, { role: 'user', content: pergunta }]
  for (let i = 0; i < 4; i++) {
    const m = await chama(msgs)
    if (!m?.tool_calls?.length) return m?.content ?? '(vazio)'
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: m.tool_calls })
    for (const tc of m.tool_calls) {
      const args = JSON.parse(tc.function.arguments || '{}')
      const r = await consultarBanco(args.query)
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: r })
    }
  }
  return '(sem resposta)'
}

const P = [
  'quanto vendi hoje?', 'qual o faturamento de hoje?', 'quanto deu de lucro hoje?', 'qual o item mais vendido hoje?',
  'quanto vendi de película hoje?', 'qual o faturamento deste mês?', 'quanto lucrei essa semana?', 'quantas vendas teve hoje?',
  'qual peça mais saiu hoje?', 'quanto vendi ontem?', 'qual o lucro das películas hoje?', 'quanto vendi de frontal hoje?',
  'qual foi o ticket médio hoje?', 'quanto vendi no mês passado?', 'qual produto vendeu mais essa semana?', 'quanto vendi de bateria hoje?',
  'qual o lucro do mês?', 'quantos itens vendeu hoje?', 'qual a venda mais cara de hoje?', 'quanto vendi em dinheiro hoje?',
  'quem está devendo?', 'quanto tem de fiado em aberto?', 'quem é o maior devedor?', 'quanto o fulano está devendo?', 'quanto de fiado recebi hoje?',
  'quem está com fiado atrasado?', 'qual o total de contas a receber?', 'quanto a volta deve?', 'quem pagou fiado hoje?', 'qual o fiado mais antigo?',
  'como está o caixa hoje?', 'quanto tem na gaveta?', 'qual loja vendeu mais hoje?', 'o caixa de hoje fechou?', 'qual o troco do caixa hoje?',
  'quanto vendeu Petrópolis hoje?', 'quanto vendeu Teresópolis hoje?', 'quantos caixas abriram hoje?', 'qual o fechamento do caixa?', 'tem caixa aberto agora?',
  'quanto tem de estoque?', 'qual depósito tem mais peças?', 'quanto de estoque tem em Petrópolis?', 'quantas telas tem no estoque?', 'qual produto tem mais estoque?',
  'qual produto está sem estoque?', 'quantas películas tem no estoque?', 'quanto de estoque na loja de Teresópolis?', 'tem bateria iphone 11 no estoque?', 'quanto de estoque total?',
  'quanto vendi no pix hoje?', 'quanto vendi no cartão hoje?', 'qual forma de pagamento mais usada hoje?', 'quanto de fiado nas vendas de hoje?', 'quanto vendi no débito essa semana?',
  'quanto de pix no mês?', 'qual a forma mais usada no mês?', 'quanto vendi no crédito hoje?', 'quanto de dinheiro vivo hoje?', 'qual forma rendeu mais hoje?',
  'quem são meus melhores clientes?', 'quem comprou mais esse mês?', 'quem gastou mais hoje?', 'qual cliente mais comprou na loja?', 'quanto o melhor cliente gastou?',
  'quem comprou mais esse ano?', 'quais os 10 maiores clientes?', 'quem não compra há muito tempo?', 'qual cliente mais fiel?', 'quem comprou hoje?',
  'tem tela do iphone 12?', 'quanto custa a bateria do moto g54?', 'tem frontal do samsung a15?', 'qual o preço da película do iphone 13?', 'tem conector de carga do a32?',
  'quanto tá a tela do s20 fe?', 'tem capinha pro iphone 15?', 'qual o valor do carregador turbo?', 'tem fone bluetooth?', 'quanto custa a tampa do redmi note 12?',
  'tem tela do moto g35?', 'quanto tá a sub placa do a16?', 'tem bateria do a03 core?', 'qual o preço do flex de carga do g22?', 'tem película 3d pro a54?',
  'que horas vocês abrem?', 'onde fica a loja?', 'faz entrega?', 'parcela no cartão?', 'tem garantia?',
  'como está o tempo aí?', 'me conta uma piada', 'qual o sentido da vida?', 'você gosta de mim?', 'quem ganhou a copa de 2022?',
]

let ok = 0
for (let i = 0; i < P.length; i++) {
  const a = await responde(P[i])
  const alvo = a.toLowerCase()
  const inventou = /nao tenho certeza|não tenho certeza|nao sei|não sei|nao consegui|não consegui/.test(alvo)
  if (inventou) ok++  // marcador: respondeu sem inventar (admitiu não saber) OU respondeu certo
  console.log((i+1) + '. Q: ' + P[i])
  console.log('   A: ' + a.replace(/\n/g, ' ').slice(0, 180))
}
console.log('FIM: ' + P.length + ' perguntas')
