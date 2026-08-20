// bot-whatsapp/testa-ia.mjs
// Roda contra a API da DeepSeek de verdade. Uso: node bot-whatsapp/testa-ia.mjs
import { classificaPergunta } from './lib/ia.mjs'

const casos = [
  'quanto custa a tela do iphone 12?',
  'vcs tem bateria pra moto g54',
  'vcs abrem que horas amanha?',
  'meu celular caiu na agua, conserta?',
  'oi',
  'e a tela daquele que eu perguntei ontem, chegou?',
]

for (const texto of casos) {
  const r = await classificaPergunta(texto)
  console.log(`"${texto}" ->`, r)
}
