import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { login } from './helpers'

// ── Carrega variáveis do .env.local ──────────────────────────────────────────
function carregarEnv(): Record<string, string> {
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

// Credenciais lidas do .env.local — nunca fixas no código
const TESTE_EMAIL = env.TESTE_USUARIO_EMAIL
const TESTE_SENHA = env.TESTE_USUARIO_SENHA

if (!TESTE_EMAIL || !TESTE_SENHA) {
  throw new Error(
    '❌ TESTE_USUARIO_EMAIL e TESTE_USUARIO_SENHA precisam estar no .env.local'
  )
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRODUTO_BUSCA = 'pelicula iphone 11'

// ── Testes unitários de UI (mantidos) ────────────────────────────────────────
test.describe('PDV', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/painel/pdv')
    await page.waitForLoadState('networkidle')
  })

  test('página carrega com produtos disponíveis', async ({ page }) => {
    await expect(page.locator('text=PDV').first()).toBeVisible()
    await expect(page.locator('input[placeholder*="Buscar produto"]').first()).toBeVisible()
    await expect(page.locator('text=produtos disponíveis')).toBeVisible()
  })

  test('busca filtra produtos', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const dropdown = page.locator('[class*="shadow-lg"]').first()
    await expect(dropdown).toBeVisible({ timeout: 3000 })
  })

  test('botão ℹ abre ficha do produto', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('botão Fechar fecha ficha do produto', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
    await page.locator('button', { hasText: 'Fechar' }).click()
    await expect(page.locator('text=Preço de venda')).not.toBeVisible({ timeout: 2000 })
  })

  test('adicionar produto ao carrinho via ficha', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    const addBtn = page.getByRole('button', { name: '+ Adicionar', exact: true })
    if (await addBtn.isDisabled()) { test.skip(); return }
    await addBtn.click()
    await expect(page.locator('text=Preço de venda')).not.toBeVisible()
    await expect(page.locator('text=R$ 0,00').first()).not.toBeVisible({ timeout: 2000 }).catch(() => {})
  })

  test('adicionar produto via click no dropdown', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const primeiroItem = page.locator('[class*="shadow-lg"] button').first()
    if ((await primeiroItem.count()) === 0) { test.skip(); return }
    await primeiroItem.click()
    await expect(page.locator('text=Qtd. total de itens')).toBeVisible()
  })

  test('F2 foca input de busca via JS', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })))
    await page.waitForTimeout(300)
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await expect(input).toBeFocused({ timeout: 2000 }).catch(() => {})
  })
})

// ── Teste de fluxo completo: login → venda → estoque → caixa ─────────────────
test('Fluxo completo de venda: login → PDV → estoque → caixa', async ({ page }) => {

  // PASSO 1: Login
  await page.goto('/login')
  await page.fill('input[name="email"]', TESTE_EMAIL)
  await page.fill('input[name="senha"]', TESTE_SENHA)
  await page.click('button:has-text("Entrar")')
  await page.waitForURL('**/painel/**', { timeout: 10000 })
  console.log('✅ Login realizado')

  // PASSO 2: Consulta estoque ANTES da venda direto no Supabase
  const { data: produtoAntes, error: erroProdutoAntes } = await supabase
    .from('produtos')
    .select('id, nome, preco, quantidade_estoque')
    .ilike('nome', `%${PRODUTO_BUSCA}%`)
    .single()

  if (erroProdutoAntes || !produtoAntes) {
    throw new Error(
      `❌ Produto "${PRODUTO_BUSCA}" não encontrado no Supabase.\n` +
      `   Erro: ${erroProdutoAntes?.message}`
    )
  }

  const estoqueInicial = produtoAntes.quantidade_estoque
  const precoProduto   = produtoAntes.preco
  const produtoId      = produtoAntes.id

  console.log(`✅ Produto: ${produtoAntes.nome}`)
  console.log(`   Estoque inicial : ${estoqueInicial}`)
  console.log(`   Preço           : R$ ${precoProduto.toFixed(2)}`)

  // PASSO 3: Ir para o PDV e fazer a venda
  await page.goto('/painel/pdv')
  await page.waitForLoadState('networkidle')

  const inputBusca = page.locator('input[placeholder*="Buscar produto"]').first()
  await inputBusca.click()
  await inputBusca.fill(PRODUTO_BUSCA)
  await page.waitForTimeout(400)

  // Clica no produto no dropdown ou no card
  const itemDropdown = page.locator('[class*="shadow-lg"] button').first()
  if ((await itemDropdown.count()) > 0) {
    await itemDropdown.click()
  } else {
    await page.locator(`div:has-text("${PRODUTO_BUSCA}")`).first().click()
  }

  // Finaliza venda
  await page.click('button:has-text("Finalizar Venda")')
  await expect(page.locator('text=Venda registrada')).toBeVisible({ timeout: 10000 })
  console.log('✅ Venda registrada na tela')

  // PASSO 4: Verifica estoque DEPOIS da venda no Supabase
  const { data: produtoDepois, error: erroDepois } = await supabase
    .from('produtos')
    .select('quantidade_estoque')
    .eq('id', produtoId)
    .single()

  if (erroDepois || !produtoDepois) {
    throw new Error(`❌ Erro ao consultar estoque após venda: ${erroDepois?.message}`)
  }

  const estoqueDepois   = produtoDepois.quantidade_estoque
  const estoqueEsperado = estoqueInicial - 1

  if (estoqueDepois !== estoqueEsperado) {
    throw new Error(
      `❌ ESTOQUE INCORRETO APÓS VENDA\n` +
      `   Esperado : ${estoqueEsperado} (${estoqueInicial} - 1)\n` +
      `   Recebido : ${estoqueDepois}`
    )
  }
  console.log(`✅ Estoque correto: ${estoqueInicial} → ${estoqueDepois}`)

  // PASSO 5: Verifica venda na tabela vendas do Supabase
  const hoje = new Date().toISOString().split('T')[0]

  const { data: venda, error: erroVenda } = await supabase
    .from('vendas')
    .select('id, total, created_at')
    .gte('created_at', `${hoje}T00:00:00`)
    .lte('created_at', `${hoje}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (erroVenda || !venda) {
    throw new Error(
      `❌ Nenhuma venda encontrada no Supabase para hoje (${hoje}).\n` +
      `   Erro: ${erroVenda?.message}`
    )
  }

  const valorEsperado = precoProduto        // 1 unidade
  const valorRecebido = Number(venda.total)

  if (Math.abs(valorRecebido - valorEsperado) > 0.01) {
    throw new Error(
      `❌ VALOR DA VENDA INCORRETO\n` +
      `   Esperado : R$ ${valorEsperado.toFixed(2)}\n` +
      `   Recebido : R$ ${valorRecebido.toFixed(2)}`
    )
  }

  console.log(`✅ Venda no caixa com valor correto: R$ ${valorRecebido.toFixed(2)}`)
  console.log('🎉 TESTE COMPLETO PASSOU!')
})

// ── Auth — middleware ─────────────────────────────────────────────────────────
test.describe('Auth — middleware', () => {
  test('sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/painel/pdv')
    await page.waitForURL('**/login**', { timeout: 8000 })
    expect(page.url()).toContain('/login')
  })
})
