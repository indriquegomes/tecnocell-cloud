import test from 'node:test'
import assert from 'node:assert/strict'
import { parseMovimentacaoEstoque } from './sinc.ts'

test('normaliza movimentação de estoque capturada do SIGE', () => {
  const corpo = {
    data: JSON.stringify({
      movements: [{
        produtoID: '693176411d3aeafa069efdc2',
        produtoCodigoNFE: '11507',
        depositoID: '63d9054d59a9c829747233d4',
        tipo: 'Saida',
        quantidade: 1,
        data: '02/09/2026 - 18:36',
        produto: 'FRONTAL XIAOMI',
      }],
      obs: 'troca reginaldo',
    }),
  }

  assert.deepEqual(parseMovimentacaoEstoque(corpo), [{
    produtoIdSige: '693176411d3aeafa069efdc2',
    codigo: '11507',
    depositoId: '63d9054d59a9c829747233d4',
    operacao: 'saida',
    quantidade: 1,
    data: '2026-09-02T21:36:00.000Z',
    produto: 'FRONTAL XIAOMI',
    observacao: 'troca reginaldo',
  }])
})

test('rejeita tipo desconhecido e quantidade inválida', () => {
  assert.equal(parseMovimentacaoEstoque({ data: '{"movements":[{"tipo":"Ajuste","quantidade":1}]}' }), null)
  assert.equal(parseMovimentacaoEstoque({ data: '{"movements":[{"tipo":"Entrada","quantidade":0}]}' }), null)
})

// ── Devolução (payload real capturado do SIGE) ─────────────────────────────
import { parseDevolucao } from './sinc.ts'

test('devolução em Vale Crédito vira credito_conta', () => {
  const corpo = {
    arg: JSON.stringify([{
      VendaID: '69ed1fb0af0ef583cfb1e6f0', VendaProdutoID: '69ed1fb0af0ef583cfb1e6f1',
      ProdutoID: '683600ec2e21118aef11cca3', ProdutoCodigo: '10620',
      QuantidadeVendida: 8, QuantidadeJaDevolvida: 0, QuantidadeDevolvida: 1,
      ValorUnitario: 19.75, ValorTotal: 158, ValorDevolucao: 19.75,
      Deposito: 'PETRÓPOLIS LOJA', DepositoID: '63d9054d59a9c829747233d4',
    }]),
    arg3: '"BRUNA ALVES"',
    data: JSON.stringify({ TipoOperacao: 4, Valores: [{ Descricao: 'Vale Crédito', Valor: '19,75' }] }),
  }
  const resposta = { ValeId: '6a99aa17fa3edf46884c2f3c', Success: true, OperacaoId: '6a99aa18fa3edf46884c2f58' }

  const dev = parseDevolucao(corpo, resposta)
  assert.equal(dev?.tipoCredito, 'credito_conta')
  assert.equal(dev?.clienteNome, 'BRUNA ALVES')
  assert.equal(dev?.vendaIdSige, '69ed1fb0af0ef583cfb1e6f0')
  assert.equal(dev?.operacaoId, '6a99aa18fa3edf46884c2f58')
  assert.deepEqual(dev?.itens, [{ codigo: '10620', quantidade: 1, valorUnitario: 19.75, totalItem: 19.75, depositoId: '63d9054d59a9c829747233d4' }])
})

test('devolução em Crédito Loja vira cancelamento_fiado', () => {
  const corpo = {
    arg: JSON.stringify([{
      VendaID: '6a973879d7275d6597d7871b', ProdutoCodigo: '04221',
      QuantidadeDevolvida: 1, ValorUnitario: 55, ValorDevolucao: 55,
      DepositoID: '63d9054d59a9c829747233d4',
    }]),
    arg3: '"AMAURY ANDRE DELAVALI  SILVA"',
    data: JSON.stringify({ TipoOperacao: 4, Valores: [{ Descricao: 'Crédito Loja', Valor: '55,00' }] }),
  }
  const dev = parseDevolucao(corpo, { ValeId: '', Success: true, OperacaoId: '6a99a2a1c61416695de610cc' })
  assert.equal(dev?.tipoCredito, 'cancelamento_fiado')
})

test('devolução em Dinheiro fica sem mapeamento (aguarda caixa)', () => {
  const corpo = {
    arg: JSON.stringify([{ VendaID: 'x', ProdutoCodigo: '1', QuantidadeDevolvida: 1, ValorUnitario: 10, ValorDevolucao: 10, DepositoID: 'd' }]),
    data: JSON.stringify({ TipoOperacao: 4, Valores: [{ Descricao: 'Dinheiro', Valor: '10,00' }] }),
  }
  const dev = parseDevolucao(corpo, { Success: true, OperacaoId: 'op1' })
  assert.equal(dev?.tipoCredito, null) // forma não mapeada → quarentena
  assert.equal(dev?.forma, 'Dinheiro')
})

test('rejeita devolução sem OperacaoId (falhou no SIGE) e TipoOperacao não-devolução', () => {
  const corpo = {
    arg: JSON.stringify([{ VendaID: 'x', ProdutoCodigo: '1', QuantidadeDevolvida: 1, ValorUnitario: 10, ValorDevolucao: 10 }]),
    data: JSON.stringify({ TipoOperacao: 4, Valores: [{ Descricao: 'Dinheiro' }] }),
  }
  assert.equal(parseDevolucao(corpo, { Success: false }), null) // sem OperacaoId
  assert.equal(parseDevolucao({ ...corpo, data: JSON.stringify({ TipoOperacao: 3, Valores: [] }) }, { OperacaoId: 'op' }), null) // caixa, não devolução
  assert.equal(parseDevolucao({ ...corpo, arg: '[]' }, { OperacaoId: 'op' }), null) // sem itens
})
