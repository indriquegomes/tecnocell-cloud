import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conciliarPixSaida,
  diaDoCampo,
  mesmoCliente,
  type LancamentoPagar,
} from '../lib/pix-saida.ts'
import { lerCartaoDevolucao, mensagemDoPix, normalizarLeitura, normalizarLeituras, parseValor } from '../lib/pix-saida-bot.ts'

// O PIX de saída é dinheiro REAL saindo da conta: baixa errada aqui apaga dívida
// de cliente errado. Por isso quase todo caso abaixo espera "escolher" — quem
// baixa sozinho é só o caso inequívoco.

const dev = (extra: Partial<LancamentoPagar> = {}): LancamentoPagar => ({
  id: 'l1',
  valor: 100,
  tipo: 'pagar',
  status: 'pago',
  descricao: 'Devolução — MARLENE DA SILVA',
  pessoaNome: 'MARLENE DA SILVA',
  diaPagamento: '2026-12-01T14:20:00+00:00',
  diaVencimento: '2026-12-01T00:00:00+00:00',
  devolucaoId: 'd1',
  ...extra,
})

const pix = (extra: Partial<{ valor: number | null; dia: string | null; destinatario: string | null; clienteSistema: string | null }> = {}) => ({
  valor: 100,
  dia: '2026-12-01',
  destinatario: 'MARLENE DA SILVA',
  ...extra,
})

test('valor e nome casando com UM candidato só → baixa sozinho', () => {
  const r = conciliarPixSaida(pix(), [dev()])
  assert.equal(r.tipo, 'baixar')
  if (r.tipo === 'baixar') assert.equal(r.candidato.id, 'l1')
})

test('dois clientes com o MESMO valor: baixa o que o comprovante nomeia', () => {
  const r = conciliarPixSaida(pix(), [
    dev({ id: 'outro', pessoaNome: 'ADRIANO PEREIRA', descricao: 'Devolução — ADRIANO PEREIRA' }),
    dev(),
  ])
  assert.equal(r.tipo, 'baixar')
  if (r.tipo === 'baixar') assert.equal(r.candidato.id, 'l1')
})

test('comprovante SEM nome não baixa sozinho — mesmo com um candidato só', () => {
  const r = conciliarPixSaida(pix({ destinatario: null }), [dev()])
  assert.equal(r.tipo, 'escolher')
  if (r.tipo === 'escolher') assert.equal(r.candidatos.length, 1)
})

test('nome parecido mas de outra pessoa não baixa e não oferece a linha errada', () => {
  const r = conciliarPixSaida(pix({ destinatario: 'ADRIANA SOUZA' }), [
    dev({ pessoaNome: 'ADRIANO SOUZA', descricao: 'Devolução — ADRIANO SOUZA' }),
  ])
  assert.equal(r.tipo, 'sem_par')
})

test('comprovante com nome sem par: diz quantas linhas do mesmo valor existem de outros nomes', () => {
  const r = conciliarPixSaida(pix({ valor: 15, destinatario: 'LUCIANA LUCIO TRECE' }), [
    dev({ id: 'a', valor: 15, pessoaNome: 'SERGIO CELULARES', descricao: 'Devolução — SERGIO CELULARES' }),
    dev({ id: 'b', valor: 15, pessoaNome: 'TIAGO CELULARES', descricao: 'Devolução — TIAGO CELULARES' }),
  ])
  assert.equal(r.tipo, 'sem_par')
  if (r.tipo === 'sem_par') {
    assert.match(r.motivo, /LUCIANA LUCIO TRECE/)
    assert.match(r.motivo, /2 contas de R\$ 15,00/)
  }
})

test('duas devoluções do mesmo cliente com o mesmo valor → quem escolhe é o humano', () => {
  const r = conciliarPixSaida(pix(), [dev({ id: 'a' }), dev({ id: 'b', diaPagamento: '2026-11-30T14:00:00+00:00', diaVencimento: '2026-11-30' })])
  assert.equal(r.tipo, 'escolher')
  if (r.tipo === 'escolher') assert.equal(r.candidatos.length, 2)
})

