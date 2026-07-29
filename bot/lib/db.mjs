import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
fs.mkdirSync(DIR, { recursive: true })
export const CAMINHO_DB = process.env.BOT_DB || path.join(DIR, 'bot.db')

export const db = new DatabaseSync(CAMINHO_DB)
db.exec('pragma journal_mode = WAL; pragma busy_timeout = 5000;')
db.exec(`
create table if not exists comprovantes (
  id integer primary key autoincrement,
  chat_id integer not null,
  msg_id integer not null,
  loja text not null,
  recebido_em text not null,
  formato text not null,
  file_id text,
  url text,
  valor real,
  data_pix text,
  pagador text,
  destinatario text,
  destinatario_doc text,
  transacao_id text,
  status text not null default 'recebido',
  tentativas integer not null default 0,
  ultima_falha text,
  proxima_tentativa text,
  valor_incerto integer not null default 0,
  valor_leitura2 real,
  valor_leitura3 real,
  dup_avisado integer not null default 0,
  cross_avisado integer not null default 0,
  raw text,
  unique (chat_id, msg_id)
);
create index if not exists ix_comp_chat_receb on comprovantes (chat_id, recebido_em);
create index if not exists ix_comp_status on comprovantes (status);
create index if not exists ix_comp_tx on comprovantes (transacao_id);

create table if not exists periodos (
  id integer primary key autoincrement,
  chat_id integer not null,
  aberto_em text not null,
  fechado_em text,
  aberto_por text,
  fechado_por text
);
create index if not exists ix_per_chat on periodos (chat_id, fechado_em);

create table if not exists estado (chave text primary key, valor text);

create table if not exists fechamentos (
  id integer primary key autoincrement,
  periodo_id integer,
  chat_id integer not null,
  loja text,
  aberto_em text,
  fechado_em text,
  total real not null default 0,
  n_validos integer not null default 0,
  n_dups integer not null default 0,
  n_incompletos integer not null default 0,
  n_naolidos integer not null default 0,
  aberto_por text,
  fechado_por text
);
create index if not exists ix_fech on fechamentos (fechado_em);
`)

const q = (sql) => db.prepare(sql)

export const getEstado = (k, def = null) => q('select valor from estado where chave=?').get(k)?.valor ?? def
export const setEstado = (k, v) => q('insert into estado (chave,valor) values (?,?) on conflict(chave) do update set valor=excluded.valor').run(k, String(v))

// Grava o comprovante que acabou de chegar. Se a mensagem já existe, não mexe (evita
// reprocessar em rajada de getUpdates repetido). Devolve a linha.
export function guardaChegada(c) {
  q(`insert into comprovantes (chat_id,msg_id,loja,recebido_em,formato,file_id,url,status)
     values (?,?,?,?,?,?,?, 'recebido')
     on conflict(chat_id,msg_id) do nothing`)
    .run(c.chat_id, c.msg_id, c.loja, c.recebido_em, c.formato, c.file_id ?? null, c.url ?? null)
  return q('select * from comprovantes where chat_id=? and msg_id=?').get(c.chat_id, c.msg_id)
}

export const porId = (id) => q('select * from comprovantes where id=?').get(id)

// FILA DE LEITURA — a regra que travava o bot antigo morreu aqui.
// Pendente é SÓ quem está 'recebido' (nunca foi lido com sucesso). Um comprovante lido
// que ficou sem transacao_id NÃO volta pra fila: ele é avisado na planilha, não relido
// pra sempre. `proxima_tentativa` segura o retry de falha transitória (backoff).
export const pendentes = (chat_id, limite = 5) =>
  q(`select * from comprovantes
     where chat_id=? and status='recebido'
       and (proxima_tentativa is null or proxima_tentativa <= ?)
     order by recebido_em limit ?`).all(chat_id, new Date().toISOString(), limite)

// /fechar não pode deixar comprovante pra trás só porque ele está esperando o backoff
// de uma falha de rede. Antes de somar, zera a espera e obriga a última tentativa.
export const forcaRetry = (chat_id) =>
  q(`update comprovantes set proxima_tentativa=null where chat_id=? and status='recebido'`).run(chat_id)

export function salvaLeitura(id, d) {
  q(`update comprovantes set valor=?, data_pix=?, pagador=?, destinatario=?, destinatario_doc=?,
       transacao_id=?, status=?, raw=?, valor_incerto=?, valor_leitura2=?, valor_leitura3=?,
       tentativas=0, ultima_falha=null, proxima_tentativa=null
     where id=?`)
    .run(d.valor ?? null, d.data_pix ?? null, d.pagador ?? null, d.destinatario ?? null, d.destinatario_doc ?? null,
      d.transacao_id ?? null, d.status, d.raw ?? null, d.valor_incerto ? 1 : 0,
      d.valor_leitura2 ?? null, d.valor_leitura3 ?? null, id)
}

