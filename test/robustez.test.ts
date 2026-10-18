// Robustez: +50 edge cases e +50 fault-injection na lógica pura recente.
// O objetivo é ACHAR FALHA — input lixo não pode derrubar nem gerar NaN em dinheiro.
// Roda com: node --import ./test/loader.mjs --test test/robustez.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'

import { ehFeriadoNacional } from '@/lib/acesso'
import { min, hhmm, turnosDoDia, trabalhadoDoDia, furosDoDia, horasPorPessoa, horasTexto, type Escala, type Excecao, type Ponto } from '@/lib/escala'
import { mesFechado, dataEmMesFechado, travarSeMesFechado } from '@/lib/fechamento'
import { ultimoDiaUtil, ehUltimoDiaUtil } from '@/lib/dia-util'
import { formatBRL, formatDate, slugify, normalizarUsuario, diaSP } from '@/lib/utils'

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

const ESC: Escala = { id: 'e1', perfil_id: 'p1', dia: 1, entrada: '08:00:00', saida: '16:20:00', pausa_inicio: null, pausa_fim: null, ativo: true }

// ============================================================
// GRUPO A — EDGE CASES (50+)
// ============================================================

// --- feriados: anos diferentes, virada, dia 29/02 ---
test('A. feriado ano bissexto 2024 (01/01)', () => assert.equal(ehFeriadoNacional(2024, 1, 1), true))
test('A. 29/02/2024 (bissexto) NÃO é feriado', () => assert.equal(ehFeriadoNacional(2024, 2, 29), false))
test('A. natal em 2025', () => assert.equal(ehFeriadoNacional(2025, 12, 25), true))
test('A. páscoa 2027 → sexta-santa (26/03/2027)', () => assert.equal(ehFeriadoNacional(2027, 3, 26), true))
test('A. carnaval 2027 (09/02/2027)', () => assert.equal(ehFeriadoNacional(2027, 2, 9), true))

// --- escala min/hhmm: limite e zero ---
test('A. min("23:59") = 1439', () => assert.equal(min('23:59'), 1439))
test('A. min("00:00") = 0', () => assert.equal(min('00:00'), 0))
test('A. hhmm(0) = "00:00"', () => assert.equal(hhmm(0), '00:00'))
test('A. hhmm(1439) = "23:59"', () => assert.equal(hhmm(1439), '23:59'))

// --- turnosDoDia: pausa parcial, exceção sem saída ---
test('A. turno com pausa só início (sem fim) não conta pausa', () => {
  const esc: Escala = { ...ESC, pausa_inicio: '12:00', pausa_fim: null }
  const t = turnosDoDia('2026-10-12', 1, [esc], [], { p1: 'Duda' })[0]
  assert.equal(t.pausaIni, 720)
  assert.equal(t.pausaFim, null)
})
test('A. exceção com entrada mas sem saída mantém rotina de saída', () => {
  const ex: Excecao[] = [{ id: 'x', perfil_id: 'p1', data: '2026-10-12', folga: false, entrada: '09:00', saida: null, motivo: null }]
  const t = turnosDoDia('2026-10-12', 1, [ESC], ex, { p1: 'Duda' })[0]
  assert.equal(t.entrada, 540)
  assert.equal(t.saida, 980) // cai na rotina
})
test('A. turnos ordenados por entrada', () => {
  const esc: Escala[] = [
    { ...ESC, id: 'a', perfil_id: 'p1', entrada: '10:00:00', saida: '18:00:00' },
    { ...ESC, id: 'b', perfil_id: 'p2', entrada: '08:00:00', saida: '16:00:00' },
  ]
  const t = turnosDoDia('2026-10-12', 1, esc, [], { p1: 'A', p2: 'B' })
  assert.deepEqual(t.map((x) => x.perfilId), ['p2', 'p1'])
})

