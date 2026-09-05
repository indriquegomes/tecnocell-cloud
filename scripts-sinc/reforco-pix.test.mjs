import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/painel/pdv/operacao/page.tsx', import.meta.url), 'utf8')

test('reforço PIX entra no total PIX do caixa aberto e Z', () => {
  assert.match(source, /m\.tipo === 'reforco' && !ehDin\(m\)/)
  assert.match(source, /zMov\.filter\(\(m\) => m\.tipo === 'reforco' && tipoDoTexto\(m\.forma_pagamento\) !== 'dinheiro'\)/)
  assert.match(source, /porTipo\[t\] = \(porTipo\[t\] \?\? 0\) \+ v/)
  assert.match(source, /zPorTipo\[t\] = \(zPorTipo\[t\] \?\? 0\) \+ v/)
})