test('devolução de 10 dias atrás está fora da janela de 7 → sem par', () => {
  const r = conciliarPixSaida(pix({ dia: '2026-12-11' }), [dev()])
  assert.equal(r.tipo, 'sem_par')
})

test('janela é parâmetro: o dono pode alargar sem mexer no código', () => {
  const r = conciliarPixSaida(pix({ dia: '2026-12-11' }), [dev()], { janelaDias: 15 })
  assert.equal(r.tipo, 'baixar')
})

test('devolução PARCIAL (R$ 60) não casa com PIX de R$ 100', () => {
  const r = conciliarPixSaida(pix(), [dev({ valor: 60 })])
  assert.equal(r.tipo, 'sem_par')
})

test('centavo de arredondamento não impede o casamento', () => {
  const r = conciliarPixSaida(pix({ valor: 100.01 }), [dev({ valor: 100 })])
  assert.equal(r.tipo, 'baixar')
})

test('linha que já tem comprovante ligado NÃO é candidata (não baixa duas vezes)', () => {
  const r = conciliarPixSaida(pix(), [dev({ conciliado: true })])
  assert.equal(r.tipo, 'sem_par')
})

test('linha cancelada é ignorada', () => {
  const r = conciliarPixSaida(pix(), [dev({ status: 'cancelado' })])
  assert.equal(r.tipo, 'sem_par')
})

test('linha de RECEBER não casa (senão o PIX que sai quitaria dívida de quem nos deve)', () => {
  const r = conciliarPixSaida(pix(), [dev({ tipo: 'receber' })])
  assert.equal(r.tipo, 'sem_par')
})

test('valor ilegível e PIX sem data: ignorar, não tentar adivinhar', () => {
  assert.equal(conciliarPixSaida(pix({ valor: null }), [dev()]).tipo, 'ignorar')
  assert.equal(conciliarPixSaida(pix({ valor: 0 }), [dev()]).tipo, 'ignorar')
  assert.equal(conciliarPixSaida(pix({ dia: null }), [dev()]).tipo, 'ignorar')
})

test('vencimento é usado quando a linha ainda está pendente (sem data de pagamento)', () => {
  const r = conciliarPixSaida(pix(), [
    dev({ status: 'pendente', diaPagamento: null, diaVencimento: '2026-12-02T00:00:00+00:00' }),
  ])
  assert.equal(r.tipo, 'baixar')
  if (r.tipo === 'baixar') assert.equal(r.candidato.status, 'pendente')
})

test('devolução vem antes de outra linha do mesmo valor (a linha do dia a dia)', () => {
  const r = conciliarPixSaida(pix({ destinatario: null }), [
    dev({ id: 'fornecedor', devolucaoId: null, pessoaNome: 'H2O DISTRIBUIDORA', descricao: 'PAGAMENTO DE MERCADORIA' }),
    dev({ id: 'cliente' }),
  ])
  assert.equal(r.tipo, 'escolher')
  if (r.tipo === 'escolher') assert.equal(r.candidatos[0].id, 'cliente')
})

test('nome com acento, caixa e CNPJ na frente casa com o cadastro', () => {
  assert.equal(mesmoCliente('38.216.415 MARLENE DA SILVA', 'Marlene da Silva'), true)
  assert.equal(mesmoCliente('JOAO VITOR MAXIMIANO FRANCA', 'João Vítor Maximiano França'), true)
  assert.equal(mesmoCliente('MARLENE', 'MARLENE DA SILVA OLIVEIRA'), true)
  assert.equal(mesmoCliente('ANA', 'ANABELA COSTA'), false)
  assert.equal(mesmoCliente('CARLOS EDUARDO', 'CARLOS HENRIQUE'), false)
  assert.equal(mesmoCliente(null, 'MARLENE DA SILVA'), false)
})

