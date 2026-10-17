// Testes da lógica PURA que mudou nos últimos 5 dias (sem rede/Supabase).
// Roda com: node --import ./test/loader.mjs --test test/logica.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { ehFeriadoNacional } from '@/lib/acesso'
import { min, hhmm, turnosDoDia, trabalhadoDoDia, furosDoDia, horasTexto, type Escala, type Excecao, type Ponto } from '@/lib/escala'
import { mesFechado, dataEmMesFechado, travarSeMesFechado } from '@/lib/fechamento'
import { ultimoDiaUtil, ehUltimoDiaUtil } from '@/lib/dia-util'
import { formatBRL, formatDate, slugify, normalizarUsuario } from '@/lib/utils'

// mock do supabase: só o que as helpers de fechamento usam (.from().select().eq().maybeSingle())
function sbMock(chaveExiste: boolean, erro: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (erro ? { data: null, error: erro } : { data: chaveExiste ? { chave: 'x' } : null, error: null }),
        }),
      }),
    }),
  } as any
}

// ── feriados nacionais ──────────────────────────────────────────────
test('feriado 01/01 (Confraternização)', () => assert.equal(ehFeriadoNacional(2026, 1, 1), true))
test('feriado 21/04 (Tiradentes)', () => assert.equal(ehFeriadoNacional(2026, 4, 21), true))
test('feriado 01/05 (Trabalho)', () => assert.equal(ehFeriadoNacional(2026, 5, 1), true))
test('feriado 07/09 (Independência)', () => assert.equal(ehFeriadoNacional(2026, 9, 7), true))
test('feriado 12/10 (Padroeira)', () => assert.equal(ehFeriadoNacional(2026, 10, 12), true))
test('feriado 02/11 (Finados)', () => assert.equal(ehFeriadoNacional(2026, 11, 2), true))
test('feriado 15/11 (República)', () => assert.equal(ehFeriadoNacional(2026, 11, 15), true))
test('feriado 20/11 (Consciência Negra)', () => assert.equal(ehFeriadoNacional(2026, 11, 20), true))
test('feriado 25/12 (Natal)', () => assert.equal(ehFeriadoNacional(2026, 12, 25), true))
test('dia comum NÃO é feriado', () => assert.equal(ehFeriadoNacional(2026, 3, 15), false))
test('carnaval 2026 (17/02) é feriado', () => assert.equal(ehFeriadoNacional(2026, 2, 17), true))
test('sexta-santa 2026 (03/04) é feriado', () => assert.equal(ehFeriadoNacional(2026, 4, 3), true))
test('corpus christi 2026 (04/06) é feriado', () => assert.equal(ehFeriadoNacional(2026, 6, 4), true))
test('domingo de páscoa NÃO é feriado nacional', () => assert.equal(ehFeriadoNacional(2026, 4, 5), false))

// ── escala: min / hhmm ─────────────────────────────────────────────
test('min("08:00") = 480', () => assert.equal(min('08:00'), 480))
test('min("08:00:00") = 480', () => assert.equal(min('08:00:00'), 480))
test('min(null) = 0', () => assert.equal(min(null), 0))
test('hhmm(480) = "08:00"', () => assert.equal(hhmm(480), '08:00'))
test('hhmm(90) = "01:30"', () => assert.equal(hhmm(90), '01:30'))
test('horasTexto(480) = "8h"', () => assert.equal(horasTexto(480), '8h'))
test('horasTexto(490) = "8h10"', () => assert.equal(horasTexto(490), '8h10'))

