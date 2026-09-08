import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node executa TypeScript nativamente neste teste.
import { montarMensagemCobranca, pecasRestantesPorVenda } from '../lib/cobranca-fiado.ts'

test('omite item totalmente devolvido e reduz devolução parcial', () => {
  const resultado = pecasRestantesPorVenda([
    { venda_id: 'v1', produto_id: 'p1', nome: 'Tela A', quantidade: 1 },
    { venda_id: 'v1', produto_id: 'p2', nome: 'Tela B', quantidade: 3 },
    { venda_id: 'v1', produto_id: 'p3', nome: 'Tela C', quantidade: 1 },
  ], [
    { venda_id: 'v1', produto_id: 'p1', quantidade: 1 },
    { venda_id: 'v1', produto_id: 'p2', quantidade: 1 },
  ])

  assert.deepEqual(resultado.get('v1'), ['2x Tela B', 'Tela C'])
})

test('monta cobrança curta com período, peças e código', () => {
  const texto = montarMensagemCobranca({
    nome: 'AD CELL BINGEN',
    total: 114.60,
    notas: [
      { codigo: 935, descricao: 'Fiado #935', pecas: 'FRONTAL XIAOMI MI 11 LITE INCELL AAA SEM ARO', valor: 78, vencimento: '2026-09-04' },
      { codigo: 906, descricao: 'Fiado #906', pecas: 'FRONTAL MOTOROLA E32 XT2227/E32S/G22 XT2231 LCD PREMIUM SEM ARO PROMOÇÃO TOP20', valor: 36.60, vencimento: '2026-09-05' },
    ],
  }, '2026-09-05')

  assert.equal(texto, `Olá, AD CELL BINGEN! 😊

Saldo em aberto: R$ 114,60
Período: 04/09/2026 a 05/09/2026.

Peças:

- FRONTAL XIAOMI MI 11 LITE INCELL AAA SEM ARO — R$ 78,00
- FRONTAL MOTOROLA E32 XT2227/E32S/G22 XT2231 LCD PREMIUM SEM ARO PROMOÇÃO TOP20 — R$ 36,60

Por favor, verificar acerto. Obrigado!
#CBRÇ05092026`)
})
