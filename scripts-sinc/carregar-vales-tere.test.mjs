import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { dig, uuidValeTere, resolvePessoa } from './carregar-vales-tere.mjs'

test('dig normaliza CPF/CNPJ pra só dígitos', () => {
  assert.equal(dig('12.345.678/0001-90'), '12345678000190')
  assert.equal(dig(' 148.343.127-47 '), '14834312747')
  assert.equal(dig(''), '')
  assert.equal(dig(null), '')
})

test('uuidValeTere é determinístico e usa namespace próprio (não colide com Petrópolis)', () => {
  const a = uuidValeTere('pessoa-1')
  const b = uuidValeTere('pessoa-1')
  assert.equal(a, b)
  assert.notEqual(uuidValeTere('pessoa-1'), uuidValeTere('pessoa-2'))
  // não pode ser o mesmo id da baseline de Petrópolis (namespace 'tecnocell:vale:')
  const sha1 = (s) => { const h = createHash('sha1').update(s).digest(); h[6]=(h[6]&0x0f)|0x50; h[8]=(h[8]&0x3f)|0x80; const x=h.toString('hex'); return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20,32) }
  assert.notEqual(a, sha1('tecnocell:vale:pessoa-1'))
})

test('resolvePessoa: id SIGE tem prioridade', () => {
  const porId = new Set(['id-a'])
  const porCpf = new Map([['123', [{ id: 'outra' }]]])
  assert.deepEqual(resolvePessoa({ id: 'id-a', cpfCnpj: '123' }, porId, porCpf), { status: 'ok', pessoaId: 'id-a' })
})

test('resolvePessoa: fallback CPF/CNPJ único', () => {
  const porId = new Set(['id-a'])
  const porCpf = new Map([['12345678901', [{ id: 'pessoa-x' }]]])
  assert.deepEqual(resolvePessoa({ id: 'id-inexistente', cpfCnpj: '123.456.789-01' }, porId, porCpf), { status: 'ok', pessoaId: 'pessoa-x' })
})

test('resolvePessoa: CPF/CNPJ duplicado → dup', () => {
  const porCpf = new Map([['123', [{ id: 'a' }, { id: 'b' }]]])
  assert.deepEqual(resolvePessoa({ id: null, cpfCnpj: '123' }, new Set(), porCpf), { status: 'dup', pessoaId: null })
})

test('resolvePessoa: sem id e sem cpf único → sem (nunca por nome)', () => {
  const porCpf = new Map([['111', [{ id: 'a' }]]])
  // nome existe mas não é usado; cpf não bate → sem
  assert.deepEqual(resolvePessoa({ id: null, cpfCnpj: '999', nome: 'FULANO' }, new Set(), porCpf), { status: 'sem', pessoaId: null })
  assert.deepEqual(resolvePessoa({ id: null, cpfCnpj: '' }, new Set(), new Map()), { status: 'sem', pessoaId: null })
})
