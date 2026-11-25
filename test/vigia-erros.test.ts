import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparLinhas, escolherChatDeErro, gruposAAvisar, montarAviso, type LinhaErro } from '../lib/vigia-erros.ts'

// O aviso do vigia é o único sinal que o dono recebe durante o dia. Dois defeitos
// o inutilizam: agrupar errado (50 avisos do mesmo problema) e calar o que é
// grave (grupo silenciado cedo demais).

function linha(over: Partial<LinhaErro> = {}): LinhaErro {
  return {
    id: '1',
    created_at: '2026-11-23T12:00:00-03:00',
    agrupamento: 'abc',
    tela: '/painel/pdv',
    titulo: 'Venda não finalizou',
    gravidade: 'erro',
    usuario_id: null,
    usuario_email: null,
    ...over,
  }
}

test('mesmo agrupamento vira um grupo só, com a contagem certa', () => {
  const grupos = agruparLinhas([linha(), linha({ id: '2' }), linha({ id: '3', agrupamento: 'xyz', titulo: 'Catálogo não carregou' })])
  assert.equal(grupos.length, 2)
  assert.equal(grupos.find((g) => g.chave === 'abc')?.itens.length, 2)
  assert.equal(grupos.find((g) => g.chave === 'xyz')?.itens.length, 1)
})

test('grupo avisado na última hora não é avisado de novo', () => {
  const grupos = agruparLinhas([linha(), linha({ agrupamento: 'xyz' })])
  const restantes = gruposAAvisar(grupos, new Set(['abc']))
  assert.deepEqual(restantes.map((g) => g.chave), ['xyz'])
})

test('mensagem: plural certo, tela, quantas vezes e quem usava', () => {
  const grupos = agruparLinhas([linha({ usuario_id: 'u-1', usuario_email: 'gabriela.souza@tecnocell.com.br' })])
  const msg = montarAviso(grupos, 7, 15, 8, { 'u-1': 'GABRIELA DE SOUZA PEREIRA' })
  assert.match(msg, /1 problema novo nos últimos 15 min/)
  assert.match(msg, /⚠ 1× \[\/painel\/pdv\] Venda não finalizou \(GABRIELA DE SOUZA PEREIRA\)/)
  assert.match(msg, /Total hoje: 7/)
})

test('sem o nome da pessoa, o aviso não mostra login nem apelido', () => {
  const grupos = agruparLinhas([linha({ usuario_id: 'u-1', usuario_email: 'gabriela.souza@tecnocell.com.br' })])
  const msg = montarAviso(grupos, 1, 15, 8)
  assert.doesNotMatch(msg, /gabriela\.souza/)
  assert.match(msg, /Venda não finalizou\n/)
})

test('lista longa é cortada e diz que tem mais no painel', () => {
  const grupos = agruparLinhas(
    Array.from({ length: 12 }, (_, i) => linha({ agrupamento: 'g' + i, titulo: 'Problema ' + i })),
  )
  const msg = montarAviso(grupos, 12, 15, 8)
  assert.match(msg, /12 problemas novos/)
  assert.equal(msg.split('\n').filter((l) => l.startsWith('⚠') || l.startsWith('·')).length, 8)
  assert.match(msg, /\(\+4 grupos no painel\)/)
})

test('ponto de atenção usa marca diferente de erro', () => {
  const grupos = agruparLinhas([linha({ gravidade: 'atencao', titulo: 'Caixa aberto depois da hora' })])
  assert.match(montarAviso(grupos, 1, 15, 8), /· 1× \[\/painel\/pdv\] Caixa aberto/)
})

// ── Descoberta do grupo de aviso ──────────────────────────────────────────────
// O bot é o mesmo que já está em grupos da loja. Escolher errado aqui significa
// aviso técnico no grupo de comprovantes do cliente — por isso a regra é testada.

test('escolhe o grupo cujo nome fala de erro', () => {
  const chat = escolherChatDeErro([
    { id: -100, titulo: 'TecnoCell Petrópolis — Comprovantes', tipo: 'group' },
    { id: -200, titulo: 'TecnoCell — Erros', tipo: 'group' },
  ])
  assert.equal(chat?.id, -200)
})

test('nunca escolhe grupo da loja, conversa privada nem canal', () => {
  assert.equal(escolherChatDeErro([{ id: -100, titulo: 'TecnoCell Petrópolis — Comprovantes', tipo: 'group' }]), null)
  assert.equal(escolherChatDeErro([{ id: 555, titulo: 'Erros', tipo: 'private' }]), null)
  assert.equal(escolherChatDeErro([{ id: -300, titulo: 'Erros', tipo: 'channel' }]), null)
  assert.equal(escolherChatDeErro([]), null)
})

test('sem título não dá para saber, então não escolhe nada', () => {
  assert.equal(escolherChatDeErro([{ id: -400, titulo: null, tipo: 'supergroup' }]), null)
})

