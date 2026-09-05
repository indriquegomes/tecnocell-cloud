import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/painel/pdv/operacao/page.tsx', import.meta.url), 'utf8')

test('reforço soma e sangria subtrai do PIX no caixa aberto e Z', () => {
  assert.match(source, /\['reforco', 'retirada'\]\.includes\(m\.tipo\) && !ehDin\(m\)/)
  assert.match(source, /const sinal = m\.tipo === 'reforco' \? 1 : -1/)
  assert.match(source, /porTipo\[t\] = \(porTipo\[t\] \?\? 0\) \+ sinal \* v/)
  assert.match(source, /zPorTipo\[t\] = \(zPorTipo\[t\] \?\? 0\) \+ sinal \* v/)
})
