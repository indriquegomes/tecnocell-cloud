// CAIXA DE TREINO DO DINHEIRO — PGlite com as colunas REAIS e dado fictício.
//
// Roda um comando só:  node test/dinheiro.test.mjs
//
// O que este arquivo faz:
//   1. Monta um banco de treino com os tipos reais de `lancamentos`, `caixas`,
//      `movimentos_caixa`, `pagamentos_venda` e `formas_pagamento` (conferidos
//      no banco de verdade: `data_pagamento` é timestamptz, não date).
//   2. "FOTO DE HOJE": reproduz o que o app faz hoje e mede a divergência entre
//      as telas. Estes testes passam justamente porque a divergência existe —
//      se um deles começar a falhar, alguém mudou a regra em um lugar só.
//   3. "COM A CORREÇÃO": aplica a migration nova (data do pagamento num formato
//      só) e prova que os leitores passam a concordar.
//
// Nenhuma linha de dado real é tocada: PGlite é um Postgres em memória.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const MIGRATIONS = path.join(import.meta.dirname, '..', 'supabase', 'migrations')
const ler = (nome) => fs.readFileSync(path.join(MIGRATIONS, nome), 'utf8')

// Extrai o corpo real de uma função da migration, sem alterar nada.
function funcao(arquivo, nome) {
  const sql = ler(arquivo)
  const inicio = sql.search(new RegExp(`create(?: or replace)? function public\\.${nome}\\(`, 'i'))
  assert.ok(inicio >= 0, `definição real de ${nome} em ${arquivo}`)
  const corpo = sql.slice(inicio)
  const tag = corpo.match(/as\s+(\$[a-z_]*\$)/i)[1]
  return corpo.slice(0, corpo.indexOf(tag, corpo.indexOf(tag) + tag.length) + tag.length) + ';'
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LOJA = uuid(21)
const CAIXA = uuid(31)
const CLIENTE = 'p-cliente-1'

// ── leitores de data, como o app lê ────────────────────────────────────────
// O PGlite devolve timestamptz como Date; o PostgREST devolve texto ISO. Os dois
// viram o mesmo texto aqui, senão o teste mede o toString do JavaScript.
const isoDe = (v) => (v instanceof Date ? v.toISOString() : String(v))
const diaSP = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaUTC = (iso) => String(iso).slice(0, 10)
const mes = (dia) => String(dia).slice(0, 7)

// ── as TRÊS contas da gaveta, copiadas do código de produção ───────────────
// Fórmula 1: banco — supabase/migrations/2026-11-06-calcular-valor-esperado.sql
//            "contém dinheiro", conta venda sem olhar o status do pagamento.
// Fórmula 2: app — lib/caixa.ts:106 (dinheiroNaGavetaDe)
//            "exatamente dinheiro", venda só com pagamento status 'pago'.
// Fórmula 3: tela — app/painel/pdv/operacao/page.tsx (tipoDoTexto)
//            mapa de apelidos + "contém dinheiro", sem filtro de status.
const ehDinheiroContem = (t) => String(t ?? '').trim().toLowerCase().includes('dinheiro')
const ehDinheiroExato = (t) => String(t ?? '').trim().toLowerCase() === 'dinheiro'

function gavetaFormulaApp({ abertura, movimentos, pagamentos, tipoPorForma }) {
  let saldo = Number(abertura ?? 0)
  for (const m of movimentos) {
    if (!ehDinheiroExato(m.forma_pagamento)) continue
    const v = Number(m.valor ?? 0)
    if (m.tipo === 'recebimento' || m.tipo === 'reforco') saldo += v
    else if (m.tipo === 'retirada' || m.tipo === 'devolucao') saldo -= v
  }
  for (const p of pagamentos) {
    if (p.status !== 'pago') continue
    if (tipoPorForma[p.forma_pagamento_id] !== 'dinheiro') continue
    saldo += Number(p.valor ?? 0)
  }
  return Math.round(saldo * 100) / 100
}

function gavetaFormulaTela({ abertura, movimentos, pagamentos, tipoPorForma }) {
  let saldo = Number(abertura ?? 0)
  for (const m of movimentos) {
    if (!ehDinheiroContem(m.forma_pagamento)) continue
    const v = Number(m.valor ?? 0)
    if (m.tipo === 'recebimento' || m.tipo === 'reforco') saldo += v
    else if (m.tipo === 'retirada' || m.tipo === 'devolucao') saldo -= v
  }
  for (const p of pagamentos) {
    if (tipoPorForma[p.forma_pagamento_id] !== 'dinheiro') continue // sem filtro de status
    saldo += Number(p.valor ?? 0)
  }
  return Math.round(saldo * 100) / 100
}

// ── o banco de treino ──────────────────────────────────────────────────────
async function bancoDeTreino({ comCorrecao = false } = {}) {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table lojas(id uuid primary key, nome text);
    create table contas(id uuid primary key, loja_id uuid);

    create table pessoas(
      id text primary key, nome text, limite_credito numeric(12,2), permite_fiado boolean
    );

    create table caixas(
      id uuid primary key, loja_id uuid, status text default 'aberto',
      valor_abertura numeric(12,2) default 0, valor_fechamento numeric(12,2),
      aberto_em timestamptz default now(), fechado_em timestamptz
    );

    create table formas_pagamento(
      id text primary key, nome text, ativo boolean default true, tipo text,
      loja_id uuid, maquina_id text, conta_destino_id uuid
    );

    create table vendas(
      id uuid primary key default gen_random_uuid(), numero integer, caixa_id uuid,
      status text, total numeric(12,2), pessoa_id text, deposito_id text,
      created_at timestamptz default now()
    );

    create table pagamentos_venda(
      id uuid primary key default gen_random_uuid(), venda_id uuid,
      forma_pagamento_id text, valor numeric(12,2) not null, taxa numeric(12,2) default 0,
      maquina text, parcelas integer default 1, status text default 'pago' not null
    );

    -- Tipos e CHECK copiados do banco de verdade (lancamentos: timestamptz em
    -- data_pagamento, data_competencia e data_vencimento; movimentos_caixa: CHECK de tipo)
    create table lancamentos(
      id text primary key default gen_random_uuid()::text,
      codigo integer, descricao text, valor numeric(12,2),
      data_competencia timestamptz, data_vencimento timestamptz, data_pagamento timestamptz,
      tipo text, status text, forma_pagamento text, pessoa_nome text,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      venda_id uuid, valor_pago numeric(12,2) default 0,
      historico_pagamentos jsonb default '[]'::jsonb,
      conta_id uuid, categoria text, subcategoria text, loja_id uuid,
      comprovante_url text, pessoa_id text, devolucao_id uuid
    );

    create table movimentos_caixa(
      id uuid primary key default gen_random_uuid(), caixa_id uuid,
      tipo text not null check (tipo in ('reforco','retirada','recebimento','devolucao')),
      motivo text, forma_pagamento text default 'Dinheiro' not null,
      valor numeric(10,2) not null, lancamento_id text, origem text,
      created_at timestamptz default now()
    );

    insert into lojas values('${LOJA}', 'Loja de Treino');
    insert into contas values('${uuid(41)}', '${LOJA}');
    insert into pessoas values
      ('${CLIENTE}', 'Cliente de Treino', 500, true),
      ('p-homonimo-a', 'Cliente Homônimo de Treino', 500, true),
      ('p-homonimo-b', 'Cliente Homônimo de Treino', 500, true);
    insert into formas_pagamento(id, nome, tipo, loja_id) values
      ('fp-dinheiro', 'Dinheiro', 'dinheiro', '${LOJA}'),
      ('fp-pix', 'PIX', 'pix', '${LOJA}'),
      ('fp-fiado', 'Fiado', 'fiado', '${LOJA}');
  `)

  // A conta oficial da gaveta vem do banco, como em produção.
  await db.exec(funcao('2026-11-06-calcular-valor-esperado.sql', 'calcular_valor_esperado'))

  if (comCorrecao) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, '2026-11-09-normalizar-data-pagamento.sql'), 'utf8'))
  }
  return db
}

async function abrirCaixa(db, abertura = 100) {
  await db.query(`insert into caixas(id, loja_id, status, valor_abertura) values($1,$2,'aberto',$3)`, [CAIXA, LOJA, abertura])
}

const esperadoDoBanco = async (db) => {
  const { rows } = await db.query('select public.calcular_valor_esperado($1) as v', [CAIXA])
  return Math.round(Number(rows[0].v ?? 0) * 100) / 100
}

// ══════════════════════════════════════════════════════════════════════════
// FOTO DE HOJE — o que o app faz agora, mesmo onde está errado
// ══════════════════════════════════════════════════════════════════════════

test('HOJE: data gravada pelo banco (::date) muda de dia conforme a tela que lê', async () => {
  const db = await bancoDeTreino()
  // É assim que receber_fiado_reais, receber_lancamentos_lote e receber_fiados_vale gravam.
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-banco', 'Fiado recebido no banco', 100, 'receber', 'pago',
            (now() at time zone 'America/Sao_Paulo')::date, 100)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id = 'l-banco'`)
  const iso = isoDe(l.data_pagamento)

  assert.notEqual(
    diaSP(iso), diaUTC(iso),
    'aqui a divergência DEVE existir: o banco gravou 00:00 UTC = 21h do dia anterior em Brasília',
  )
  await db.close()
})

