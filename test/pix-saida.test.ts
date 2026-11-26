import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conciliarPixSaida,
  diaDoCampo,
  mesmoCliente,
  type LancamentoPagar,
} from '../lib/pix-saida.ts'
import { mensagemDoPix, normalizarLeitura, parseValor } from '../lib/pix-saida-bot.ts'

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

const pix = (extra: Partial<{ valor: number | null; dia: string | null; destinatario: string | null }> = {}) => ({
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

test('nome parecido mas de outra pessoa não baixa (ADRIANO × ADRIANA)', () => {
  const r = conciliarPixSaida(pix({ destinatario: 'ADRIANA SOUZA' }), [
    dev({ pessoaNome: 'ADRIANO SOUZA', descricao: 'Devolução — ADRIANO SOUZA' }),
  ])
  assert.equal(r.tipo, 'escolher')
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

test('mensagem de baixa inequívoca: valor, data e nome aparecem e diz o que NÃO fez', () => {
  const msg = mensagemDoPix(pix(), conciliarPixSaida(pix(), [dev()]))
  assert.match(msg, /100,00/)
  assert.match(msg, /01\/12\/2026/)
  assert.match(msg, /Marlene da Silva/i)
  assert.match(msg, /Nada foi baixado/i)
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

