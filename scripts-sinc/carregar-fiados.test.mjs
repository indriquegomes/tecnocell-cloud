import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

test('aceita fiado com nome de cliente quando SIGE omite ClienteID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fiado-'))
  const fixture = join(dir, 'Crediario.json')
  await writeFile(fixture, JSON.stringify([{
    Id: 'sige-1', ClienteID: null, Cliente: 'Cliente Teste', CodigoSequencial: 1,
    Valor: 10, DataVencimento: '02/09/2026', Pago: false,
  }]))

  let enviados = 0
  const server = createServer((req, res) => {
    req.on('data', (chunk) => { enviados += JSON.parse(chunk).length })
    req.on('end', () => { res.writeHead(201); res.end() })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL('./carregar-fiados.mjs', import.meta.url).pathname.slice(1), fixture], {
      cwd: dir,
      env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: 'teste' },
    })
    let out = ''
    child.stdout.on('data', (data) => { out += data })
    child.stderr.on('data', (data) => { out += data })
    child.on('error', reject)
    child.on('close', () => resolve(out))
  })
  server.close()

  assert.match(stdout, /Upsert: 1 linhas/)
  assert.equal(enviados, 1)
})
