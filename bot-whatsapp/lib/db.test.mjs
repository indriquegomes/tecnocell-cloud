import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DB_TESTE = path.join(process.cwd(), 'bot-whatsapp', 'data', 'teste.db')
fs.rmSync(DB_TESTE, { force: true })
process.env.BOT_WHATSAPP_DB = DB_TESTE

const { registraTroca, jaAvisouHoje, marcaAvisoHoje, fechaBanco } = await import('./db.mjs')

test('registraTroca grava e nao derruba com campos ausentes', () => {
  registraTroca({ loja: 'petropolis', telefoneTruncado: '1234', pergunta: 'tem tela do note 12?', produtoBuscado: 'tela note 12', resultado: 'respondido', resposta: 'Sim, temos! R$ 120,00' })
  registraTroca({ loja: 'petropolis', telefoneTruncado: '5678', pergunta: 'oi', produtoBuscado: null, resultado: 'ignorado', resposta: null })
})

test('aviso do dia: comeca falso, marca, vira verdadeiro, nao mistura loja/telefone', () => {
  assert.equal(jaAvisouHoje('petropolis', '1234'), false)
  marcaAvisoHoje('petropolis', '1234')
  assert.equal(jaAvisouHoje('petropolis', '1234'), true)
  assert.equal(jaAvisouHoje('petropolis', '9999'), false)
  assert.equal(jaAvisouHoje('teresopolis', '1234'), false)
})

test.after(() => {
  fechaBanco()
  fs.rmSync(DB_TESTE, { force: true })
})