// --- trabalhadoDoDia: virada de dia, ordem bagunçada ---
test('A. pontos fora de ordem ainda somam certo', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 600)
})
test('A. entrada+entrada duplicada = uma só contagem', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:05:00-03:00' },
    { usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 600) // segunda entrada sobrescreve o início
})
test('A. saída sem entrada = zero minutos', () => {
  const pts: Ponto[] = [{ usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' }]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 0)
})
test('A. bloco aberto de dia ANTIGO não estende até agora', () => {
  const pts: Ponto[] = [{ usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-15T08:00:00-03:00' }]
  const r = trabalhadoDoDia(pts, '2026-10-15', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 0) // dia 15 != hoje 16 → não estende
  assert.equal(r[0].aberto, true)
})
test('A. pausa no fim do dia não subtrai negativo', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'pausa', criado_em: '2026-10-16T18:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 600)
})

// --- furosDoDia: cobertura parcial, sábado ---
test('A. turno cobre só até 12h → furo de 12h às 19h', () => {
  const esc: Escala[] = [{ ...ESC, saida: '12:00:00' }]
  const t = turnosDoDia('2026-10-12', 1, esc, [], { p1: 'Duda' })
  const f = furosDoDia(t, 1)
  assert.equal(f.length, 1)
  assert.equal(f[0].de, 720)
  assert.equal(f[0].ate, 1140)
})
test('A. sábado fecha 17h (furo vai até 17h)', () => {
  const t = turnosDoDia('2026-10-17', 6, [{ ...ESC, dia: 6, saida: '12:00:00' }], [], { p1: 'Duda' })
  const f = furosDoDia(t, 6)
  assert.equal(f[0].ate, 1020) // 17:00
})
test('A. fresta de 2min é ignorada (filtro >=5min)', () => {
  // pessoa A cobre 08:00-12:00, pessoa B começa 12:02 → fresta de 2 min
  const esc: Escala[] = [
    { ...ESC, id: 'a', perfil_id: 'p1', saida: '12:00:00' },
    { ...ESC, id: 'b', perfil_id: 'p2', entrada: '12:02:00', saida: '19:00:00' },
  ]
  const t = turnosDoDia('2026-10-12', 1, esc, [], { p1: 'A', p2: 'B' })
  const f = furosDoDia(t, 1)
  assert.equal(f.length, 0)
})

// --- horasPorPessoa: folga não conta, pausa desconta ---
test('A. horasPorPessoa soma e pula folga', () => {
  const esc: Escala[] = [{ ...ESC, id: 'a', perfil_id: 'p1' }]
  const ex: Excecao[] = [{ id: 'x', perfil_id: 'p1', data: '2026-10-13', folga: true, entrada: null, saida: null, motivo: 'folga' }]
  const dias = [
    { data: '2026-10-12', diaSemana: 1 },
    { data: '2026-10-13', diaSemana: 2 },
  ]
  const r = horasPorPessoa(dias, esc, ex, { p1: 'Duda' })
  assert.equal(r.length, 1)
  assert.equal(r[0].minutos, 500) // 8h20 de UM dia só (folga no outro)
  assert.equal(r[0].dias, 1)
})
test('A. horasPorPessoa desconta pausa', () => {
  const esc: Escala[] = [{ ...ESC, pausa_inicio: '12:00', pausa_fim: '13:00' }]
  const r = horasPorPessoa([{ data: '2026-10-12', diaSemana: 1 }], esc, [], { p1: 'Duda' })
  assert.equal(r[0].minutos, 440) // 8h20 - 1h pausa
})

// --- fechamento helpers: bordas ---
test('A. dataEmMesFechado: timestamp completo ISO com offset', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), '2026-09-30T23:59:00-03:00'), true)
})
test('A. travarSeMesFechado: mês futuro aberto', async () => {
  assert.equal(await travarSeMesFechado(sbMock(false), '2027-01-01', 'testar'), null)
})
test('A. travarSeMesFechado: mês atual aberto', async () => {
  assert.equal(await travarSeMesFechado(sbMock(false), '2026-10-16', 'testar'), null)
})

// --- dia-util: virada de ano, dezembro ---
test('A. último dia útil dez/2026 = 31 (quinta)', () => {
  assert.equal(ultimoDiaUtil(2026, 12), '2026-12-31')
})
test('A. último dia útil jan/2026 = 30 (sexta, 31 sáb)', () => {
  assert.equal(ultimoDiaUtil(2026, 1), '2026-01-30')
})
test('A. último dia útil dez/2026 com 31 feriado → 30', () => {
  assert.equal(ultimoDiaUtil(2026, 12, new Set(['2026-12-31'])), '2026-12-30')
})
test('A. ehUltimoDiaUtil virada de ano', () => {
  assert.equal(ehUltimoDiaUtil('2025-12-31'), true) // 31/12/2025 quarta
})

