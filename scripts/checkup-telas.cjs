// Check-up de telas — navega o painel em PRODUÇÃO, logado, e reporta o que quebrou.
//
// Só LEITURA: não clica em nada além do login. Serve para a primeira metade da
// receita `docs/receitas/checkup.md` (fase 1 e 2): deploy está no ar e nenhuma tela
// solta erro de console, exception ou HTTP >= 400.
//
// A credencial vem do `.env.local` (TESTE_USUARIO_EMAIL / TESTE_USUARIO_SENHA) —
// nunca escreva login neste arquivo.
//
//   node scripts/checkup-telas.cjs                 # produção
//   node scripts/checkup-telas.cjs http://localhost:3000   # dev local
//
// Sai com código 1 se alguma tela tiver problema. Screenshots em tmp-checkup/.
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const BASE = (process.argv[2] || 'https://tecnocell-cloud.vercel.app').replace(/\/$/, '')
const OUT = path.join(ROOT, 'tmp-checkup')

function lerEnv() {
  const txt = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  const pega = (k) => (txt.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim()
  const email = pega('TESTE_USUARIO_EMAIL')
  const senha = pega('TESTE_USUARIO_SENHA')
  if (!email || !senha) throw new Error('Falta TESTE_USUARIO_EMAIL / TESTE_USUARIO_SENHA no .env.local')
  return { email, senha }
}

// rotas de app/painel/**/page.tsx, sem as que exigem parâmetro ([id])
function rotas() {
  const out = []
  const anda = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!/\[.+\]/.test(e.name)) anda(p); continue }
      if (e.name !== 'page.tsx') continue
      const rel = path.relative(path.join(ROOT, 'app'), p).replace(/\\/g, '/').replace(/\/page\.tsx$/, '')
      out.push('/' + rel)
    }
  }
  anda(path.join(ROOT, 'app', 'painel'))
  return out.sort()
}

;(async () => {
  const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'))
  const { email, senha } = lerEnv()
  const lista = rotas()
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.fill('input[name="usuario"]', email)
  await page.fill('input[name="password"]', senha)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/painel/, { timeout: 60000 })
  console.log('login ok ·', BASE, '·', lista.length, 'telas\n')

  const ruins = []
  for (const rota of lista) {
    const erros = []
    const http = []
    const onConsole = (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 200)) }
    const onPageError = (e) => erros.push('pageerror: ' + String(e.message).slice(0, 200))
    const onResponse = (r) => {
      const u = r.url()
      if (r.status() >= 400 && !/favicon|\.(png|jpg|jpeg|webp|svg|woff2?|css|js)(\?|$)/.test(u)) {
        http.push(r.status() + ' ' + u.replace(BASE, '').slice(0, 120))
      }
    }
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('response', onResponse)

    const t0 = Date.now()
    let status = 0, titulo = ''
    try {
      const resp = await page.goto(BASE + rota, { waitUntil: 'domcontentloaded', timeout: 90000 })
      status = resp ? resp.status() : 0
      await page.waitForTimeout(1200)
      titulo = await page.evaluate(() => {
        const h = document.querySelector('h1, h2')
        return h ? h.textContent.trim().slice(0, 60) : ''
      }).catch(() => '')
    } catch (e) {
      erros.push('navegacao: ' + String(e.message).slice(0, 160))
    }
    const ms = Date.now() - t0

    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('response', onResponse)

    const corpo = await page.evaluate(() => document.body.innerText.slice(0, 400)).catch(() => '')
    const erroDeTela = /Application error|client-side exception/i.test(corpo)
    const problema = erros.length > 0 || http.length > 0 || status >= 400 || erroDeTela || !titulo

    if (problema) {
      const nome = rota.replace(/\//g, '_') || '_painel'
      await page.screenshot({ path: path.join(OUT, nome + '.png') }).catch(() => {})
      ruins.push({ rota, status, ms, titulo, erros, http, erroDeTela })
      console.log(`PROBLEMA ${String(ms).padStart(6)}ms ${status} ${rota}${titulo ? ' · ' + titulo : ''}`)
      for (const e of erros.slice(0, 4)) console.log('      ' + e)
      for (const q of http.slice(0, 4)) console.log('      ' + q)
      if (erroDeTela) console.log('      TELA DE ERRO (Application error)')
      if (!titulo) console.log('      SEM TITULO — página de impressão sem ?id= é falso positivo')
    } else {
      console.log(`ok       ${String(ms).padStart(6)}ms ${status} ${rota} · ${titulo}`)
    }
  }

  console.log('\n=== RESUMO ===')
  console.log('telas:', lista.length, '· com problema:', ruins.length)
  await browser.close()
  process.exit(ruins.length === 0 ? 0 : 1)
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
