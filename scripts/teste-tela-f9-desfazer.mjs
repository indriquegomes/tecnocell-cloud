// TESTE NA TELA (produção): quita DUAS dívidas pelo F9 do PDV e desfaz UMA pelo botão
// "Desfazer" do Financeiro. Depois devolve o que sobrar.
//
// Prova o caminho que ainda não tinha sido testado:
//   1. F9 do PDV → visão "Por venda" → busca o cliente → marca 2 notas → forma PIX → Quitar
//      (é o caminho que chama `receber_lancamentos_lote`);
//   2. Financeiro → a linha do fiado → botão "Desfazer" (o caminho do `desfazerPagamento`);
//   3. o banco depois de cada passo: hora real no pagamento, um movimento por dívida com
//      vínculo `pdv`, e o que volta ao desfazer.
//
// Uso: node scripts/teste-tela-f9-desfazer.mjs "NOME DO CLIENTE" [valor1 valor2]
import fs from 'node:fs'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BASE = 'https://tecnocell-cloud.vercel.app'
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cliente = process.argv[2] ?? 'Maria Julia de Souza Ferreira Carvalho'
const alvos = process.argv.slice(3).map((v) => Number(v))
const dir = 'docs/registros-banco/2026-11'
fs.mkdirSync(dir, { recursive: true })

// ── foto de antes das dívidas do cliente
// Nome EXATO primeiro: "Maria Julia" casa com mais de um cadastro (tem a MILAGRE DE SOUZA)
// e a dívida é da Ferreira Carvalho.
const { data: pessoas } = await s.from('pessoas').select('id, nome, ativo').ilike('nome', cliente)
const pessoasOk = (pessoas ?? []).filter((p) => p.nome?.trim().toLowerCase() === cliente.trim().toLowerCase())
if (!pessoasOk.length) { console.error('cadastro não encontrado com esse nome exato:', cliente, '· achei:', (pessoas ?? []).map((p) => p.nome)); process.exit(1) }
const ids = pessoasOk.map((p) => p.id)
const { data: antes } = await s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, data_pagamento, loja_id')
  .in('pessoa_id', ids).eq('tipo', 'receber').eq('status', 'pendente').order('valor')
if (!antes?.length) { console.error('nenhum fiado em aberto para', cliente); process.exit(1) }
const dividas = (alvos.length ? antes.filter((d) => alvos.includes(Number(d.valor))) : antes.slice(0, 2))
if (dividas.length < (alvos.length || 2)) { console.error('não achei as dívidas dos valores pedidos:', antes.map((d) => d.valor)); process.exit(1) }
const total = Math.round(dividas.reduce((t, d) => t + Number(d.valor), 0) * 100) / 100
const idsTeste = dividas.map((d) => d.id)
console.log(`\nDÍVIDAS DO TESTE (${pessoas[0].nome}):`)
for (const d of dividas) console.log(`  ${d.descricao} · R$ ${brl(d.valor)} · ${d.status}`)
console.log(`  total a quitar: R$ ${brl(total)}`)
const foto = { quando: new Date().toISOString(), cliente: pessoas[0], dividas }
fs.writeFileSync(`${dir}/teste-tela-antes-${Date.now()}.json`, JSON.stringify(foto, null, 2), 'utf8')

// ── a tela
const browser = await chromium.launch()
const page = await browser.newPage()
const erros = []
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message.slice(0, 120)))
page.on('response', (r) => { if (r.status() >= 500) erros.push(`HTTP ${r.status()} ${r.url().slice(-60)}`) })

await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[name="usuario"]', env.TESTE_USUARIO_EMAIL)
await page.fill('input[name="password"]', env.TESTE_USUARIO_SENHA)
await page.click('button[type="submit"]')
await page.waitForURL(/painel/, { timeout: 90000 })