// Data: as três caras que o banco/PostgREST devolvem. Errar isso move o dia em um
// (pagamento de segunda virando domingo foi bug real em novembro).
test('dia: data pura, data pura em timestamptz e instante de verdade', () => {
  assert.equal(diaDoCampo('2026-12-02'), '2026-12-02')
  assert.equal(diaDoCampo('2026-12-02T00:00:00+00:00'), '2026-12-02')
  assert.equal(diaDoCampo('2026-12-02T14:20:00+00:00'), '2026-12-02')
  // 02/12 01:00 UTC = 01/12 22:00 em São Paulo → o dia é 01
  assert.equal(diaDoCampo('2026-12-02T01:00:00+00:00'), '2026-12-01')
  assert.equal(diaDoCampo(null), null)
  assert.equal(diaDoCampo(''), null)
  assert.equal(diaDoCampo('nao é data'), null)
})

// ---------- leitura da IA + mensagem que a equipe lê no grupo ----------

test('leitura da IA: JSON embrulhado em ``` e valor em formato brasileiro', () => {
  const l = normalizarLeitura('```json\n{"eh_comprovante":true,"valor":"R$ 1.530,90","data":"2026-12-02","pagador":"STOR ONE LTDA","destinatario":"MARLENE DA SILVA","transacao_id":"E00316901202612021420abc"}\n```')
  assert.equal(l.ehComprovante, true)
  assert.equal(l.valor, 1530.9)
  assert.equal(l.dia, '2026-12-02')
  assert.equal(l.destinatario, 'MARLENE DA SILVA')
  assert.equal(l.transacaoId, 'E00316901202612021420abc')
})

test('leitura da IA: lixo não vira valor inventado', () => {
  const l = normalizarLeitura('não consegui ler')
  assert.equal(l.valor, null)
  assert.equal(l.dia, null)
  assert.equal(normalizarLeitura({ eh_comprovante: false }).ehComprovante, false)
  assert.equal(parseValor(''), null)
  assert.equal(parseValor(0), null)
})

test('mensagem de baixa inequívoca: valor, data, nome e o que o robô LIGOU (sem mexer em dinheiro)', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev()]))
  assert.match(msg, /100,00/)
  assert.match(msg, /01\/12\/2026/)
  assert.match(msg, /Marlene da Silva/i)
  assert.match(msg, /Comprovante ligado a esta conta como prova/)
  assert.doesNotMatch(msg, /marque Pago/i)   // já estava paga: nada a fazer
})

test('mensagem avisa que "fora do app" NÃO baixa do PagBank', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev({ forma: 'fora_do_app' })]))
  assert.match(msg, /fora do app/i)
  assert.match(msg, /NÃO baixa do PagBank/)
})

test('mensagem avisa quando a conta ainda está em aberto (o robô não marca pago sozinho)', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev({ status: 'pendente' })]))
  assert.match(msg, /EM ABERTO/)
  assert.match(msg, /marque Pago/i)
})

test('mensagem sem par avisa que saiu dinheiro sem conta no app', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), []))
  assert.match(msg, /não achei a conta correspondente/i)
  assert.match(msg, /Devoluções/)
})

test('mensagem com dúvida lista os candidatos numerados', () => {
  const msg = mensagemDoPix(pix({ destinatario: null }), conciliarPixSaida(pix({ destinatario: null }), [dev({ id: 'a' })]))
  assert.match(msg, /1\. Marlene/i)
})

// ---------- cartão da devolução: o nome do SISTEMA manda ----------
//
// O caso real: o PIX de R$ 15,00 saiu para a conta de "Luciana Lúcio Trece", mas a
// devolução no app está no nome de SÉRGIO CELULARES. Procurar pelo nome do
// comprovante nunca acha nada — o cartão é que diz o nome do cadastro.

const CARTAO = `↩️ NOME DO CLIENTE EM SISTEMA:Sérgio celulares
⚠️ VALOR DO REEMBOLSO: *15,00*
💠 CHAVE PIX PARA REEMBOLSO:09992475730
🏦 BANCO:
❓ MOTIVO DO REEMBOLSO:Não tinha a peça
🪪 NOME DA CONTA BANCARIA:Luciana Lúcio Trece`

