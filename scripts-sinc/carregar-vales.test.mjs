import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

test('carrega cliente limpo pelo cpfCnpj', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vale-'))
  const arquivo = join(dir, 'Clientes.json')
  await writeFile(arquivo, JSON.stringify([{
    id: 'sige-1', nome: 'Cliente X', cpfCnpj: '12.345.678/0001-90', saldoValeCredito: 7,
  }]))

  let enviado = null
  const server = createServer((req, res) => {
    let corpo = ''
    req.on('data', (chunk) => { corpo += chunk })
    req.on('end', () => {
      if (req.method === 'POST') enviado = JSON.parse(corpo)[0]
      const json = req.url.startsWith('/rest/v1/pessoas') ? [{ id: 'pessoa-1', cpf_cnpj: '12345678000190' }] : []
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`

  const out = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL('./carregar-vales.mjs', import.meta.url).pathname.slice(1), arquivo], {
      cwd: dir, env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'teste' },
    })
    let texto = ''
    child.stdout.on('data', (d) => { texto += d })
    child.stderr.on('data', (d) => { texto += d })
    child.on('error', reject)
    child.on('close', () => resolve(texto))
  })
  await new Promise((resolve) => server.close(resolve))

  assert.match(out, /Baseline aplicada: 1/)
  assert.equal(enviado.pessoa_nome, 'Cliente X')
  assert.equal(enviado.valor, 7)
})
