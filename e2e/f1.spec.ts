import { test, expect } from '@playwright/test'
import { login } from './helpers'

test.describe('F1 — ficha do produto', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/painel/pdv')
    await page.waitForLoadState('networkidle')
  })

  test('F1 (keydown real) abre ficha quando há busca', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)

    const temItens = (await page.locator('[class*="shadow-lg"] button').count()) > 0
    if (!temItens) { test.skip(); return }

    // Dispara F1 real via teclado do Playwright
    await page.keyboard.press('F1')
    await page.waitForTimeout(300)
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('F1 via dispatchEvent na window abre ficha (testa lógica React)', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)

    const temItens = (await page.locator('[class*="shadow-lg"] button').count()) > 0
    if (!temItens) { test.skip(); return }

    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(300)
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('F1 abre ficha do 1º produto com PDV vazio (sem busca, sem carrinho)', async ({ page }) => {
    // PDV recém-aberto: nada na busca, nada no carrinho
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(300)
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('F1 abre ficha do último item do carrinho (sem busca)', async ({ page }) => {
    // adiciona um item ao carrinho via dropdown
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const primeiro = page.locator('[class*="shadow-lg"] button').first()
    if ((await primeiro.count()) === 0) { test.skip(); return }
    await primeiro.click()
    await page.waitForTimeout(300)

    // limpa busca
    await input.fill('')
    await page.waitForTimeout(200)

    // F1 sem busca → deve abrir ficha do item do carrinho
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(300)
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })
})