test('cartão da devolução: lê cliente do sistema, valor, chave e motivo', () => {
  const c = lerCartaoDevolucao(CARTAO)
  assert.ok(c)
  assert.equal(c!.clienteSistema, 'Sérgio celulares')
  assert.equal(c!.valor, 15)
  assert.equal(c!.chavePix, '09992475730')
  assert.equal(c!.motivo, 'Não tinha a peça')
  assert.equal(c!.nomeConta, 'Luciana Lúcio Trece')
  assert.equal(c!.temRotulo, true)
})

test('cartão: o nome da CONTA não vira nome do cliente', () => {
  const c = lerCartaoDevolucao(CARTAO)!
  assert.notEqual(c.clienteSistema, c.nomeConta)
  // e o nome do sistema casa com a devolução que existe no app
  assert.equal(mesmoCliente(c.clienteSistema, 'SÉRGIO CELULARES'), true)
  assert.equal(mesmoCliente(c.nomeConta, 'SÉRGIO CELULARES'), false)
})

test('cartão: sem os rótulos não é cartão (conversa no grupo não vira palpite)', () => {
  assert.equal(lerCartaoDevolucao('bom dia'), null)
  assert.equal(lerCartaoDevolucao('já paguei aquele cliente'), null)
  assert.equal(lerCartaoDevolucao(''), null)
})

test('cartão sem cliente ou sem valor é reconhecido como incompleto', () => {
  const soValor = lerCartaoDevolucao('⚠️ VALOR DO REEMBOLSO: 15,00')!
  assert.equal(soValor.valor, 15)
  assert.equal(soValor.clienteSistema, null)
})

test('o nome do cartão manda no casamento: PIX em nome alheio acha a devolução certa', () => {
  const daLoja = dev({ pessoaNome: 'SÉRGIO CELULARES', descricao: 'Devolução — SÉRGIO CELULARES', valor: 15 })
  // só com o nome do comprovante (conta da Luciana) não acha
  const semCartao = conciliarPixSaida(pix({ valor: 15, destinatario: 'Luciana Lúcio Trece' }), [daLoja])
  assert.equal(semCartao.tipo, 'sem_par')
  // com o cartão, acha e baixa (nome + valor + um candidato só)
  const comCartao = conciliarPixSaida(
    pix({ valor: 15, destinatario: 'Luciana Lúcio Trece', clienteSistema: 'Sérgio celulares' }),
    [daLoja],
  )
  assert.equal(comCartao.tipo, 'baixar')
})

test('mensagem mostra os dois nomes quando o PIX foi para conta de outra pessoa', () => {
  const msg = mensagemDoPix(
    pix({ valor: 15, destinatario: 'Luciana Lúcio Trece', clienteSistema: 'Sérgio celulares' }),
    conciliarPixSaida(pix({ valor: 15, destinatario: 'Luciana Lúcio Trece', clienteSistema: 'Sérgio celulares' }), [
      dev({ valor: 15, pessoaNome: 'SÉRGIO CELULARES', descricao: 'Devolução — SÉRGIO CELULARES' }),
    ]),
  )
  assert.match(msg, /Luciana Lúcio Trece/)
  assert.match(msg, /Cliente no sistema: Sérgio celulares/)
})


test('leitura: resposta da IA TRUNCADA não vira valor inventado', () => {
  // Aconteceu no primeiro teste real: o JSON voltou cortado no meio e o robô
  // disse "valor não foi lido" com a foto nítida. O certo é vir null (e a rota
  // faz a segunda leitura focada).
  const truncado = '{"eh_comprovante":true,"valor":51.00,"data":"2026-11-24","pagador":"38.216.41'
  const l = normalizarLeitura(truncado)
  assert.equal(l.valor, null)
  assert.equal(l.dia, null)
})
test('mensagem diz que o robô MARCOU pago (e não manda a pessoa repetir na tela)', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev({ status: 'pendente' })]), { pagou: true })
  assert.match(msg, /Marquei esta conta como PAGA/)
  assert.doesNotMatch(msg, /marque Pago na tela/i)
})