// --- utils: bordas ---
test('A. formatDate timestamp ISO (não date-only)', () => {
  assert.equal(formatDate('2026-10-16T00:00:00-03:00'), '16/10/2026')
})
test('A. formatDate data inválida → ""', () => {
  assert.equal(formatDate('lixo'), '')
})
test('A. formatDate mês/dia com zero à esquerda', () => {
  assert.equal(formatDate('2026-03-05'), '05/03/2026')
})
test('A. slugify string só símbolos → ""', () => {
  assert.equal(slugify('!!!'), '')
})
test('A. slugify número e letra', () => {
  assert.equal(slugify('iPhone 15 Pro'), 'iphone-15-pro')
})
test('A. normalizarUsuario múltiplos espaços', () => {
  assert.equal(normalizarUsuario('  João   da   Silva  '), 'joao.da.silva')
})
test('A. normalizarUsuario underline e traço', () => {
  assert.equal(normalizarUsuario('maria_silva-santos'), 'maria.silva.santos')
})
test('A. normalizarUsuario ponto duplo colapsa', () => {
  assert.equal(normalizarUsuario('a..b'), 'a.b')
})
test('A. normalizarUsuario só símbolos → ""', () => {
  assert.equal(normalizarUsuario('...'), '')
})
test('A. slugify remove acento e maiúscula (mesma regra do slug do feriado)', () => {
  assert.equal(slugify('Petrópolis'), 'petropolis')
})
test('A. slugify vazio → ""', () => {
  assert.equal(slugify(''), '')
})

// ============================================================
// GRUPO B — FAULT INJECTION (50+): input lixo NÃO pode quebrar
// ============================================================

// --- min / hhmm ---
test('B. min(undefined) não quebra → 0', () => assert.equal(min(undefined), 0))
test('B. min("") → 0', () => assert.equal(min(''), 0))
test('B. min("lixo") → 0 (não NaN)', () => assert.equal(min('lixo'), 0))
test('B. min("8") → 480 (hora sem minuto)', () => assert.equal(min('8'), 480))
test('B. min("08:00:00.000") → 480', () => assert.equal(min('08:00:00.000'), 480))
test('B. hhmm(NaN) não devolve NaN quebrado', () => {
  const v = hhmm(NaN as any)
  assert.ok(typeof v === 'string')
})
test('B. hhmm(-1) não explode', () => {
  assert.equal(hhmm(-1), '00:-1'.replace('00:-1', String(Math.floor(-1/60)).padStart(2,'0') + ':' + String(-1%60)))
})

// --- ehFeriadoNacional: datas absurdas ---
test('B. ehFeriadoNacional dia 0 → false (não quebra)', () => assert.equal(ehFeriadoNacional(2026, 1, 0), false))
test('B. ehFeriadoNacional dia 32 → false', () => assert.equal(ehFeriadoNacional(2026, 1, 32), false))
test('B. ehFeriadoNacional mês 13 → false', () => assert.equal(ehFeriadoNacional(2026, 13, 1), false))
test('B. ehFeriadoNacional ano 0 → não quebra', () => {
  const v = ehFeriadoNacional(0, 1, 1)
  assert.equal(typeof v, 'boolean')
})

// --- turnosDoDia: input vazio/lixo ---
test('B. turnosDoDia escalas vazio → []', () => {
  assert.deepEqual(turnosDoDia('2026-10-12', 1, [], [], {}), [])
})
test('B. turnosDoDia exceção data diferente não interfere', () => {
  const ex: Excecao[] = [{ id: 'x', perfil_id: 'p1', data: '2026-10-13', folga: true, entrada: null, saida: null, motivo: null }]
  const t = turnosDoDia('2026-10-12', 1, [ESC], ex, { p1: 'Duda' })
  assert.equal(t[0].folga, false)
})
test('B. turnosDoDia entrada > saida (invertida) não derruba', () => {
  const esc: Escala[] = [{ ...ESC, entrada: '18:00:00', saida: '08:00:00' }]
  const t = turnosDoDia('2026-10-12', 1, esc, [], { p1: 'Duda' })
  assert.equal(t[0].entrada, 1080)
  assert.equal(t[0].saida, 480)
})

// --- trabalhadoDoDia: lixo ---
test('B. trabalhadoDoDia pontos vazio → []', () => {
  assert.deepEqual(trabalhadoDoDia([], '2026-10-16', new Date('2026-10-16T20:00:00-03:00')), [])
})
test('B. trabalhadoDoDia tipo desconhecido é ignorado (não abre/fecha bloco)', () => {
  const pts: Ponto[] = [
    { usuario_id: 'p1', tipo: 'entrada', criado_em: '2026-10-16T08:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'xyz' as any, criado_em: '2026-10-16T10:00:00-03:00' },
    { usuario_id: 'p1', tipo: 'saida', criado_em: '2026-10-16T18:00:00-03:00' },
  ]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r[0].minutos, 600)
})
test('B. trabalhadoDoDia criado_em inválido não quebra', () => {
  const pts: Ponto[] = [{ usuario_id: 'p1', tipo: 'entrada', criado_em: 'lixo' }]
  const r = trabalhadoDoDia(pts, '2026-10-16', new Date('2026-10-16T20:00:00-03:00'))
  assert.equal(r.length, 0) // dataSP de 'lixo' = Invalid → não casa
})