// Falha de CONTEÚDO (a imagem não dá pra ler) queima tentativa: 3 e vira 'ilegivel'.
// Falha TRANSITÓRIA (API fora do ar, sem crédito, rede) NÃO pode virar 'ilegivel' —
// só agenda a próxima tentativa. Era assim que uma queda da Anthropic condenava
// comprovante bom a sumir da soma.
export function salvaFalha(id, motivo, transitoria) {
  const c = porId(id)
  const t = (c?.tentativas || 0) + 1
  if (transitoria) {
    const espera = Math.min(30 * 2 ** Math.min(t, 5), 600) * 1000
    q('update comprovantes set tentativas=?, ultima_falha=?, proxima_tentativa=? where id=?')
      .run(t, motivo, new Date(Date.now() + espera).toISOString(), id)
    return
  }
  q('update comprovantes set tentativas=?, ultima_falha=?, status=?, proxima_tentativa=null where id=?')
    .run(t, motivo, t >= 3 ? 'ilegivel' : 'recebido', id)
}

export const setStatus = (id, status) => q('update comprovantes set status=? where id=?').run(status, id)
export const setFlag = (id, campo) => q(`update comprovantes set ${campo}=1 where id=?`).run(id)
export const setDataPix = (id, d) => q('update comprovantes set data_pix=? where id=?').run(d ?? null, id)

export const periodoAberto = (chat_id) =>
  q('select * from periodos where chat_id=? and fechado_em is null order by aberto_em desc limit 1').get(chat_id)
export const ultimoPeriodo = (chat_id) =>
  q('select * from periodos where chat_id=? order by aberto_em desc limit 1').get(chat_id)
export const abrePeriodo = (chat_id, quem) =>
  q('insert into periodos (chat_id,aberto_em,aberto_por) values (?,?,?)').run(chat_id, new Date().toISOString(), quem ?? null)
export const fechaPeriodo = (id, quem) =>
  q('update periodos set fechado_em=?, fechado_por=? where id=?').run(new Date().toISOString(), quem ?? null, id)

// Comprovantes do período (ou tudo do grupo, se nunca teve período). NÃO tem cap de 1000
// como o PostgREST — é banco local, a query devolve tudo mesmo.
export function doPeriodo(chat_id, { desde = null, ate = null } = {}) {
  if (!desde) return q('select * from comprovantes where chat_id=? order by recebido_em, msg_id').all(chat_id)
  return q('select * from comprovantes where chat_id=? and recebido_em>=? and recebido_em<=? order by recebido_em, msg_id')
    .all(chat_id, desde, ate || new Date().toISOString())
}

export const porPeriodoId = (periodo_id) => {
  const p = q('select * from periodos where id=?').get(periodo_id)
  if (!p) return []
  return doPeriodo(p.chat_id, { desde: p.aberto_em, ate: p.fechado_em })
}

// Dedup só olha a janela recente. Varrer o grupo inteiro a cada mensagem cresce sem
// limite e não adianta: E2E de semanas atrás não se repete.
export const comTransacao = (chat_id, desde = null) =>
  q(`select * from comprovantes where chat_id=? and transacao_id is not null and transacao_id<>''
       and recebido_em >= ? order by msg_id`)
    .all(chat_id, desde || new Date(Date.now() - 15 * 86400000).toISOString())

export function guardaFechamento(f) {
  q(`insert into fechamentos (periodo_id,chat_id,loja,aberto_em,fechado_em,total,n_validos,n_dups,n_incompletos,n_naolidos,aberto_por,fechado_por)
     values (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.periodo_id ?? null, f.chat_id, f.loja ?? null, f.aberto_em ?? null, f.fechado_em ?? null,
      f.total || 0, f.n_validos || 0, f.n_dups || 0, f.n_incompletos || 0, f.n_naolidos || 0,
      f.aberto_por ?? null, f.fechado_por ?? null)
}
export const historico = (limite = 200) =>
  q('select * from fechamentos order by fechado_em desc limit ?').all(limite)

export function fechaBanco() {
  try { db.exec('pragma wal_checkpoint(TRUNCATE);') } catch { /* nada */ }
  try { db.close() } catch { /* nada */ }
}

export const txNoOutroGrupo = (chat_id, tx) =>
  q(`select * from comprovantes where chat_id<>? and transacao_id=? and status not in ('nao_comprovante')`).all(chat_id, tx)
