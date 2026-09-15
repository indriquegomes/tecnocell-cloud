import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { norm, uuidValeLinha, resolveCliente } from './carregar-vales-tere-per-vale.mjs'

test('norm remove acento e case, colapsa espaços', () => {
  assert.equal(norm('  VÁRZEA  '), 'varzea')
  assert.equal(norm('Denilson Peças'), 'denilson pecas')
  assert.equal(norm('Arthur Dias Moura'), norm('ARTHUR DIAS MOURA'))
})

test('uuidValeLinha é determinístico e usa namespace próprio (não colide com Petrópolis)', () => {
  assert.equal(uuidValeLinha('30045'), uuidValeLinha('30045'))
  assert.notEqual(uuidValeLinha('30045'), uuidValeLinha('30046'))
  const sha1 = (s) => { const h = createHash('sha1').update(s).digest(); h[6]=(h[6]&0x0f)|0x50; h[8]=(h[8]&0x3f)|0x80; const x=h.toString('hex'); return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20,32) }
  assert.notEqual(uuidValeLinha('30045'), sha1('tecnocell:valexlsx:30045')) // namespace Petrópolis
})

test('resolveCliente: nome único → ok; homônimo → dup; ausente → sem', () => {
  const mapa = new Map([
    [norm('VOLTZ'), [{ id: 'p1' }]],
    [norm('NERD CLUB'), [{ id: 'p2' }, { id: 'p3' }]],
  ])
  assert.deepEqual(resolveCliente('VOLTZ', mapa), { status: 'ok', pessoaId: 'p1' })
  assert.deepEqual(resolveCliente('nerd club', mapa), { status: 'dup', pessoaId: null })
  assert.deepEqual(resolveCliente('INEXISTENTE', mapa), { status: 'sem', pessoaId: null })
})
