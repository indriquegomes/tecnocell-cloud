import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarTabela, idPessoa, normalizarNome, planejarVinculos, projectRefDaUrl, sqlTransacao, validarProjetoBackup } from './vincular-tabelas-clientes.mjs'

test('mapeia apenas tabelas de venda físicas', () => {
  assert.equal(normalizarTabela('ATACADO1'), 'ATACADO1')
  assert.equal(normalizarTabela(' atacado2 '), 'ATACADO2')
  assert.equal(normalizarTabela('VAREJO'), null)
  assert.equal(normalizarTabela('ESTOQUE GERAL'), null)
})

test('normaliza nome apenas para fallback inequívoco', () => {
  assert.equal(normalizarNome(' João  da-Silva '), 'JOAO DA SILVA')
})

test('extrai ObjectId do identificador SIGE sem alterar zeros', () => {
  assert.equal(idPessoa('64cd5d1d4475ce425bcaa942idpessoa'), '64cd5d1d4475ce425bcaa942')
  assert.equal(idPessoa('---'), null)
})

test('planeja por ID base, ID original e CPF sem usar nome', () => {
  const tabelas = [
    { id: 't1', nome: 'ATACADO1' },
    { id: 't2', nome: 'ATACADO2' },
  ]
  const pessoas = [
    { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', nome: 'ID BASE', cpf_cnpj: null, tipo: 'cliente', tabela_preco_id: null },
    { id: 'bbbbbbbbbbbbbbbbbbbbbbbbidpessoa', nome: 'ID ORIGINAL', cpf_cnpj: null, tipo: 'cliente', tabela_preco_id: null },
    { id: 'cccccccccccccccccccccccc', nome: 'CPF', cpf_cnpj: '123.456.789-00', tipo: 'ambos', tabela_preco_id: null },
  ]
  const linhas = [
    { linha: 2, cliente: 'SIM', identificador: 'aaaaaaaaaaaaaaaaaaaaaaaaidpessoa', tabelaPreco: 'ATACADO1' },
    { linha: 3, cliente: 'SIM', identificador: 'bbbbbbbbbbbbbbbbbbbbbbbbidpessoa', tabelaPreco: 'ATACADO1' },
    { linha: 4, cliente: 'SIM', identificador: 'ddddddddddddddddddddddddidpessoa', cpfCnpj: '12345678900', tabelaPreco: 'ATACADO2' },
    { linha: 5, cliente: 'SIM', identificador: 'eeeeeeeeeeeeeeeeeeeeeeeeidpessoa', cpfCnpj: '12345678900', tabelaPreco: 'ATACADO2' },
    { linha: 6, cliente: 'NÃO', identificador: 'aaaaaaaaaaaaaaaaaaaaaaaaidpessoa', tabelaPreco: 'ATACADO2' },
    { linha: 7 },
    { linha: 8, cliente: 'SIM', nome: 'ID BASE', tabelaPreco: 'ATACADO1' },
  ]

  const plano = planejarVinculos({ linhas, pessoas, tabelas })

  assert.deepEqual(plano.resumo, {
    clientesFonte: 5,
    clientesUnicos: 3,
    mudancas: 3,
    iguais: 0,
    duplicatas: 1,
    conflitos: 1,
    porTabelaFinal: { ATACADO1: 2, ATACADO2: 1, 'PREÇO PADRÃO': 0 },
  })
  assert.equal(plano.conflitos[0].motivo, 'pessoa não encontrada')
})

test('bloqueia tabela desconhecida e duplicata divergente', () => {
  const pessoa = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', nome: 'CLIENTE', cpf_cnpj: '123', tipo: 'cliente', tabela_preco_id: null }
  const plano = planejarVinculos({
    pessoas: [pessoa],
    tabelas: [{ id: 't1', nome: 'ATACADO1' }, { id: 't2', nome: 'ATACADO2' }],
    linhas: [
      { linha: 2, cliente: 'SIM', identificador: `${pessoa.id}idpessoa`, tabelaPreco: 'ATACADO1' },
      { linha: 3, cliente: 'SIM', cpfCnpj: '123', tabelaPreco: 'ATACADO2' },
      { linha: 4, cliente: 'SIM', identificador: `${pessoa.id}idpessoa`, tabelaPreco: 'ESPECIAL' },
    ],
  })

  assert.deepEqual(plano.conflitos.map((c) => c.motivo), [
    'mesmo cliente com tabelas diferentes',
    'tabela ESPECIAL não reconhecida',
  ])
})

test('gera atualização atômica com trava contra banco alterado', () => {
  const sql = sqlTransacao([{
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    de: null,
    para: '74f5fea6-cbc9-4f12-8702-27c54eb9ff88',
  }])

  assert.match(sql, /^begin;/)
  assert.match(sql, /is distinct from v\.valor_anterior/)
  assert.match(sql, /update pessoas/)
  assert.match(sql, /commit;$/)
  assert.throws(() => sqlTransacao([{ id: "x'); delete from pessoas; --", de: null, para: null }]), /ID inválido/)
})

test('deriva projeto de escrita da mesma URL usada na leitura', () => {
  assert.equal(projectRefDaUrl('https://rbjwbfekkhebaschiqda.supabase.co'), 'rbjwbfekkhebaschiqda')
  assert.throws(() => projectRefDaUrl('https://outro.exemplo.com'), /URL Supabase inválida/)
})

test('rollback aceita somente projeto gravado no backup', () => {
  const url = 'https://rbjwbfekkhebaschiqda.supabase.co'
  assert.doesNotThrow(() => validarProjetoBackup({ projectRef: 'rbjwbfekkhebaschiqda' }, url))
  assert.throws(() => validarProjetoBackup({ projectRef: 'outro' }, url), /projeto diferente/)
  assert.throws(() => validarProjetoBackup({}, url), /não informa o projeto/)
})
