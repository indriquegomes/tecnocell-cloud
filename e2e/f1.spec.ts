import { test, expect } from '@playwright/test'
import { login } from './helpers'

const dispararF1 = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }))
  })

test.describe('F1 — Consultar Produtos', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/painel/pdv')
    await page.waitForLoadState('networkidle')
  })

  test('F1 (tecla real) abre o modal Consultar Produtos', async ({ page }) => {
    await page.keyboard.press('F1')
    await expect(page.locator('text=Consultar Produtos')).toBeVisible({ timeout: 3000 })
  })

  test('F1 abre o modal com PDV vazio e busca focada', async ({ page }) => {
    await dispararF1(page)
    await expect(page.locator('text=Consultar Produtos')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('input[placeholder="Buscar por nome ou código..."]')).toBeFocused({ timeout: 2000 })
  })

  test('busca dentro do modal seleciona produto e mostra ficha', async ({ page }) => {
    await dispararF1(page)
    await expect(page.locator('text=Consultar Produtos')).toBeVisible()
    const buscaModal = page.locator('input[placeholder="Buscar por nome ou código..."]')
    await buscaModal.fill('a')
    await page.waitForTimeout(400)

    const primeiro = page.locator('.absolute button').first()
    if ((await primeiro.count()) === 0) { test.skip(); return }
    await primeiro.click()
    // ficha rica aparece
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('text=Saldo por depósito')).toBeVisible()
  })

  test('F1 com busca ativa no PDV pré-seleciona o produto', async ({ page }) => {
    const buscaPDV = page.locator('input[placeholder*="Buscar produto"]').first()
    await buscaPDV.click()
    await buscaPDV.fill('a')
    await page.waitForTimeout(400)
    if ((await page.locator('[class*="shadow-lg"] button').count()) === 0) { test.skip(); return }

    await dispararF1(page)
    await expect(page.locator('text=Consultar Produtos')).toBeVisible({ timeout: 3000 })
    // já vem com ficha (produto pré-selecionado)
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('Limpar reseta a seleção', async ({ page }) => {
    await dispararF1(page)
    const buscaModal = page.locator('input[placeholder="Buscar por nome ou código..."]')
    await buscaModal.fill('a')
    await page.waitForTimeout(400)
    const primeiro = page.locator('.absolute button').first()
    if ((await primeiro.count()) === 0) { test.skip(); return }
    await primeiro.click()
    await expect(page.locator('text=Preço de venda')).toBeVisible()

    await page.getByRole('button', { name: 'Limpar' }).click()
    await expect(page.locator('text=Preço de venda')).not.toBeVisible({ timeout: 2000 })
  })

  test('Adicionar joga o produto no carrinho e fecha', async ({ page }) => {
    await dispararF1(page)
    const buscaModal = page.locator('input[placeholder="Buscar por nome ou código..."]')
    await buscaModal.fill('a')
    await page.waitForTimeout(400)
    const primeiro = page.locator('.absolute button').first()
    if ((await primeiro.count()) === 0) { test.skip(); return }
    await primeiro.click()

    const addBtn = page.getByRole('button', { name: '+ Adicionar', exact: true })
    if (await addBtn.isDisabled()) { test.skip(); return } // sem estoque no depósito atual
    await addBtn.click()
    await expect(page.locator('text=Consultar Produtos')).not.toBeVisible({ timeout: 2000 })
  })

  test('Esc fecha o modal', async ({ page }) => {
    await dispararF1(page)
    await expect(page.locator('text=Consultar Produtos')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('text=Consultar Produtos')).not.toBeVisible({ timeout: 2000 })
  })
})
