import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agrupar, limparTexto } from '../lib/erros-texto.ts'
import { tituloDeErro } from '../lib/erros-cliente.ts'

// O monitoramento não pode virar vazamento nem ruído: o texto que chega na tela
// Saúde e no Telegram passa por aqui antes. Se estes dois quebrarem, ou dado de
// cliente vaza para o aviso, ou o dono recebe 50 avisos do mesmo problema.

test('sequência longa de dígito (CPF, telefone, IMEI, cartão) não sai daqui', () => {
  assert.equal(limparTexto('erro no IMEI 356938035643809'), 'erro no IMEI ···')
  assert.equal(limparTexto('cliente 21999998888 não encontrado'), 'cliente ··· não encontrado')
  // valor de dinheiro e id curto continuam legíveis: é o que identifica o caso
  assert.equal(limparTexto('venda 1234 deu R$ 1.299,00'), 'venda 1234 deu R$ 1.299,00')
})

test('documento e telefone FORMATADOS também são mascarados', () => {
  // O erro de banco repete o valor literal: "duplicate key (cpf_cnpj)=(123.456.789-00)"
  assert.equal(limparTexto('duplicate key (cpf_cnpj)=(123.456.789-00)'), 'duplicate key (cpf_cnpj)=(···)')
  assert.equal(limparTexto('CNPJ 12.345.678/0001-90 já existe'), 'CNPJ ··· já existe')
  assert.equal(limparTexto('telefone (24) 99999-8888 inválido'), 'telefone ··· inválido')
})

test('mensagem de banco em 3 linhas vira uma linha só', () => {
  assert.equal(limparTexto('duplicate key value\nviolates unique\nconstraint'), 'duplicate key value violates unique constraint')
})

test('texto gigante é cortado em 400 e texto vazio vira null', () => {
  assert.equal(limparTexto('x'.repeat(900))?.length, 400)
  assert.equal(limparTexto(''), null)
  assert.equal(limparTexto(null), null)
  assert.equal(limparTexto('   '), null)
})

test('o mesmo problema sempre cai no mesmo grupo; título e tela diferentes não', () => {
  const a = agrupar('/painel/pdv', 'Erro na tela (TypeError)')
  const b = agrupar('/painel/pdv', 'Erro na tela (TypeError)')
  assert.equal(a, b)
  // caixa do título não muda o grupo — a mensagem do navegador varia em caixa
  assert.equal(agrupar('/painel/pdv', 'ERRO NA TELA (TypeError)'), a)
  assert.notEqual(agrupar('/painel/caixa', 'Erro na tela (TypeError)'), a)
  assert.notEqual(agrupar('/painel/pdv', 'Ação travou (promessa sem tratamento)'), a)
})

test('título do aviso é estável: mensagem diferente não vira aviso novo', () => {
  // Sem isso, cada variação da mensagem ("reading 'id'", "reading 'valor'") seria
  // um grupo diferente e o dono receberia vários avisos do MESMO defeito.
  assert.equal(
    tituloDeErro(new TypeError("Cannot read properties of undefined (reading 'id')")),
    tituloDeErro(new TypeError("Cannot read properties of undefined (reading 'valor')")),
  )
  assert.equal(tituloDeErro(new TypeError('x')), 'Tela não carregou (TypeError)')
  assert.equal(tituloDeErro(new Error('x'), 'Ação travou'), 'Ação travou (erro)')
  assert.equal(tituloDeErro('mensagem solta'), 'Tela não carregou (sem detalhe)')
})
