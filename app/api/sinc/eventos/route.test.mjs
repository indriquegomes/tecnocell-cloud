import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('sincronização dispara worker por evento e cron respeita plano Hobby', async () => {
  const rota = await readFile(new URL('./route.ts', import.meta.url), 'utf8')
  const vercel = JSON.parse(await readFile(new URL('../../../../vercel.json', import.meta.url), 'utf8'))
  assert.match(rota, /after\s*\(/)
  assert.equal(vercel.crons.find((c) => c.path === '/api/sinc/worker')?.schedule, '0 3 * * *')
})
