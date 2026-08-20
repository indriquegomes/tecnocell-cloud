import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
fs.mkdirSync(DIR, { recursive: true })
const CAMINHO_DB = process.env.BOT_WHATSAPP_DB || path.join(DIR, 'bot-whatsapp.db')

const db = new DatabaseSync(CAMINHO_DB)
db.exec('pragma journal_mode = WAL; pragma busy_timeout = 5000;')
db.exec(`
create table if not exists conversas (
  id integer primary key autoincrement,
  loja text not null,
  telefone_truncado text not null,
  pergunta text not null,
  produto_buscado text,
  resultado text not null,
  resposta text,
  criado_em text not null default (datetime('now'))
);
create index if not exists ix_conv_loja_tel on conversas (loja, telefone_truncado);

create table if not exists avisos_diarios (
  loja text not null,
  telefone_truncado text not null,
  dia text not null,
  primary key (loja, telefone_truncado, dia)
);
`)

const q = (sql) => db.prepare(sql)
const diaHoje = () => new Date().toISOString().slice(0, 10)

export function registraTroca(t) {
  q(`insert into conversas (loja, telefone_truncado, pergunta, produto_buscado, resultado, resposta)
     values (?, ?, ?, ?, ?, ?)`)
    .run(t.loja, t.telefoneTruncado, t.pergunta, t.produtoBuscado ?? null, t.resultado, t.resposta ?? null)
}

export const jaAvisouHoje = (loja, telefoneTruncado) =>
  !!q('select 1 from avisos_diarios where loja=? and telefone_truncado=? and dia=?')
    .get(loja, telefoneTruncado, diaHoje())

export const marcaAvisoHoje = (loja, telefoneTruncado) =>
  q('insert or ignore into avisos_diarios (loja, telefone_truncado, dia) values (?, ?, ?)')
    .run(loja, telefoneTruncado, diaHoje())

export function fechaBanco() {
  try { db.exec('pragma wal_checkpoint(TRUNCATE);') } catch { /* nada */ }
  try { db.close() } catch { /* nada */ }
}
