import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const { Client } = pg

const dbPassword = process.argv[2]
if (!dbPassword) {
  console.error('Uso: node scripts/apply-schema.mjs SUA_SENHA_DB')
  process.exit(1)
}

const projectRef = 'rbjwbfekkhebaschiqda'

// Tenta conexão direta primeiro, depois pooler
// host pode ser sobrescrito pelo segundo argumento
const customHost = process.argv[3] || null

const connectionStrings = customHost
  ? [
      `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${customHost}:5432/postgres`,
      `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@${customHost}:6543/postgres`,
      `postgresql://postgres:${encodeURIComponent(dbPassword)}@${customHost}:5432/postgres`,
    ]
  : [
      `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
      `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`,
    ]

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'schema.sql')
const sql = readFileSync(schemaPath, 'utf-8')

let connected = false
for (const connStr of connectionStrings) {
  const host = connStr.match(/@([^:]+)/)?.[1]
  process.stdout.write(`Tentando conectar em ${host}... `)
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    console.log('OK')
    console.log('Aplicando schema.sql...')
    await client.query(sql)
    console.log('\n✅ Schema aplicado com sucesso!')
    console.log('   Tabelas criadas: depositos, categorias, marcas, produtos, estoque,')
    console.log('   pessoas, lancamentos, formas_pagamento, sync_log, chat_sessoes, chat_mensagens')
    console.log('   Realtime e RLS configurados.')
    await client.end()
    connected = true
    break
  } catch (err) {
    console.log(`FALHOU (${err.message.split('\n')[0]})`)
    try { await client.end() } catch {}
  }
}

if (!connected) {
  console.error('\n❌ Não foi possível conectar com nenhum endpoint.')
  console.error('Verifique se a senha está correta em:')
  console.error('https://supabase.com/dashboard/project/rbjwbfekkhebaschiqda/settings/database')
  process.exit(1)
}