test('baixa recusada: mensagem continua mandando para a tela', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev({ status: 'pendente' })]), { pagou: false })
  assert.match(msg, /EM ABERTO/)
})
// ---------- print com VÁRIOS comprovantes (e print de cartão) ----------
// Print de conversa traz dois comprovantes empilhados: os dois são PIX e cada um
// precisa de resposta própria. Antes o robô lia um só e o outro sumia calado.

test('dois comprovantes na mesma imagem viram dois PIX', () => {
  const bruto = JSON.stringify({
    eh_comprovante: true,
    comprovantes: [
      { valor: 15.0, data: '2026-11-27', destinatario: 'CAUE GUILHERME DA SILVA FELICIO', transacao_id: 'E085617012026112723235WAO4ZU3BYG' },
      { valor: 77.0, data: '2026-11-27', destinatario: 'Larissa da Rocha Carvalho', transacao_id: 'E08561701202611272324ZZ5M5YHGRRN' },
    ],
  })
  const l = normalizarLeituras(bruto)
  assert.equal(l.comprovantes.length, 2)
  assert.deepEqual(l.comprovantes.map((c) => c.valor), [15, 77])
  assert.notEqual(l.comprovantes[0].transacaoId, l.comprovantes[1].transacaoId)
})

test('resposta no formato antigo (um objeto só) continua valendo', () => {
  const l = normalizarLeituras(JSON.stringify({ eh_comprovante: true, valor: 51.0, data: '2026-11-05', destinatario: 'FULANO' }))
  assert.equal(l.comprovantes.length, 1)
  assert.equal(l.comprovantes[0].valor, 51)
})

test('imagem do CARTÃO não vira PIX: valor do reembolso não é dinheiro que saiu', () => {
  const l = normalizarLeituras(JSON.stringify({
    eh_comprovante: false,
    comprovantes: [],
    cartoes: [
      { cliente_sistema: 'LARISSA PLAY TEC', valor: 77.0, destinatario: 'LARISSA DA ROCHA CARVALHO', motivo: 'CLIENTE DESISTIU' },
      { cliente_sistema: 'CAUE GUILHERME', valor: 15.0, destinatario: 'CAUE GUILHERME DA SILVA FELICIO', motivo: 'SEM PECA' },
    ],
  }))
  assert.equal(l.comprovantes.length, 0)
  assert.equal(l.cartoes.length, 2)
  assert.equal(l.cartoes[0].clienteSistema, 'LARISSA PLAY TEC')
  assert.equal(l.cartoes[0].nomeConta, 'LARISSA DA ROCHA CARVALHO')
  assert.equal(l.cartoes[1].valor, 15)
})

test('cartão no formato antigo (objeto único) continua valendo', () => {
  const l = normalizarLeituras(JSON.stringify({ cartao: { cliente_sistema: 'X', valor: 10 } }))
  assert.equal(l.cartoes.length, 1)
  assert.equal(l.cartoes[0].valor, 10)
})

test('segunda passada só com a data ainda serve (sem data não há janela)', () => {
  const l = normalizarLeituras(JSON.stringify({ comprovantes: [{ valor: null, data: '2026-11-27', destinatario: null }] }))
  assert.equal(l.comprovantes.length, 1)
  assert.equal(l.comprovantes[0].dia, '2026-11-27')
})

test('imagem sem comprovante nenhum não inventa PIX', () => {
  const l = normalizarLeituras(JSON.stringify({ comprovantes: [] }))
  assert.equal(l.comprovantes.length, 0)
  assert.equal(l.ehComprovante, false)
})
test('PIX sem conta: a pista nomeia a devolução lançada como "cancelou fiado"', () => {
  const pista = '💡 Achei devolução deste valor lançada como "cancelou fiado":\n   • 27/11/2026 · LARISSA PLAY TEC · R$ 77,00 · venda #15889'
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), []), { pista })
  assert.match(msg, /não achei a conta correspondente/)
  assert.match(msg, /cancelou fiado/)
  assert.match(msg, /#15889/)
})

test('PIX sem conta e sem pista não inventa explicação', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), []), { pista: null })
  assert.doesNotMatch(msg, /cancelou fiado/)
  assert.match(msg, /não achei a conta correspondente/)
})