// 1) PDV → F9
await page.goto(BASE + '/painel/pdv', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h1, h2', { timeout: 90000 })
await page.keyboard.press('F9')
await page.waitForSelector('text=Crediário — A Receber (Fiado)', { timeout: 60000 })
console.log('\nF9 aberto: ✔ Crediário — A Receber (Fiado)')

await page.fill('input[placeholder="Buscar por cliente ou código da venda..."]', cliente)
// a lista chega por server action; espera a tabela aparecer em vez de dormir
await page.waitForSelector('table tbody tr', { timeout: 60000 })
await page.waitForTimeout(800)
const linhas = await page.locator('table tbody tr').all()
console.log(`linhas na tabela depois da busca: ${linhas.length}`)
let marcadas = 0
const numerosDa = (txt) => [...txt.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map((m) => Number(m[1].replace(/\./g, '').replace(',', '.')))
for (const tr of linhas) {
  const txt = (await tr.innerText()).replace(/\s+/g, ' ')
  // compara NÚMERO, não texto: "R$ 45,00" contém "5,00" e marcava a linha errada
  const nums = numerosDa(txt)
  const bate = dividas.some((d) => nums.includes(Number(d.valor)))
  if (!bate) continue
  const cb = tr.locator('input[type="checkbox"]')
  if (await cb.count()) { await cb.first().check(); marcadas++ }
  console.log(`  marcada: ${txt.slice(0, 90)}`)
}
if (marcadas !== dividas.length) { console.error(`marcou ${marcadas} de ${dividas.length} — abortando`); await browser.close(); process.exit(1) }

// forma de pagamento + quitar
const sel = page.locator('select').filter({ hasText: 'Escolha pagamento' }).first()
await sel.selectOption({ label: 'PIX' })
await page.waitForTimeout(400)
const botaoQuitar = page.locator('button', { hasText: /^Quitar R\$/ }).first()
console.log('  botão:', (await botaoQuitar.innerText()).trim())
await botaoQuitar.click()
await page.waitForTimeout(6000)

// 2) confere no banco o que o F9 gravou
const { data: depoisF9 } = await s.from('lancamentos')
  .select('id, descricao, valor, valor_pago, status, data_pagamento, forma_pagamento')
  .in('id', idsTeste)
console.log('\nDEPOIS DO F9 (banco):')
for (const l of depoisF9 ?? []) {
  const hora = l.data_pagamento && !String(l.data_pagamento).includes('T00:00:00') ? '✔ COM HORA' : '✖ data pura'
  console.log(`  ${l.descricao} · ${l.status} · pago ${brl(l.valor_pago)} · ${l.data_pagamento} → ${hora}`)
}
const { data: movs } = await s.from('movimentos_caixa')
  .select('id, valor, forma_pagamento, motivo, lancamento_id, origem, created_at')
  .in('lancamento_id', idsTeste).order('created_at')
console.log(`MOVIMENTOS (${(movs ?? []).length}) — esperado 1 por dívida, com origem pdv:`)
for (const m of movs ?? []) console.log(`  R$ ${brl(m.valor)} · ${m.forma_pagamento} · origem ${m.origem ?? 'NENHUMA'} · ${m.motivo}`)

// 3) Financeiro → tenta "Desfazer" numa das linhas
const alvoDesfazer = depoisF9?.[0]
try {
  await page.goto(BASE + '/painel/financeiro?busca=' + encodeURIComponent(alvoDesfazer.descricao.replace('A Receber — ', '')), { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h2', { timeout: 90000 })
  const botaoDesfazer = page.locator('button', { hasText: /Desfazer/ }).first()
  if (await botaoDesfazer.count() === 0) {
    console.log('\nℹ️  botão "Desfazer" não aparece para', alvoDesfazer.descricao)
  } else {
    const desabilitado = await botaoDesfazer.isDisabled()
    const titulo = await botaoDesfazer.getAttribute('title')
    console.log(`\n"Desfazer" em ${alvoDesfazer.descricao}: ${desabilitado ? 'DESABILITADO (por desenho)' : 'habilitado'}`)
    if (titulo) console.log(`  motivo: ${titulo}`)
    if (!desabilitado) {
      await botaoDesfazer.click()
      await page.waitForTimeout(5000)
      const { data: voltou } = await s.from('lancamentos').select('status, valor_pago, data_pagamento').eq('id', alvoDesfazer.id).maybeSingle()
      const { data: movVoltou } = await s.from('movimentos_caixa').select('id').eq('lancamento_id', alvoDesfazer.id)
      console.log(`  depois: status ${voltou?.status} · valor_pago ${brl(voltou?.valor_pago)} · data_pagamento ${voltou?.data_pagamento ?? '—'} · movimentos ${(movVoltou ?? []).length}`)
    }
  }
} catch (e) {
  erros.push('desfazer: ' + (e instanceof Error ? e.message : String(e)).slice(0, 120))
}

console.log('\nerros de tela:', erros.length ? erros.join(' | ') : 'nenhum')
await page.screenshot({ path: `${dir}/teste-tela-final.png`, fullPage: true }).catch(() => {})
await browser.close()

// 4) devolve o que sobrou (a dívida que não foi desfeita)
let devolvidas = 0
for (const id of idsTeste) {
  const { data: l } = await s.from('lancamentos').select('id, status, valor_pago, data_pagamento, forma_pagamento, historico_pagamentos').eq('id', id).maybeSingle()
  if (!l || l.status !== 'pago') continue
  const original = dividas.find((d) => d.id === id)
  await s.from('movimentos_caixa').delete().eq('lancamento_id', id)
  await s.from('lancamentos').update({
    status: original.status, valor_pago: original.valor_pago ?? 0,
    data_pagamento: original.data_pagamento, forma_pagamento: null,
    historico_pagamentos: [], updated_at: new Date().toISOString(),
  }).eq('id', id)
  devolvidas++
}
console.log(`\nDEVIDO DE VOLTA AO ESTADO ORIGINAL: ${devolvidas} lançamento(s)`)
const { data: fim } = await s.from('lancamentos').select('id, descricao, status, valor_pago').in('id', idsTeste)
for (const l of fim ?? []) console.log(`  ${l.descricao} · ${l.status} · pago ${brl(l.valor_pago)}`)
