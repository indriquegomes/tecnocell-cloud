import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/painel/fiados/page.tsx', import.meta.url), 'utf8')

test('usa loja_id do lançamento antes da loja da venda e falha fechado', () => {
  assert.match(source, /\.from\('lancamentos'\)[\s\S]{0,200}\.select\('[^']*\bloja_id\b[^']*'\)/)
  assert.match(source, /l\.loja_id[^\n]*\?\? lojaIdPorVenda\(l\.venda_id\)/)
  assert.match(source, /!lojaId \|\| !idsPermitidos\.has\(lojaId\)/)
})
