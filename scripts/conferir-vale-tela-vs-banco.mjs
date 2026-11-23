// SÓ LEITURA — compara o "🎟️ Vale" que a TELA de Fiados mostra (produção) com a verdade
// do extrato de créditos (creditos_clientes: credito +, uso/estorno −).
import fs from 'node:fs'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
async function fetchAll(q) { const o = []; for (let i = 0; i < 500000; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw new Error(error.message); if (!data || !data.length) break; o.push(...data); if (data.length < 1000) break } return o }

// 1) verdade por pessoa (pessoa_id → saldo)
const creditos = await fetchAll((from, to) => s.from('creditos_clientes').select('pessoa_id, pessoa_nome, loja_id, tipo, valor').order('id').range(from, to))
const saldoPorPessoa = {}
for (const c of creditos) {
  const k = c.pessoa_id ?? 'sem-id'
  const v = (c.tipo === 'uso' || c.tipo === 'estorno') ? -Number(c.valor || 0) : Number(c.valor || 0)
  saldoPorPessoa[k] = (saldoPorPessoa[k] ?? 0) + v
}
console.log(`créditos lidos: ${creditos.length} · pessoas com saldo: ${Object.keys(saldoPorPessoa).length}`)

// 2) o que a tela mostra
const BASE = process.env.BASE || 'https://tecnocell-cloud.vercel.app'
const b = await chromium.launch(); const p = await b.newPage()
await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await p.fill('input[name="usuario"]', env.TESTE_USUARIO_EMAIL)
await p.fill('input[name="password"]', env.TESTE_USUARIO_SENHA)
await p.click('button[type="submit"]'); await p.waitForURL(/painel/, { timeout: 120000 })
await p.goto(BASE + '/painel/fiados', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('h2', { timeout: 120000 })
const texto = await p.locator('body').innerText()
await b.close()

const linhas = texto.split('\n').map((x) => x.replace(/\u00a0/g, ' ').trim()).filter(Boolean)
const achados = []
for (let i = 0; i < linhas.length; i++) {
  const m = linhas[i].match(/(\d+) notas? em aberto/)
  if (!m) continue
  // o bloco do cliente: a linha de cima é o nome; a de baixo traz "N notas", "venceu" e "Vale"
  const bloco = linhas[i] + ' ' + (linhas[i + 1] ?? '')
  const nome = linhas[i - 1]
  const linhaVale = bloco.match(/Vale R\$ ?([\d.,]+)/)
  if (!linhaVale || !nome || /notas? em aberto/i.test(nome)) continue
  achados.push({ nome, qtd: Number(m[1]), valeTela: Number(linhaVale[1].replace(/\./g, '').replace(',', '.')) })
}

// 3) pessoa_id de cada nome (paginado: sem range o PostgREST corta em 1000 e metade
// dos clientes some do mapa — foi assim que a primeira versão deste script deu 0 em tudo)
const pessoas = await fetchAll((from, to) => s.from('pessoas').select('id, nome').order('id').range(from, to))
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const idPorNome = new Map((pessoas ?? []).map((x) => [norm(x.nome), x.id]))

console.log(`\nClientes com "Vale" na tela: ${achados.length}\n`)
let iguais = 0, dobrados = 0, outros = 0
for (const a of achados) {
  const id = idPorNome.get(norm(a.nome))
  const verdade = Math.max(0, saldoPorPessoa[id ?? ''] ?? 0)
  const igual = Math.abs(verdade - a.valeTela) < 0.01
  const dobrado = Math.abs(verdade * 2 - a.valeTela) < 0.01 && verdade > 0
  if (igual) iguais++; else if (dobrado) dobrados++; else outros++
  console.log(`  ${igual ? '✔' : dobrado ? '✖ DOBRADO' : '? outra diferença'} ${a.nome.padEnd(34)} tela R$ ${brl(a.valeTela).padStart(9)} · verdade R$ ${brl(verdade).padStart(9)}`)
}
console.log(`\niguais ${iguais} · dobrados ${dobrados} · outras diferenças ${outros}`)
