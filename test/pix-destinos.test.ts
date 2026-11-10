import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorDestino, casarFornecedor, ehContaPropria, semDocNaFrente, separarComprovantes, type FornecedorRef } from '../lib/pix-destinos.ts'

// Nomes reais que vieram nos comprovantes de outubro/2026 — o agrupamento tem que
// juntar as variações do MESMO recebedor, senão o total por fornecedor mente.
test('junta as variações do mesmo recebedor (caixa, acento, CNPJ na frente)', () => {
  const d = agruparPorDestino([
    { valor: 100, destinatario: 'STOR ONE LTDA' },
    { valor: 50, destinatario: 'Stor One Ltda' },
    { valor: 25, destinatario: '38.216.415 JOAO VITOR MAXIMIANO FRANCA' },
    { valor: 10, destinatario: 'João Vítor Maximiano França' },
  ])
  assert.equal(d.length, 2)
  const stor = d.find((x) => x.nome.includes('STOR'))!
  assert.equal(stor.total, 150)
  assert.equal(stor.comprovantes, 2)
  const proprio = d.find((x) => x.nome.includes('JOAO'))!
  assert.equal(proprio.total, 35)
})

test('une grupos que compartilham o CNPJ de 14 dígitos mesmo com nome diferente', () => {
  const d = agruparPorDestino([
    { valor: 10, destinatario: 'ARMAÇÃO LONGITUDE COMERCIO LTDA', doc: '11959507000110' },
    { valor: 20, destinatario: 'ADL DISTRIBUIDORA', doc: '11959507000110' },
  ])
  assert.equal(d.length, 1)
  assert.equal(d[0].total, 30)
  assert.equal(d[0].doc, '11959507000110')
})

test('comprovante com valor ilegível conta na lista mas não no total', () => {
  const d = agruparPorDestino([
    { valor: null, destinatario: 'H2O FORNECEDOR' },
    { valor: 40, destinatario: 'H2O FORNECEDOR' },
  ])
  assert.equal(d[0].comprovantes, 2)
  assert.equal(d[0].semValor, 1)
  assert.equal(d[0].total, 40)
})

test('sem destinatário não vira fornecedor nem soma como se fosse', () => {
  const d = agruparPorDestino([{ valor: 10, destinatario: null }, { valor: 5, destinatario: '' }])
  assert.deepEqual(d, [])
})

test('CNPJ cortado no comprovante (9 dígitos) não casa por documento', () => {
  const d = agruparPorDestino([{ valor: 65, destinatario: 'STOR *** ****', doc: '626800001' }])
  assert.equal(d[0].doc, null)
})

test('dinheiro que caiu na conta da loja é reconhecido como conta própria', () => {
  const pagbank = agruparPorDestino([{ valor: 500, destinatario: '38.216.415 JOAO VITOR MAXIMIANO FRANCA', doc: '38216415000170' }])
  assert.equal(ehContaPropria(pagbank[0], ['38216415000170'], ['38.216.415 JOAO VITOR MAXIMIANO FRANCA']), true)
  const fornecedor = agruparPorDestino([{ valor: 500, destinatario: 'STOR ONE LTDA', doc: '67262680000192' }])
  assert.equal(ehContaPropria(fornecedor[0], ['38216415000170'], ['38.216.415 JOAO VITOR MAXIMIANO FRANCA']), false)
  // comprovante que traz SÓ o nome (sem o CNPJ na frente): o titular cadastrado tem o
  // CNPJ colado, e comparar o texto cru deixava esses 12 mil caírem em "não identificado"
  const soNome = agruparPorDestino([{ valor: 500, destinatario: 'JOAO VITOR MAXIMIANO FRANCA' }])
  assert.equal(ehContaPropria(soNome[0], [], ['38.216.415 JOAO VITOR MAXIMIANO FRANCA']), true)
})

