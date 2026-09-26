// bot-whatsapp/testa-ia.mjs
// Mede a acurácia da IA de atendimento contra os 50 exemplos de treinamento.
// Roda contra a API da DeepSeek de verdade. Uso: node bot-whatsapp/testa-ia.mjs
import { classificaPergunta } from './lib/ia.mjs'
import { TREINAMENTO, TOTAL } from './treinamento.mjs'

let acertos = 0
const erros = []

for (const c of TREINAMENTO) {
  const r = await classificaPergunta(c.texto)
  const buscaOk = c.eh_pergunta_produto ? r.textoBusca != null : r.textoBusca == null
  const ok = r.ehPerguntaProduto === c.eh_pergunta_produto && r.ehCompra === c.eh_compra && buscaOk
  if (ok) acertos++
  else erros.push({ esperado: c, recebido: r })
}

console.log(`
Acurácia: ${acertos}/${TOTAL} (${((acertos / TOTAL) * 100).toFixed(1)}%)
`)
for (const e of erros) {
  console.log(`✗ "${e.esperado.texto}"`)
  console.log(`    esperado produto=${e.esperado.eh_pergunta_produto} compra=${e.esperado.eh_compra} busca="${e.esperado.texto_busca}"`)
  console.log(`    recebido produto=${e.recebido.ehPerguntaProduto} compra=${e.recebido.ehCompra} busca="${e.recebido.textoBusca}"`)
}