// ── turnosDoDia ────────────────────────────────────────────────────
const escBase: Escala[] = [{ id: 'e1', perfil_id: 'p1', dia: 1, entrada: '08:00:00', saida: '16:20:00', pausa_inicio: null, pausa_fim: null, ativo: true }]
test('rotina normal vira turno 08:00-16:20', () => {
  const t = turnosDoDia('2026-10-12', 1, escBase, [], { p1: 'Duda' })
  assert.equal(t.length, 1)
  assert.equal(t[0].entrada, 480)
  assert.equal(t[0].saida, 980)
  assert.equal(t[0].folga, false)
})
test('exceção folga marca folga=true', () => {
  const ex: Excecao[] = [{ id: 'x1', perfil_id: 'p1', data: '2026-10-12', folga: true, entrada: null, saida: null, motivo: 'folga' }]
  const t = turnosDoDia('2026-10-12', 1, escBase, ex, { p1: 'Duda' })
  assert.equal(t[0].folga, true)
})
test('exceção de horário sobrescreve rotina', () => {
  const ex: Excecao[] = [{ id: 'x1', perfil_id: 'p1', data: '2026-10-12', folga: false, entrada: '09:00', saida: '18:00', motivo: null }]
  const t = turnosDoDia('2026-10-12', 1, escBase, ex, { p1: 'Duda' })
  assert.equal(t[0].entrada, 540)
  assert.equal(t[0].saida, 1080)
  assert.equal(t[0].alterado, true)
})
test('exceção de quem NÃO tem rotina cria turno', () => {
  const ex: Excecao[] = [{ id: 'x2', perfil_id: 'p2', data: '2026-10-12', folga: false, entrada: '10:00', saida: '14:00', motivo: 'extra' }]
  const t = turnosDoDia('2026-10-12', 1, escBase, ex, { p1: 'Duda', p2: 'Mari' })
  assert.equal(t.some((x) => x.perfilId === 'p2' && x.alterado), true)
})
test('escala inativa é ignorada', () => {
  const esc: Escala[] = [{ ...escBase[0], ativo: false }]
  assert.equal(turnosDoDia('2026-10-12', 1, esc, [], { p1: 'Duda' }).length, 0)
})
test('escala de outro dia é ignorada', () => {
  assert.equal(turnosDoDia('2026-10-12', 2, escBase, [], { p1: 'Duda' }).length, 0)
})

// ── trabalhadoDoDia ────────────────────────────────────────────────
test('entrada+saída = 1 bloco, minutos certos', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r.length, 1)
  assert.equal(r[0].minutos, 600)
  assert.equal(r[0].aberto, false)
})
test('pausa remove o intervalo do bloco', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'pausa', criado_em: '2026-10-16T12:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'retorno', criado_em: '2026-10-16T12:30:00-03:00' },
    { usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 570) // 10h - 30min pausa
})
test('entrada sem saída (dia de hoje) fica aberto até agora', () => {
  const pts: Ponto[] = [{ usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' }]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T14:00:00-03:00'))
  assert.equal(r[0].aberto, true)
  assert.equal(r[0].minutos, 360)
})
test('ponto de OUTRO dia não conta', () => {
  const pts: Ponto[] = [{ usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-15T08:00:00-03:00' }]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r.length, 0)
})

// ── furosDoDia ─────────────────────────────────────────────────────
test('ninguém escalado = furo do expediente inteiro', () => {
  const f = furosDoDia([], 1)
  assert.equal(f.length, 1)
  assert.equal(f[0].de, 480)
  assert.equal(f[0].ate, 1140)
})
test('turno 08-16:20 deixa furo das 16:20 às 19:00 (loja fecha 19h)', () => {
  const turnos = turnosDoDia('2026-10-12', 1, escBase, [], { p1: 'Duda' })
  const f = furosDoDia(turnos, 1)
  assert.equal(f.length, 1)
  assert.equal(f[0].de, 980)
  assert.equal(f[0].ate, 1140)
})
test('pausa gera furo no meio + depois da saída', () => {
  const esc: Escala[] = [{ id: 'e1', perfil_id: 'p1', dia: 1, entrada: '08:00:00', saida: '18:00:00', pausa_inicio: '12:00', pausa_fim: '13:00', ativo: true }]
  const turnos = turnosDoDia('2026-10-12', 1, esc, [], { p1: 'Duda' })
  const f = furosDoDia(turnos, 1)
  // pausa 12:00-13:00 (720-780) e após saída 18:00-19:00 (1080-1140)
  assert.equal(f.length, 2)
  assert.equal(f[0].de, 720)
  assert.equal(f[0].ate, 780)
  assert.equal(f[1].de, 1080)
  assert.equal(f[1].ate, 1140)
})
test('domingo não tem furo (loja fechada)', () => {
  assert.equal(furosDoDia([], 0).length, 0)
})

// ── fechamento: helpers da trava de mês fechado ────────────────────
test('mesFechado: formato inválido (mês 1 dígito) → false', async () => {
  assert.equal(await mesFechado(sbMock(true), '2026-1'), false)
})
test('mesFechado: chave existe → true', async () => {
  assert.equal(await mesFechado(sbMock(true), '2026-09'), true)
})
test('mesFechado: chave ausente → false', async () => {
  assert.equal(await mesFechado(sbMock(false), '2026-09'), false)
})
test('mesFechado: erro na query → true (fail-closed)', async () => {
  assert.equal(await mesFechado(sbMock(false, new Error('rede')), '2026-09'), true)
})
test('dataEmMesFechado: null → false', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), null as any), false)
})
test('dataEmMesFechado: data em mês fechado → true', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), '2026-09-15'), true)
})
test('dataEmMesFechado: timestamp T00:00:00 → true (slice resolve)', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), '2026-09-15T00:00:00'), true)
})
test('dataEmMesFechado: mês aberto → false', async () => {
  assert.equal(await dataEmMesFechado(sbMock(false), '2026-09-15'), false)
})
test('travarSeMesFechado: data null → null (não trava)', async () => {
  assert.equal(await travarSeMesFechado(sbMock(true), null, 'testar'), null)
})
test('travarSeMesFechado: mês aberto → null', async () => {
  assert.equal(await travarSeMesFechado(sbMock(false), '2026-09-15', 'testar'), null)
})
test('travarSeMesFechado: mês fechado → mensagem com mês e ação', async () => {
  const msg = await travarSeMesFechado(sbMock(true), '2026-09-15', 'editar lançamento')
  assert.ok(msg && msg.includes('2026-09'))
  assert.ok(msg && msg.includes('editar lançamento'))
})

