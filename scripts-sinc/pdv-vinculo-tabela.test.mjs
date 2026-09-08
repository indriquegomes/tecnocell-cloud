import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fonte = readFileSync(new URL('../app/painel/pdv/PDVClient.tsx', import.meta.url), 'utf8')

test('tabela nova só aparece depois da carga terminar', () => {
  const trecho = fonte.slice(fonte.indexOf('const trocarTabela'), fonte.indexOf('// Se a loja abre'))
  assert.ok(trecho.indexOf('setTabelaId(novaTabela)') > trecho.indexOf('await buscarItensTabela'))
  assert.doesNotMatch(trecho, /setTabelaId\(tabelaAnterior\)/)
})

test('cliente só é selecionado depois que sua tabela carregar', () => {
  assert.match(fonte, /onClick=\{async \(\) => \{[\s\S]{0,180}if \(!\(await trocarTabela\(tabelaDoCliente\(p\.tabela_preco_id, tabelas\)\)\)\) return[\s\S]{0,100}setPessoaId\(p\.id\)/)
})