test('casa o destinatário com o fornecedor do cadastro por CNPJ, chave Pix e nome', () => {
  const forn: FornecedorRef[] = [
    { id: 'h2o', nome: 'H2O FORNECEDOR', nome_fantasia: 'STOR ONE', cpf_cnpj: '67.262.680/0001-92', chave_pix: '67262680000192' },
    { id: 'adl', nome: 'ADL', nome_fantasia: 'ARMAÇÃO LONGITUDE', cpf_cnpj: '11.959.507/0001-10', chave_pix: null },
  ]
  const porDoc = agruparPorDestino([{ valor: 10, destinatario: 'STOR ONE LTDA', doc: '67262680000192' }])
  assert.equal(casarFornecedor(porDoc[0], forn)?.id, 'h2o')

  const porNome = agruparPorDestino([{ valor: 10, destinatario: 'H2O FORNECEDOR' }])
  assert.equal(casarFornecedor(porNome[0], forn)?.id, 'h2o')

  // nome do comprovante é o começo do nome do cadastro
  const porPrefixo = agruparPorDestino([{ valor: 10, destinatario: 'ARMACAO LONGITUDE COMERCIO LTDA' }])
  assert.equal(casarFornecedor(porPrefixo[0], forn)?.id, 'adl')

  // sem par no cadastro: null (a tela mostra "não identificado")
  const semPar = agruparPorDestino([{ valor: 10, destinatario: 'FORNECEDOR NOVO SEM CADASTRO' }])
  assert.equal(casarFornecedor(semPar[0], forn), null)
})

// O mesmo fornecedor recebe por mais de uma chave, e o comprovante traz o nome do
// FAVORECIDO da chave — que quase nunca é o nome do cadastro. Sem olhar as chaves
// extras, um PIX para a ADL aparecia como "não identificado" e a dívida não baixava.
test('casa pela chave Pix extra e pelo nome do favorecido da chave', () => {
  const forn: FornecedorRef[] = [{ id: 'adl', nome: 'ADL FORNECEDOR', cpf_cnpj: null, chave_pix: '11959507410' }]
  const chaves = [
    { pessoa_id: 'adl', chave: '11959507410', favorecido: 'ARMACAO LONGITUDE COMERCIO LTDA' },
    { pessoa_id: 'adl', chave: '11985205334', favorecido: 'MAIS BARATO IMPORTAÇÃO E EXPORTAÇÃO LTDA' },
  ]
  // nome do favorecido da SEGUNDA chave
  const porFavorecido = agruparPorDestino([{ valor: 500, destinatario: 'MAIS BARATO IMPORTAÇÃO E EXPORTAÇÃO LTDA' }])
  assert.equal(casarFornecedor(porFavorecido[0], forn, chaves)?.id, 'adl')
  // chave de celular tem 11 dígitos e o agrupamento só carrega documento de 14 —
  // por isso o casamento por telefone é pelo NOME do favorecido, não pelo número.
  const porChaveCnpj = agruparPorDestino([{ valor: 500, destinatario: 'OUTRO NOME', doc: '11959507000110' }])
  const chavesCnpj = [{ pessoa_id: 'adl', chave: '11959507000110', favorecido: 'ARMACAO LONGITUDE' }]
  assert.equal(casarFornecedor(porChaveCnpj[0], forn, chavesCnpj)?.id, 'adl')
  // sem as chaves extras o mesmo comprovante fica sem par: é o bug que isso corrige
  assert.equal(casarFornecedor(porFavorecido[0], forn), null)
})

test('nome curto não casa por prefixo (evita juntar fornecedor errado)', () => {
  const forn: FornecedorRef[] = [{ id: 'zl', nome: 'ZL' }, { id: 'outro', nome: 'ZL CELL FORNECEDOR' }]
  assert.equal(casarFornecedor({ nome: 'ZL', doc: null, comprovantes: 1, total: 0, semValor: 0 }, forn)?.id, 'zl')
  assert.equal(casarFornecedor({ nome: 'Z', doc: null, comprovantes: 1, total: 0, semValor: 0 }, forn), null)
})