test('HOJE: virada do mês — pagamento do dia 1º cai no mês anterior em Brasília', async () => {
  const db = await bancoDeTreino()
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-mes', 'Fiado recebido no dia 1º', 250, 'receber', 'pago', '2026-11-01'::date, 250)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id = 'l-mes'`)
  const iso = isoDe(l.data_pagamento)

  assert.equal(mes(diaUTC(iso)), '2026-11')
  assert.equal(mes(diaSP(iso)), '2026-10', 'é este o "dinheiro que muda de mês" que aparece no fechamento')
  await db.close()
})

test('HOJE: data gravada pelo app (ISO) depois das 21h cai no dia seguinte em UTC', async () => {
  const db = await bancoDeTreino()
  // 22h de Brasília = 01h do dia seguinte em UTC — new Date().toISOString()
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-app', 'Baixa pelo Financeiro as 22h', 80, 'receber', 'pago',
            '2026-11-07T22:00:00-03:00'::timestamptz, 80)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id = 'l-app'`)
  const iso = isoDe(l.data_pagamento)

  assert.equal(diaSP(iso), '2026-11-07')
  assert.equal(diaUTC(iso), '2026-11-08')
  assert.notEqual(diaSP(iso), diaUTC(iso), 'quem corta o texto em UTC mostra 08/11; quem converte mostra 07/11')
  await db.close()
})

test('HOJE: as três contas da gaveta não dão o mesmo número', async () => {
  const db = await bancoDeTreino()
  await abrirCaixa(db, 100)
  await db.exec(`
    insert into vendas(id, numero, caixa_id, status, total) values ('${uuid(51)}', 101, '${CAIXA}', 'concluida', 200);
    -- venda em dinheiro de verdade
    insert into pagamentos_venda(venda_id, forma_pagamento_id, valor, status)
      values ('${uuid(51)}', 'fp-dinheiro', 60, 'pago');
    -- pagamento em dinheiro que NÃO está 'pago' (a conta do banco soma, a do app não)
    insert into pagamentos_venda(venda_id, forma_pagamento_id, valor, status)
      values ('${uuid(51)}', 'fp-dinheiro', 40, 'pendente');
    -- fiado recebido em dinheiro
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
      values ('${CAIXA}', 'recebimento', 'Fiado recebido', 'Dinheiro', 20);
    -- movimento escrito com texto diferente (a conta do banco soma, a do app não)
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
      values ('${CAIXA}', 'recebimento', 'Sinal de encomenda', 'Dinheiro em espécie', 30);
    -- saída de dinheiro
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
      values ('${CAIXA}', 'retirada', 'Sangria', 'Dinheiro', 10);
  `)

  const { rows: movs } = await db.query('select tipo, forma_pagamento, valor from movimentos_caixa')
  const { rows: pags } = await db.query('select forma_pagamento_id, valor, status from pagamentos_venda')
  const tipoPorForma = { 'fp-dinheiro': 'dinheiro', 'fp-pix': 'pix', 'fp-fiado': 'fiado' }

  const doBanco = await esperadoDoBanco(db)
  const doApp = gavetaFormulaApp({ abertura: 100, movimentos: movs, pagamentos: pags, tipoPorForma })
  const daTela = gavetaFormulaTela({ abertura: 100, movimentos: movs, pagamentos: pags, tipoPorForma })

  // 100 abertura + 60 venda paga + 40 venda 'pendente' + 20 fiado + 30 texto livre - 10 sangria
  assert.equal(doBanco, 240)
  assert.equal(doApp, 170)
  assert.equal(daTela, 240)
  assert.notEqual(doBanco, doApp, 'fechamento do caixa e limite de retirada discordam em R$ 70,00 neste exemplo')
  await db.close()
})

test('HOJE: dívida do cliente por NOME junta dois cadastros diferentes', async () => {
  const db = await bancoDeTreino()
  await db.exec(`
    insert into lancamentos(id, descricao, valor, valor_pago, tipo, status, pessoa_id, pessoa_nome)
      values ('l-a', 'Fiado nota A', 100, 0, 'receber', 'pendente', 'p-homonimo-a', 'Cliente Homônimo de Treino'),
             ('l-b', 'Fiado nota B', 70, 0, 'receber', 'pendente', 'p-homonimo-b', 'Cliente Homônimo de Treino');
  `)
  const porNome = await db.query(
    `select coalesce(sum(valor - coalesce(valor_pago,0)),0) as v from lancamentos
      where tipo='receber' and status='pendente' and pessoa_nome = 'Cliente Homônimo de Treino'`)
  const porCadastro = await db.query(
    `select coalesce(sum(valor - coalesce(valor_pago,0)),0) as v from lancamentos
      where tipo='receber' and status='pendente' and pessoa_id = 'p-homonimo-a'`)

  assert.equal(Number(porNome.rows[0].v), 170, 'por nome: 170')
  assert.equal(Number(porCadastro.rows[0].v), 100, 'pelo cadastro: 100')
  assert.notEqual(Number(porNome.rows[0].v), Number(porCadastro.rows[0].v), 'dois clientes com o nome igual dividem a dívida')
  await db.close()
})

test('HOJE: baixa feita sem caixa aberto deixa o fiado pago e a gaveta sem o dinheiro', async () => {
  const db = await bancoDeTreino() // nenhum caixa aberto
  // Passo 1 = o que fazer; passo 2 = registrarNoCaixa (que desiste sem caixa aberto)
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
      values ('l-fiado', 'Fiado recebido no PDV', 150, 'receber', 'pago',
              (now() at time zone 'America/Sao_Paulo')::date, 150)
  `)
  const { rows: [mov] } = await db.query('select count(*)::int as n from movimentos_caixa')
  assert.equal(mov.n, 0)
  const { rows: [l] } = await db.query(`select status from lancamentos where id='l-fiado'`)
  assert.equal(l.status, 'pago', 'fiado quitado, dinheiro em lugar nenhum: é o caixa fechando com falta')
  await db.close()
})

