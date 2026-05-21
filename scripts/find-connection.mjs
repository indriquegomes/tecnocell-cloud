import pg from 'pg'
const { Client } = pg

const pass = process.argv[2]
const ref  = 'rbjwbfekkhebaschiqda'
const passEnc = encodeURIComponent(pass)

const combos = [
  { h: `aws-0-sa-east-1.pooler.supabase.com`, p: 5432, u: `postgres.${ref}` },
  { h: `aws-0-sa-east-1.pooler.supabase.com`, p: 6543, u: `postgres.${ref}` },
  { h: `aws-0-sa-east-1.pooler.supabase.com`, p: 5432, u: `postgres` },
  { h: `aws-0-sa-east-1.pooler.supabase.com`, p: 6543, u: `postgres` },
  { h: `aws-0-us-east-1.pooler.supabase.com`, p: 5432, u: `postgres.${ref}` },
  { h: `aws-0-us-east-1.pooler.supabase.com`, p: 6543, u: `postgres.${ref}` },
  { h: `aws-0-us-east-1.pooler.supabase.com`, p: 5432, u: `postgres` },
  { h: `aws-0-us-east-1.pooler.supabase.com`, p: 6543, u: `postgres` },
  { h: `aws-0-eu-west-1.pooler.supabase.com`, p: 6543, u: `postgres.${ref}` },
  { h: `aws-0-eu-west-2.pooler.supabase.com`, p: 6543, u: `postgres.${ref}` },
  { h: `db.${ref}.supabase.co`,               p: 5432, u: `postgres` },
]

for (const c of combos) {
  const url = `postgresql://${encodeURIComponent(c.u)}:${passEnc}@${c.h}:${c.p}/postgres`
  process.stdout.write(`  ${c.u}@${c.h}:${c.p} ... `)
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 })
  try {
    await client.connect()
    const r = await client.query('SELECT current_database()')
    console.log(`✅ CONECTADO! db=${r.rows[0].current_database}`)
    console.log(`\nCONNECTION_OK: ${url}`)
    await client.end()
    process.exit(0)
  } catch (e) {
    console.log(`✗ ${e.message.split('\n')[0].substring(0, 70)}`)
    try { await client.end() } catch {}
  }
}
console.log('\nNenhuma combinação funcionou.')
process.exit(1)
