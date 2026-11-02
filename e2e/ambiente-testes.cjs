const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const check = path.join(__dirname, '../scripts/check-test-environment.cjs')
const ref = 'gzetgvbzsinulxgxtflg'
const key = project => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ ref: project, role: 'service_role' })).toString('base64url')}.fixture`
const env = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_fixture',
  SUPABASE_SERVICE_ROLE_KEY: key(ref),
  APP_BASE_URL: 'https://tecnocell-cloud-testes.vercel.app',
}
const run = patch => spawnSync(process.execPath, [check], { env: { ...env, ...patch }, encoding: 'utf8' })

test('configuração isolada é aceita sem imprimir credenciais', () => {
  const result = run({})
  assert.equal(result.status, 0, result.stderr)
  assert.ok(!result.stdout.includes(env.SUPABASE_SERVICE_ROLE_KEY))
})
test('recusa URL ou chave administrativa pertencente à produção', () => {
  for (const patch of [
    { NEXT_PUBLIC_SUPABASE_URL: 'https://rbjwbfekkhebaschiqda.supabase.co' },
    { SUPABASE_SERVICE_ROLE_KEY: key('rbjwbfekkhebaschiqda') },
    { APP_BASE_URL: 'https://tecnocell-cloud.vercel.app' },
  ]) assert.notEqual(run(patch).status, 0)
})
test('recusa configuração incompleta, atendimento automático e integrações externas', () => {
  for (const patch of [
    { SUPABASE_SERVICE_ROLE_KEY: '' },
    { PEDIDOS_APP_AUTO_CREDITO_ENABLED: 'true' },
    { TELEGRAM_TOKEN_PETROPOLIS: 'fixture' },
    { GOOGLE_SA_JSON: 'fixture' },
  ]) assert.notEqual(run(patch).status, 0)
})