// ══════════════════════════════════════════════════════════════════════════
// COM A CORREÇÃO — a migration nova (data do pagamento num formato só)
// ══════════════════════════════════════════════════════════════════════════

test('CORRIGIDO: data do banco (::date) mantém o dia e os dois leitores concordam', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-banco', 'Fiado recebido no banco', 100, 'receber', 'pago',
            (now() at time zone 'America/Sao_Paulo')::date, 100)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id='l-banco'`)
  const iso = isoDe(l.data_pagamento)
  const hojeSP = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  assert.equal(diaSP(iso), hojeSP, 'o dia do pagamento é o dia de hoje em Brasília')
  assert.equal(diaUTC(iso), diaSP(iso), 'qualquer leitor chega no mesmo dia')
  assert.equal(iso.slice(11, 19), '15:00:00', 'gravado ao meio-dia de Brasília')
  await db.close()
})

test('CORRIGIDO: virada do mês — o dia 1º continua no mês certo', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-mes', 'Fiado recebido no dia 1º', 250, 'receber', 'pago', '2026-11-01'::date, 250)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id='l-mes'`)
  const iso = isoDe(l.data_pagamento)
  assert.equal(diaSP(iso), '2026-11-01')
  assert.equal(diaUTC(iso), '2026-11-01')
  assert.equal(mes(diaSP(iso)), '2026-11', 'não escorrega mais para outubro')
  await db.close()
})

