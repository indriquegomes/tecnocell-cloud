// Teste da única lógica do bot de PIX: quando ele fala e o que ele manda.
// Roda: node --test bot-whatsapp/pix.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehPerguntaPix, resposta } from './pix.mjs'

test('reconhece pergunta de PIX', () => {
  for (const t of [
    'qual o pix?',
    'manda o pix',
    'Qual é o PIX do dia',
    'qual a chave pix?',
    'chave pix pra pagar',
    'me passa o qr code do pix',
    'qrcode',
  ]) assert.equal(ehPerguntaPix(t), true, t)
})

test('não confunde outro assunto com PIX', () => {
  for (const t of [
    'oi',
    'quanto custa a tela do g20?',
    'tem bateria do moto g54?',
    'chave do cofre',
    'pixote', // palavra que só contém "pix" não conta
    '',
  ]) assert.equal(ehPerguntaPix(t), false, t)
})

test('resposta com chave e titular', () => {
  const r = resposta({ chave: '67.262.680/0001-92', titular: 'STOR ONE LTDA' })
  assert.match(r, /67\.262\.680\/0001-92/)
  assert.match(r, /Titular: STOR ONE LTDA/)
  assert.match(r, /comprovante/)
})

test('resposta sem titular não inventa linha', () => {
  const r = resposta({ chave: 'pix@loja.com', titular: null })
  assert.match(r, /pix@loja\.com/)
  assert.doesNotMatch(r, /Titular/)
})
