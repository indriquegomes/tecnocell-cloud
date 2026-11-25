import { test, expect } from '@playwright/test'
import { login } from './helpers'

// QA: a devolução do tipo "Fora do app (WhatsApp)" (estorno pedido pelo grupo)
// tem que registrar a saída como PAGA — não pode sobrar conta pendente no
// Financeiro nem mexer na gaveta. A venda __QA__ é criada por
// scripts/qa-fora-do-app.mjs criar (número 999990) e apagada depois.
test('devolução "Fora do app (WhatsApp)" registra a saída como PAGA', async ({ page }) => {
  await login(page)
  await page.goto('/painel/devolucoes')
  await page.getByRole('button', { name: /Nova Devolução/i }).click()

  const campoBusca = page.locator('input[placeholder*="frontal"]')
  await campoBusca.fill('999990')
  // a busca é com debounce: espera o resultado da venda aparecer
  await page.locator('button:has-text("#999990")').first().click({ timeout: 20000 })

  // o item já chega selecionado (quantidade cheia) — só confere o valor a devolver
  await expect(page.getByText('__QA__ DEVOLUCAO FORA DO APP').first()).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /Revisar devolução/i }).click()

  await page.getByRole('button', { name: /Defeito alegado/ }).click()
  const chip = page.getByRole('button', { name: /Fora do app \(WhatsApp\)/ })
  await expect(chip).toBeVisible({ timeout: 15000 })
  await chip.click()

  // a ajuda tem que explicar que o dinheiro já saiu fora do app
  await expect(page.getByText(/Pago fora do app \(WhatsApp\)/)).toBeVisible()

  await page.getByText('Confirmei a forma de reembolso acima.').click()
  await page.screenshot({ path: 'test-results/devolucao-fora-do-app.png', fullPage: true })

  await page.getByRole('button', { name: /Confirmar —/ }).click()
  // sucesso: o modal fecha e a devolução aparece na lista
  await expect(page.getByText('__QA__ DEVOLUCAO FORA DO APP').first()).toBeVisible({ timeout: 25000 })
})
