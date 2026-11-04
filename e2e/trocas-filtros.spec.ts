import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('trocas: filtros e lançar na mão', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await expect(page.getByRole('heading', { name: 'Trocas com fornecedor' })).toBeVisible()

  // filtro por loja
  await expect(page.getByRole('button', { name: /^As duas \(\d+\)$/ })).toBeVisible()
  const btnPet = page.getByRole('button', { name: /^Petrópolis \(\d+\)$/ })
  await expect(btnPet).toBeVisible()
  await btnPet.click()
  await page.waitForTimeout(400)

  // filtro por fornecedor
  const forn = page.locator('select').filter({ hasText: 'Todos os fornecedores' }).first()
  await expect(forn).toBeVisible()

  // lançar na mão: buscar peça de verdade
  await page.getByRole('button', { name: '+ Lançar troca na mão' }).click()
  await page.getByPlaceholder('ex: frontal samsung a15').fill('frontal samsung a15')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.locator('button', { hasText: 'FRONTAL' }).first()).toBeVisible({ timeout: 15000 })
  await page.locator('button', { hasText: 'FRONTAL' }).first().click()
  await expect(page.getByText('Peça escolhida:')).toBeVisible()

  await page.screenshot({ path: 'test-results/trocas-filtros.png', fullPage: true })
})
