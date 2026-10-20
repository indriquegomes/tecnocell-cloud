import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aplicarEstornosPix, vendasIntegralmenteDevolvidas, resumirEstornosPix } from '../lib/devolucoes-caixa.ts'
import { pixSemComprovante } from '../lib/pix-pendentes.ts'

test('Pix devolvido zera líquido do turno sem alterar dinheiro e conserva histórico', () => {
  const original = { PIX: 135, Dinheiro: 70 }
  const r = aplicarEstornosPix(205, original, { pix: 135, dinheiro: 70 }, 135)
  assert.equal(r.totalVendas, 70)
  assert.equal(r.porTipo.pix, 0)
  assert.equal(r.porTipo.dinheiro, 70)
  assert.equal(r.porForma['Estorno PIX'], -135)
  assert.equal(original.PIX, 135)
})

test('estorno de venda de outro turno pode deixar Pix negativo, sem mexer na gaveta', () => {
  assert.equal(aplicarEstornosPix(0, {}, { dinheiro: 0 }, 135).porTipo.pix, -135)
})

test('alerta ignora integral/cancelada antes de casar comprovantes; parcial permanece', () => {
  const integrais = vendasIntegralmenteDevolvidas(
    [{ venda_id: 'integral', produto_id: 'a', quantidade: 2 }, { venda_id: 'parcial', produto_id: 'a', quantidade: 2 }],
    [{ venda_id: 'integral', produto_id: 'a', quantidade: 1 }, { venda_id: 'integral', produto_id: 'a', quantidade: 1 }, { venda_id: 'parcial', produto_id: 'a', quantidade: 1 }],
  )
  const pix = ['integral','parcial','cancelada'].map(id => ({id, cliente:null, valor:135, hora:'hoje', status: id === 'cancelada' ? 'cancelada' : 'concluida', devolvidaIntegral:integrais.has(id)}))
  assert.deepEqual(pixSemComprovante(pix, [], []).map(p=>p.id), ['parcial'])
  assert.deepEqual(pixSemComprovante(pix, [], [{valor:135}]), [])
})

test('resumo usa parcelas reais do reembolso; não confunde abate de fiado ou dinheiro com Pix', () => {
  assert.equal(resumirEstornosPix([
    { venda_id:'a', valor_total:135, tipo_credito:'misto', reembolsos:[{tipo:'pix',valor:35},{tipo:'dinheiro',valor:20}], abate_fiado:80 },
    { venda_id:'b', valor_total:50, tipo_credito:'pix', reembolsos:[], abate_fiado:50 },
  ]), 35)
})