// ── dia-util: último dia útil (cron do aviso de fechamento) ───────
test('último dia útil out/2026 = 30 (sábado 31)', () => {
  assert.equal(ultimoDiaUtil(2026, 10), '2026-10-30')
})
test('último dia útil fev/2026 = 27 (sábado 28)', () => {
  assert.equal(ultimoDiaUtil(2026, 2), '2026-02-27')
})
test('último dia útil pula feriado extra', () => {
  assert.equal(ultimoDiaUtil(2026, 10, new Set(['2026-10-30'])), '2026-10-29')
})
test('ehUltimoDiaUtil: 30/10/2026 true', () => {
  assert.equal(ehUltimoDiaUtil('2026-10-30'), true)
})
test('ehUltimoDiaUtil: 29/10/2026 false', () => {
  assert.equal(ehUltimoDiaUtil('2026-10-29'), false)
})
test('ehUltimoDiaUtil: data inválida → false', () => {
  assert.equal(ehUltimoDiaUtil('xpto'), false)
})

// ── utils: formatação e normalização ──────────────────────────────
// Intl usa espaço não separável (U+00A0) entre R$ e o número
const NBSP = '\u00A0'
test('formatBRL(1500) → R$ 1.500,00', () => assert.equal(formatBRL(1500), 'R$' + NBSP + '1.500,00'))
test('formatBRL(0) → R$ 0,00', () => assert.equal(formatBRL(0), 'R$' + NBSP + '0,00'))
test('formatBRL(-10) → -R$ 10,00', () => assert.equal(formatBRL(-10), '-R$' + NBSP + '10,00'))
test('formatDate("2026-10-16") → 16/10/2026', () => assert.equal(formatDate('2026-10-16'), '16/10/2026'))
test('formatDate vazio → ""', () => assert.equal(formatDate(''), ''))
test('slugify remove acento e espaço', () => assert.equal(slugify('Célula Frontal'), 'celula-frontal'))
test('normalizarUsuario("Letícia") → "leticia"', () => assert.equal(normalizarUsuario('Letícia'), 'leticia'))
test('normalizarUsuario("Isabela Ponciano") → "isabela.ponciano"', () => assert.equal(normalizarUsuario('Isabela Ponciano'), 'isabela.ponciano'))
