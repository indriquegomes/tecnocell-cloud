import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparLinhas, dentroDoHorarioDeAviso, escolherChatDeErro, gruposAAvisar, inicioDaJanela, jaAvisouParadoHoje, mapearChats, montarAviso, precisaAvisarParado, type LinhaErro } from '../lib/vigia-erros.ts'

// O aviso do vigia é o único sinal que o dono recebe durante o dia. Três defeitos
// o inutilizam: agrupar errado (50 avisos do mesmo problema), calar o que é grave
// (silêncio cedo demais) e avisar na hora errada (madrugada).

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

// ── Descoberta do destino ─────────────────────────────────────────────────────
// O bot do monitoramento é dedicado, mas escolher errado aqui manda aviso técnico
// para a conversa errada.

test('escolhe o grupo cujo nome fala de erro', () => {
  const chat = escolherChatDeErro([
    { id: -100, titulo: 'TecnoCell Petrópolis — Comprovantes', tipo: 'group' },
    { id: -200, titulo: 'TecnoCell — Erros', tipo: 'group' },
  ])
  assert.equal(chat?.id, -200)
})

test('nunca escolhe grupo da loja nem canal', () => {
  assert.equal(escolherChatDeErro([{ id: -100, titulo: 'TecnoCell Petrópolis — Comprovantes', tipo: 'group' }]), null)
  assert.equal(escolherChatDeErro([{ id: -300, titulo: 'Erros', tipo: 'channel' }]), null)
  assert.equal(escolherChatDeErro([]), null)
})

test('sem grupo com "erro", cai na conversa direta com o bot', () => {
  const chat = escolherChatDeErro([
    { id: -100, titulo: 'TecnoCell Petrópolis — Comprovantes', tipo: 'group' },
    { id: 555, titulo: null, tipo: 'private', nome: 'Indrique' },
  ])
  assert.equal(chat?.id, 555)
})

test('grupo com "erro" ganha da conversa direta', () => {
  const chat = escolherChatDeErro([
    { id: 555, titulo: null, tipo: 'private', nome: 'Indrique' },
    { id: -200, titulo: 'TecnoCell — Erros', tipo: 'group' },
  ])
  assert.equal(chat?.id, -200)
})

test('sem título não dá para saber, então não escolhe nada', () => {
  assert.equal(escolherChatDeErro([{ id: -400, titulo: null, tipo: 'supergroup' }]), null)
})

// O formato do Telegram usa `type`/`title`/`first_name`. Ler `tipo`/`titulo` no
// JSON cru fazia a descoberta receber os updates e não reconhecer nenhum — em
// produção isso significa aviso que nunca sai. Esta é a tradução, testada no
// formato REAL que o Telegram devolve.
test('traduz o formato real do Telegram (type/title/first_name)', () => {
  const chats = mapearChats([
    { message: { chat: { id: 901717187, type: 'private', first_name: 'Indrique' } } },
    { my_chat_member: { chat: { id: -1001234567890, type: 'supergroup', title: 'TecnoCell — Erros' } } },
  ])
  assert.deepEqual(chats, [
    { id: 901717187, tipo: 'private', titulo: null, nome: 'Indrique' },
    { id: -1001234567890, tipo: 'supergroup', titulo: 'TecnoCell — Erros', nome: null },
  ])
  assert.equal(escolherChatDeErro(chats)?.id, -1001234567890)
})

test('conversa direta do dono é reconhecida depois da tradução', () => {
  const chats = mapearChats([{ message: { chat: { id: 901717187, type: 'private', first_name: 'Indrique' } } }])
  assert.equal(escolherChatDeErro(chats)?.id, 901717187)
})

// ── Horário de aviso ─────────────────────────────────────────────────────────
// O vigia roda 24h, mas alerta só com a loja funcionando. Abrir demais acorda o
// dono de madrugada; fechar demais deixa o problema de sexta sem aviso.

const min = (h: number, m = 0) => h * 60 + m

test('dia de semana: avisa das 8h até 1h30 depois do fechamento', () => {
  const seg = 1
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(7, 59), diaSemana: seg }), false)
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(8), diaSemana: seg }), true)
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(12), diaSemana: seg }), true)
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(19, 59), diaSemana: seg }), true)  // 18:30 + 90
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(20, 1), diaSemana: seg }), false)
})

test('madrugada e domingo ficam em silêncio', () => {
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(3), diaSemana: 3 }), false)
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(12), diaSemana: 0 }), false)  // domingo
})

test('sábado fecha mais cedo e a folga acompanha', () => {
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(17, 59), diaSemana: 6 }), true)   // 16:30 + 90
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(18, 1), diaSemana: 6 }), false)
})

test('horário configurado pela tela manda (não é fixo no código)', () => {
  // loja que fecha 21h: avisa até 22:30
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(22), diaSemana: 2 }, '21:00', '16:30'), true)
  // sábado com fechamento 17h: 18h ainda está na folga, 18h31 já passou
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(18), diaSemana: 6 }, '18:30', '17:00'), true)
  assert.equal(dentroDoHorarioDeAviso({ minutosDoDia: min(18, 31), diaSemana: 6 }, '18:30', '17:00'), false)
})

test('janela pega o atrasado da madrugada, sem inflar no dia normal', () => {
  const agora = 1_000_000_000_000
  const quinzeMin = 15 * 60_000
  // passada normal (envio recente): janela curta de 15 min
  assert.equal(inicioDaJanela(agora, agora - 10 * 60_000, 15), agora - quinzeMin)
  // veio de 8 horas sem conseguir avisar: janela começa no último envio
  assert.equal(inicioDaJanela(agora, agora - 8 * 3600_000, 15), agora - 8 * 3600_000)
  // nunca enviou: janela curta
  assert.equal(inicioDaJanela(agora, null, 15), agora - quinzeMin)
})

// ── Guarda do vigia ──────────────────────────────────────────────────────────
// Sem isto, "vigia morto" é indistinguível de "nada quebrou": o silêncio é o mesmo.

test('guarda percebe o vigia parado, com folga para 4 passadas perdidas', () => {
  const agora = 1_000_000_000_000
  assert.equal(precisaAvisarParado(agora - 10 * 60_000, agora), false)  // 10 min: normal
  assert.equal(precisaAvisarParado(agora - 39 * 60_000, agora), false)  // 39 min: ainda ok
  assert.equal(precisaAvisarParado(agora - 41 * 60_000, agora), true)   // 41 min: parado
  assert.equal(precisaAvisarParado(agora - 20 * 3600_000, agora), true)
  // nunca passou: também é problema (nunca rodou)
  assert.equal(precisaAvisarParado(null, agora), true)
})

test('guarda avisa no máximo uma vez por dia', () => {
  assert.equal(jaAvisouParadoHoje('2026-11-25', '2026-11-25'), true)
  assert.equal(jaAvisouParadoHoje('2026-11-25', '2026-11-26'), false)
  assert.equal(jaAvisouParadoHoje(null, '2026-11-25'), false)
  assert.equal(jaAvisouParadoHoje(undefined, '2026-11-25'), false)
})
