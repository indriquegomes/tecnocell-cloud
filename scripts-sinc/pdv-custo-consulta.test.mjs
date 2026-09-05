import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const client = fs.readFileSync('app/painel/pdv/PDVClient.tsx', 'utf8')
const actions = fs.readFileSync('app/painel/pdv/actions.ts', 'utf8')
const page = fs.readFileSync('app/painel/pdv/page.tsx', 'utf8')

test('PDV usa tabela CUSTO física marcada no banco', () => {
  assert.doesNotMatch(client, /__custo__/)
  assert.match(page, /select\('id, nome, usa_preco_custo'\)/)
  assert.match(client, /usa_preco_custo: boolean/)
  assert.match(client, /tabelaSelecionada\?\.usa_preco_custo/)
})

test('CUSTO bloqueia orçamento e venda no cliente e servidor', () => {
  assert.match(client, /const AVISO_CUSTO = 'Tabela CUSTO é somente consulta/)
  assert.ok((client.match(/setErro\(AVISO_CUSTO\)/g) ?? []).length >= 3)
  assert.match(actions, /tabelaSomenteConsulta\(/)
  assert.match(actions, /Tabela CUSTO é somente consulta/)
  assert.match(actions, /itens\.find\(\(i\)[\s\S]{0,180}i\.preco_unitario <= Number\(produto\.preco_custo\)/)
  assert.ok((actions.match(/produtoNoCusto\(/g) ?? []).length >= 3)
})