test('CORRIGIDO: pagamento às 22h de Brasília fica no dia de Brasília', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-app', 'Baixa pelo Financeiro as 22h', 80, 'receber', 'pago',
            '2026-11-07T22:00:00-03:00'::timestamptz, 80)
  `)
  const { rows: [l] } = await db.query(`select data_pagamento from lancamentos where id='l-app'`)
  const iso = isoDe(l.data_pagamento)
  assert.equal(diaSP(iso), '2026-11-07')
  assert.equal(diaUTC(iso), '2026-11-07')
  await db.close()
})

test('CORRIGIDO: não perde a hora real de quem já estava certo', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
    values ('l-hora', 'Pagamento as 20h17', 4321, 'receber', 'pago',
            '2026-11-07T20:17:12.402+00:00'::timestamptz, 4321)
  `)
  const { rows: [l] } = await db.query(`select to_char(data_pagamento at time zone 'UTC','HH24:MI:SS') as h from lancamentos where id='l-hora'`)
  assert.equal(l.h, '20:17:12', 'instante preservado quando o dia já é o mesmo nos dois leitores')
  await db.close()
})

test('CORRIGIDO: pago sem data ganha o dia de hoje; pendente não é tocado', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`
    insert into lancamentos(id, descricao, valor, tipo, status, valor_pago)
      values ('l-semd', 'Pago sem data', 10, 'receber', 'pago', 10),
             ('l-pend', 'Pendente com data velha', 10, 'receber', 'pendente', 0)
  `)
  await db.exec(`update lancamentos set data_pagamento = '2026-10-05T00:00:00+00'::timestamptz where id='l-pend'`)

  const { rows: [pago] } = await db.query(`select data_pagamento from lancamentos where id='l-semd'`)
  const { rows: [pend] } = await db.query(`select data_pagamento from lancamentos where id='l-pend'`)
  assert.ok(pago.data_pagamento, 'pago sempre tem data')
  assert.equal(diaSP(isoDe(pago.data_pagamento)), new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  assert.equal(diaUTC(isoDe(pend.data_pagamento)), '2026-10-05', 'pendente fica exatamente como estava')
  await db.close()
})

