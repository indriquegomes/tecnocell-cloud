// Conferência rápida da aba Particular no site no ar (login real, só leitura).
// Uso: node scripts/check-particular-aba.mjs
import fs from 'node:fs'
import { chromium } from '@playwright/test'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)

const browser = await chromium.launch()
const page = await browser.newPage()
const erros = []
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 200)) })
page.on('response', (r) => { if (r.status() >= 400) erros.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`) })

await page.goto('https://tecnocell-cloud.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.fill('input[name="usuario"]', env.TESTE_USUARIO_EMAIL)
await page.fill('input[name="password"]', env.TESTE_USUARIO_SENHA)
await page.click('button[type="submit"]')
await page.waitForURL(/painel/, { timeout: 60000 })

const t0 = Date.now()
await page.goto('https://tecnocell-cloud.vercel.app/painel/particular', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('h2', { timeout: 60000 })
const ms = Date.now() - t0

const texto = await page.locator('body').innerText()
const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
const tem = (s) => texto.includes(s)

console.log(`\n/painel/particular — ${ms} ms`)
console.log(`  título:          ${tem('Particular do Dono') ? 'OK' : 'FALTA'}`)
console.log(`  Pró-labore:      ${tem('Pró-labore do mês') ? 'OK' : 'FALTA'}`)
console.log(`  Sobra:           ${tem('Sobra para retirar') ? 'OK' : 'FALTA'}`)
console.log(`  botão nova conta:${tem('Nova conta particular') ? 'OK' : 'FALTA'}`)
for (const pedaco of ['Supercabo TV', 'Luiza Lopes Neves', 'Leoni De Souza Azevedo', 'Pró-labore novembro']) {
  console.log(`  linha "${pedaco}": ${tem(pedaco) ? 'aparece' : 'NÃO aparece'}`)
}
const valores = linhas.filter((l) => /^R\$ [\d.]+,\d\d$/.test(l))
console.log(`  valores na tela: ${valores.join(' · ')}`)
console.log(`  erros:           ${erros.length === 0 ? 'nenhum' : erros.join(' | ')}`)

await page.screenshot({ path: 'docs/fechamento/2026-11/particular.png', fullPage: true })
await browser.close()
process.exit(0)
