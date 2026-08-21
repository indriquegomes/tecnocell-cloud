import { Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// Lê .env.local manualmente — o Playwright não carrega isso sozinho como o
// Next.js carrega pro app. Credenciais NUNCA fixas no código: login real
// da conta Master, não pode ficar em texto puro versionado no git.
export function carregarEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '..', '.env.local')
  const conteudo = fs.readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  for (const linha of conteudo.split('\n')) {
    const trimmed = linha.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.substring(0, idx).trim()] = trimmed
      .substring(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
  }
  return env
}

const env = carregarEnv()
const EMAIL = env.TESTE_USUARIO_EMAIL
const SENHA = env.TESTE_USUARIO_SENHA

if (!EMAIL || !SENHA) {
  throw new Error(
    '❌ TESTE_USUARIO_EMAIL e TESTE_USUARIO_SENHA precisam estar no .env.local'
  )
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', SENHA)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/painel**', { timeout: 20000 })
}
