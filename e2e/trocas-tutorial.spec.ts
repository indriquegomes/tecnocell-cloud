import { test, expect } from '@playwright/test'
import { login } from './helpers'

// O tutorial da troca mora na propria tela (app/painel/trocas/Tutorial.tsx) e e o
// texto oficial: se ele sumir, quem atende perde a explicacao e quem confere
// depois volta a inventar regra. Este teste so garante que ele existe e abre.
test('trocas: tutorial na tela abre', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')

  const painel = page.locator('details', { hasText: 'Como funciona a troca com fornecedor' })
  await expect(painel).toBeVisible()
  await painel.locator('summary').click()

  // sem acento de proposito: o texto de tela pode mudar, o nome dos botoes nao
  await expect(painel.getByText(/Chegou do fornecedor/).first()).toBeVisible()
  await expect(painel.getByText(/O caminho da pe/).first()).toBeVisible()
})