test('semDocNaFrente tira o CNPJ que vem colado no nome', () => {
  assert.equal(semDocNaFrente('38.216.415 JOAO VITOR MAXIMIANO FRANCA'), 'JOAO VITOR MAXIMIANO FRANCA')
  assert.equal(semDocNaFrente('38.216.415JOAO VITOR MAXIMIANO FRANCA'), 'JOAO VITOR MAXIMIANO FRANCA')
  assert.equal(semDocNaFrente('DS STORE'), 'DS STORE')
})

// ─── ERRO HUMANO NO BALCÃO ───────────────────────────────────────────────────
// Cada um destes casos acontece de verdade na loja. O que não pode acontecer é
// o valor entrar duas vezes ou o comprovante errado virar dívida baixada.

test('comprovante repetido (mesmo ID de transação) conta uma vez só', () => {
  const s = separarComprovantes([
    { valor: 200, destinatario: 'STOR ONE LTDA', transacaoId: 'E123', status: 'extraido' },
    { valor: 200, destinatario: 'STOR ONE LTDA', transacaoId: 'E123', status: 'extraido' },
    { valor: 200, destinatario: 'STOR ONE LTDA', transacaoId: 'E123', status: 'duplicado' },
    { valor: 50, destinatario: 'STOR ONE LTDA', transacaoId: 'E999', status: 'extraido' },
  ])
  assert.equal(s.validos.length, 2)
  assert.equal(s.repetidos, 2)
  assert.equal(s.valorRepetido, 400)
  const d = agruparPorDestino(s.validos)
  assert.equal(d[0].total, 250)
})

test('comprovante repetido sem o bot ter marcado (dado do bot antigo) também não dobra', () => {
  // outubro/2026 tinha 48 linhas assim: mesmo E2E, status extraido nas duas.
  const s = separarComprovantes([
    { valor: 300, destinatario: 'ARMAÇÃO LONGITUDE', transacaoId: 'E777', status: 'extraido' },
    { valor: 300, destinatario: 'ARMAÇÃO LONGITUDE', transacaoId: 'E777', status: 'extraido' },
  ])
  assert.equal(s.validos.length, 1)
  assert.equal(s.valorRepetido, 300)
  assert.equal(agruparPorDestino(s.validos)[0].total, 300)
})

test('dois pagamentos diferentes de mesmo valor e mesmo recebedor continuam valendo', () => {
  const s = separarComprovantes([
    { valor: 100, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'extraido' },
    { valor: 100, destinatario: 'STOR ONE LTDA', transacaoId: 'E2', status: 'extraido' },
  ])
  assert.equal(s.validos.length, 2)
  assert.equal(agruparPorDestino(s.validos)[0].total, 200)
})

test('sem o ID da transação, reenvio do mesmo comprovante é pego por pagador+valor+dia', () => {
  const base = { valor: 72, destinatario: '38.216.415 JOAO VITOR MAXIMIANO FRANCA', pagador: '64.145.182 PEDRO FELIPE', dia: '2026-10-14', status: 'extraido' }
  const s = separarComprovantes([base, { ...base }])
  assert.equal(s.validos.length, 1)
  assert.equal(s.valorRepetido, 72)
})

test('sem o ID, mesmo valor de pagadores diferentes conta normal', () => {
  const base = { valor: 72, destinatario: 'STOR ONE LTDA', dia: '2026-10-14', status: 'extraido' }
  const s = separarComprovantes([{ ...base, pagador: 'MARIA' }, { ...base, pagador: 'JOAO' }])
  assert.equal(s.validos.length, 2)
  assert.equal(s.repetidos, 0)
})

test('status furo (Pix sem comprovante válido) não entra na conta', () => {
  const s = separarComprovantes([{ valor: 40, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'furo' }])
  assert.equal(s.validos.length, 0)
  assert.equal(s.naoComprovante, 1)
})

