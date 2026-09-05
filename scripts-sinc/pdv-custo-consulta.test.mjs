import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const client = fs.readFileSync('app/painel/pdv/PDVClient.tsx', 'utf8')
const actions = fs.readFileSync('app/painel/pdv/actions.ts', 'utf8')

test('PDV oferece CUSTO virtual usando preco_custo', () => {
  assert.match(client, /const TABELA_CUSTO = '__custo__'/)
  assert.match(client, /<option value=\{TABELA_CUSTO\}>CUSTO<\/option>/)
  assert.match(client, /tabelaId === TABELA_CUSTO[^\n]+preco_custo/)
})

test('CUSTO bloqueia orçamento e venda no cliente e servidor', () => {
  assert.match(client, /const AVISO_CUSTO = 'Tabela CUSTO é somente consulta/)
  assert.ok((client.match(/setErro\(AVISO_CUSTO\)/g) ?? []).length >= 3)
  assert.match(actions, /modoConsultaCusto[^\n]*boolean/)
  assert.match(actions, /if \(.*modoConsultaCusto.*\).*Tabela CUSTO é somente consulta/)
  assert.match(actions, /itens\.find\(\(i\)[\s\S]{0,180}i\.preco_unitario <= Number\(produto\.preco_custo\)/)
  assert.ok((actions.match(/produtoNoCusto\(/g) ?? []).length >= 3)
})
