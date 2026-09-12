import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node executa TypeScript nativamente neste teste.
import { montarMensagemCobranca, reconciliarItensCobranca } from '../lib/cobranca-fiado.ts'

test('monta cobrança curta com período, peças e código', () => {
  const texto = montarMensagemCobranca({
    nome: 'AD CELL BINGEN',
    total: 114.60,
    notas: [
      { codigo: 935, numeroVenda: 935, descricao: 'Fiado #935', pecas: null, itens: [{ nome: 'FRONTAL XIAOMI MI 11 LITE INCELL AAA SEM ARO', quantidade: 1, valor: 78 }], valor: 78, vencimento: '2026-09-04' },
      { codigo: 906, numeroVenda: 906, descricao: 'Fiado #906', pecas: null, itens: [{ nome: 'FRONTAL MOTOROLA E32 XT2227/E32S/G22 XT2231 LCD PREMIUM SEM ARO PROMOÇÃO TOP20', quantidade: 1, valor: 36.60 }], valor: 36.60, vencimento: '2026-09-05' },
    ],
  }, '2026-09-05')

  assert.equal(texto, `Olá, AD CELL BINGEN! 😊

💰 Saldo total em aberto: R$ 114,60
Período: 04/09/2026 a 05/09/2026.

🧾 Venda #935 — falta pagar R$ 78,00
📦 FRONTAL XIAOMI MI 11 LITE INCELL AAA SEM ARO — R$ 78,00

🧾 Venda #906 — falta pagar R$ 36,60
📦 FRONTAL MOTOROLA E32 XT2227/E32S/G22 XT2231 LCD PREMIUM SEM ARO PROMOÇÃO TOP20 — R$ 36,60

Por favor, confira os valores e nos avise quando puder acertar. Obrigado! 🤝
#CBRÇ05092026`)
})

test('mostra cada peça com seu preço sem confundir com saldo aberto', () => {
  const cliente = {
    nome: 'ALEX RICARDO',
    total: 342,
    notas: [{
      codigo: 123,
      descricao: 'Fiado #123',
      pecas: 'FRONTAL SAMSUNG, FRONTAL MOTOROLA',
      itens: [
        { nome: 'FRONTAL SAMSUNG', quantidade: 1, valor: 200 },
        { nome: 'FRONTAL MOTOROLA', quantidade: 1, valor: 142 },
      ],
      valor: 342,
      vencimento: '2026-09-11',
    }],
  }

  const texto = montarMensagemCobranca(cliente, '2026-09-12')
  assert.match(texto, /Saldo total em aberto: R\$ 342,00/)
  assert.match(texto, /📦 FRONTAL SAMSUNG — R\$ 200,00/)
  assert.match(texto, /📦 FRONTAL MOTOROLA — R\$ 142,00/)
  assert.doesNotMatch(texto, /FRONTAL SAMSUNG, FRONTAL MOTOROLA — R\$ 342,00/)
})

test('retira peça devolvida e ajusta devolução parcial', () => {
  const itens = [
    { produto_id: 'A', nome: 'FRONTAL SAMSUNG', quantidade: 1, valor: 200 },
    { produto_id: 'B', nome: 'FRONTAL MOTOROLA', quantidade: 2, valor: 142 },
  ]
  assert.deepEqual(reconciliarItensCobranca(itens, [
    { produto_id: 'A', quantidade: 1, valor: 200 },
    { produto_id: 'B', quantidade: 1, valor: 71 },
  ]), [{ nome: 'FRONTAL MOTOROLA', quantidade: 1, valor: 71 }])
})

test('não inventa valor se devolução não tiver valor confiável', () => {
  assert.equal(reconciliarItensCobranca(
    [{ produto_id: 'A', nome: 'FRONTAL', quantidade: 2, valor: 200 }],
    [{ produto_id: 'A', quantidade: 1, valor: 0 }],
  ), null)
})

test('avisa quando preços das peças são maiores que saldo após pagamento parcial', () => {
  const texto = montarMensagemCobranca({
    nome: 'ALEX RICARDO',
    total: 142,
    notas: [{ codigo: 123, descricao: 'Fiado #123', pecas: null, itens: [
      { nome: 'FRONTAL SAMSUNG', quantidade: 1, valor: 200 },
      { nome: 'FRONTAL MOTOROLA', quantidade: 1, valor: 142 },
    ], valor: 142, vencimento: '2026-09-11' }],
  }, '2026-09-12')
  assert.match(texto, /Saldo total em aberto: R\$ 142,00/)
  assert.match(texto, /saldo já considera pagamentos e ajustes/)
})

test('não chama saldo de preço de peça quando faltam itens da venda', () => {
  const texto = montarMensagemCobranca({
    nome: 'CLIENTE', total: 50,
    notas: [{ codigo: 123, descricao: 'Fiado #123', pecas: null, itens: null, valor: 50, vencimento: null }],
  }, '2026-09-12')
  assert.match(texto, /Fiado #123 — falta pagar R\$ 50,00\n📦 Itens indisponíveis/)
})

test('separa várias vendas com peças e mostra pagamento parcial', () => {
  const texto = montarMensagemCobranca({
    nome: 'ALEX RICARDO', total: 242,
    notas: [
      { codigo: 999, numeroVenda: 935, descricao: 'Fiado #935', pecas: null, itens: [
        { nome: 'FRONTAL SAMSUNG', quantidade: 1, valor: 200 },
      ], valor: 100, valorPago: 100, vencimento: '2026-09-11' },
      { codigo: 998, numeroVenda: 906, descricao: 'Fiado #906', pecas: null, itens: [
        { nome: 'FRONTAL MOTOROLA', quantidade: 1, valor: 142 },
      ], valor: 142, valorPago: 0, vencimento: '2026-09-12' },
    ],
  }, '2026-09-12')
  assert.match(texto, /💰 Saldo total em aberto: R\$ 242,00/)
  assert.match(texto, /🧾 Venda #935 — falta pagar R\$ 100,00\n📦 FRONTAL SAMSUNG — R\$ 200,00\n✅ Já pago nesta venda: R\$ 100,00/)
  assert.match(texto, /🧾 Venda #906 — falta pagar R\$ 142,00\n📦 FRONTAL MOTOROLA — R\$ 142,00/)
  assert.doesNotMatch(texto, /Venda #999|Venda #998/)
})

test('preserva PIX e valor líquido de várias unidades', () => {
  const texto = montarMensagemCobranca({ nome: 'CLIENTE', total: 142, notas: [{
    codigo: 1, numeroVenda: 10, descricao: null, pecas: null,
    itens: [{ nome: 'FRONTAL', quantidade: 2, valor: 142 }], valor: 142, vencimento: null,
  }] }, '2026-09-12', '\n\n💠 PIX: chave-teste\n👤 Em nome de: LOJA')
  assert.match(texto, /📦 2x FRONTAL — R\$ 142,00/)
  assert.doesNotMatch(texto, /R\$ 284,00/)
  assert.match(texto, /💠 PIX: chave-teste\n👤 Em nome de: LOJA/)
})