test('CORRIGIDO: rodar duas vezes dá o mesmo resultado (idempotente)', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  await db.exec(`insert into lancamentos(id, descricao, valor, tipo, status, data_pagamento, valor_pago)
                 values ('l-i', 'Duas vezes', 5, 'receber', 'pago', '2026-11-01'::date, 5)`)
  const antes = (await db.query(`select data_pagamento from lancamentos where id='l-i'`)).rows[0].data_pagamento
  await db.exec(`update lancamentos set descricao = 'Duas vezes (2)' where id = 'l-i'`)
  const depois = (await db.query(`select data_pagamento from lancamentos where id='l-i'`)).rows[0].data_pagamento
  assert.equal(isoDe(antes), isoDe(depois))
  await db.close()
})

test('CORRIGIDO: a data muda, o valor_pago NÃO (protege a tela de caixa)', async () => {
  const db = await bancoDeTreino({ comCorrecao: true })
  // operacao/page.tsx lê "valor_pago > 0" como "desta venda, quanto foi pago como fiado".
  // Se o gatilho enchesse valor_pago, a venda inteira viraria fiado abatido.
  await db.exec(`insert into lancamentos(id, descricao, valor, tipo, status, valor_pago, venda_id)
                 values ('l-v', 'Venda paga', 300, 'receber', 'pago', 0, '${uuid(51)}')`)
  const { rows: [l] } = await db.query(`select valor_pago from lancamentos where id='l-v'`)
  assert.equal(Number(l.valor_pago), 0, 'valor_pago continua como o app gravou')
  await db.close()
})

// ══════════════════════════════════════════════════════════════════════════
// PENDENTE — o que ainda NÃO está consertado (aparece como "todo", não falha)
// ══════════════════════════════════════════════════════════════════════════

test('TODO: uma função só para dar baixa (valor_pago + status + histórico + caixa juntos)', { todo: 'etapa 2 — precisa de RPC novo e migrar 3 caminhos' }, () => {})
test('TODO: o "desfazer pagamento" apagar a linha do histórico também', { todo: 'desfazer_pagamento_atomico não limpa historico_pagamentos' }, () => {})
test('TODO: sinal de encomenda e recebimento de OS gravarem valor_pago', { todo: 'encomendas/actions.ts:88 e os/actions.ts:192 gravam pago com valor_pago nulo' }, () => {})
test('TODO: dívida do cliente sempre pelo cadastro (pessoa_id)', { todo: 'etapa 3 — consulta própria no PDV e na devolução' }, () => {})
test('TODO: a gaveta ter uma conta só (banco, lib/caixa e tela)', { todo: 'etapa 5 — apagar as duas cópias do app' }, () => {})
test('TODO: crediário do PDV paginado', { todo: 'app/painel/pdv/actions.ts:581 sem fetchAll' }, () => {})