test('comprovante postado no grupo da OUTRA loja não soma em nenhuma das duas', () => {
  const s = separarComprovantes(
    [
      { valor: 500, destinatario: 'STOR ONE LTDA', transacaoId: 'E55', status: 'extraido' },
      { valor: 80, destinatario: 'STOR ONE LTDA', transacaoId: 'E56', status: 'extraido' },
    ],
    { transacoesDoOutroGrupo: ['E55'] },
  )
  assert.equal(s.cruzados.length, 1)
  assert.equal(s.valorCruzado, 500)
  assert.equal(agruparPorDestino(s.validos)[0].total, 80)
})

test('foto que não era comprovante é ignorada', () => {
  const s = separarComprovantes([
    { valor: null, destinatario: null, transacaoId: null, status: 'nao_comprovante' },
    { valor: 90, destinatario: 'PLAY CELL', transacaoId: 'E9', status: 'extraido' },
  ])
  assert.equal(s.naoComprovante, 1)
  assert.equal(s.validos.length, 1)
})

test('comprovante ilegível ou ainda não lido não vira valor, mas é avisado', () => {
  const s = separarComprovantes([
    { valor: null, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'ilegivel' },
    { valor: null, destinatario: 'STOR ONE LTDA', transacaoId: 'E2', status: 'recebido' },
    { valor: 70, destinatario: 'STOR ONE LTDA', transacaoId: 'E3', status: 'extraido' },
  ])
  assert.equal(s.naoLidos, 2)
  assert.equal(s.validos.length, 1)
  assert.equal(agruparPorDestino(s.validos)[0].total, 70)
})

test('comprovante sem o nome de quem recebeu fica fora do total e avisado', () => {
  const s = separarComprovantes([
    { valor: 45, destinatario: null, transacaoId: 'E1', status: 'incompleto' },
    { valor: 15, destinatario: '   ', transacaoId: 'E2', status: 'extraido' },
  ])
  assert.equal(s.semDestino, 2)
  assert.equal(s.valorSemDestino, 60)
  assert.deepEqual(s.validos, [])
})

test('comprovante apagado do grupo continua valendo (o grupo apaga sozinho)', () => {
  const s = separarComprovantes([
    { valor: 120, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'apagado' },
  ])
  assert.equal(s.apagados, 1)
  assert.equal(s.validos.length, 1)
  assert.equal(agruparPorDestino(s.validos)[0].total, 120)
})

test('Pix de outro dia (data divergente) entra na conta e o valor é preservado', () => {
  const s = separarComprovantes([
    { valor: 88, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'data_divergente' },
  ])
  assert.equal(s.validos.length, 1)
  assert.equal(agruparPorDestino(s.validos)[0].total, 88)
})

test('a soma dos validos com os avisos explica todos os comprovantes recebidos', () => {
  // Nenhum comprovante pode desaparecer sem aparecer em algum aviso.
  const itens = [
    { valor: 100, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'extraido' },
    { valor: 100, destinatario: 'STOR ONE LTDA', transacaoId: 'E1', status: 'extraido' },
    { valor: 50, destinatario: 'STOR ONE LTDA', transacaoId: 'E2', status: 'duplicado' },
    { valor: null, destinatario: 'STOR ONE LTDA', transacaoId: 'E3', status: 'ilegivel' },
    { valor: null, destinatario: null, transacaoId: null, status: 'nao_comprovante' },
    { valor: 30, destinatario: null, transacaoId: 'E4', status: 'incompleto' },
    { valor: 70, destinatario: 'PLAY CELL', transacaoId: 'E5', status: 'extraido' },
  ]
  const s = separarComprovantes(itens, { transacoesDoOutroGrupo: ['E5'] })
  const contados = s.validos.length + s.repetidos + s.naoLidos + s.semDestino + s.naoComprovante + s.cruzados.length
  assert.equal(contados, itens.length)
})