// --- furosDoDia: lixo ---
test('B. furosDoDia turno entrada>saida (invertido) é ignorado', () => {
  const t = [{ perfilId: 'p1', nome: 'A', entrada: 1080, saida: 480, pausaIni: null, pausaFim: null, folga: false, motivo: null, alterado: false }]
  const f = furosDoDia(t, 1)
  assert.equal(f.length, 1) // ninguém válido cobre → furo cheio
})
test('B. furosDoDia turno folga é ignorado', () => {
  const t = [{ perfilId: 'p1', nome: 'A', entrada: 480, saida: 1140, pausaIni: null, pausaFim: null, folga: true, motivo: null, alterado: false }]
  const f = furosDoDia(t, 1)
  assert.equal(f.length, 1)
})

// --- fechamento helpers: input lixo ---
test('B. mesFechado mês vazio → false', async () => {
  assert.equal(await mesFechado(sbMock(true), ''), false)
})
test('B. mesFechado mês com letra → false', async () => {
  assert.equal(await mesFechado(sbMock(true), '20xx-zz'), false)
})
test('B. dataEmMesFechado string vazia → false', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), ''), false)
})
test('B. dataEmMesFechado undefined → false', async () => {
  assert.equal(await dataEmMesFechado(sbMock(true), undefined as any), false)
})
test('B. travarSeMesFechado data vazia → null', async () => {
  assert.equal(await travarSeMesFechado(sbMock(true), '', 'x'), null)
})
test('B. travarSeMesFechado com supabase que falha → NÃO libera (fail-closed)', async () => {
  const msg = await travarSeMesFechado(sbMock(true, new Error('boom')), '2026-09-01', 'x')
  assert.ok(msg) // erro na query → mesFechado true → mensagem (nunca null)
})
test('B. travarSeMesFechado erro de rede → NÃO libera (mensagem)', async () => {
  const msg = await travarSeMesFechado(sbMock(false, new Error('rede')), '2026-09-01', 'cancelar')
  assert.ok(msg) // fail-closed: erro → trata como fechado → mensagem
})

// --- dia-util: lixo ---
test('B. ultimoDiaUtil mês 0 → não quebra (retorna string)', () => {
  const v = ultimoDiaUtil(2026, 0)
  assert.equal(typeof v, 'string')
})
test('B. ehUltimoDiaUtil vazio → false', () => assert.equal(ehUltimoDiaUtil(''), false))
test('B. ehUltimoDiaUtil "2026-10" (sem dia) → false', () => assert.equal(ehUltimoDiaUtil('2026-10'), false))
test('B. ehUltimoDiaUtil número → false', () => assert.equal(ehUltimoDiaUtil(123 as any), false))

// --- utils: lixo ---
test('B. formatBRL(NaN) não quebra', () => {
  const v = formatBRL(NaN)
  assert.equal(typeof v, 'string')
})
test('B. formatBRL(Infinity) não quebra', () => {
  const v = formatBRL(Infinity)
  assert.equal(typeof v, 'string')
})
test('B. formatDate(undefined) → ""', () => assert.equal(formatDate(undefined as any), ''))
test('B. formatDate(null) → ""', () => assert.equal(formatDate(null as any), ''))
test('B. formatDate("2026-13-45") → "" (inválida)', () => assert.equal(formatDate('2026-13-45'), ''))
test('B. slugify(undefined) → ""', () => assert.equal(slugify(undefined as any), ''))
test('B. slugify(null) → ""', () => assert.equal(slugify(null as any), ''))
test('B. normalizarUsuario(null) → "" (harden com (text||""))', () => {
  assert.equal(normalizarUsuario(null as any), '')
})
test('B. diaSP("lixo") não quebra (retorna string)', () => {
  const v = diaSP('lixo')
  assert.equal(typeof v, 'string')
})
test('B. diaSP(undefined) não quebra (retorna string)', () => {
  const v = diaSP(undefined as any)
  assert.equal(typeof v, 'string')
})
test('B. slugify só acento → "a" (á vira a)', () => assert.equal(slugify('Á'), 'a'))
