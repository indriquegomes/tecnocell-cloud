import { test, expect } from '@playwright/test'
import { login } from './helpers'

// QA: a devolução mostra a marcação "esta peça vai para o fornecedor" e marcar
// troca o status do item para "Troca · Saída" sozinho. NÃO confirma devolução —
// só abre o modal, escolhe uma venda e confere a tela.
test('devolução mostra a opção "vai pro fornecedor"', async ({ page }) => {
  await login(page)
  await page.goto('/painel/devolucoes')
  await page.getByRole('button', { name: /Nova Devolução/i }).click()
  await page.waitForTimeout(1500)
  await page.locator('button:has-text("#")').first().click({ timeout: 15000 })

  // etapa 2: o item começa como "OK · Venda" (volta pro estoque)
  const itemSelect = page.locator('select').filter({ hasText: 'Troca · Saída' }).first()
  await expect(itemSelect).toHaveValue('ok', { timeout: 15000 })

  await page.getByRole('button', { name: /Revisar devolução/i }).click({ timeout: 15000 })
  await expect(page.getByText('Por que a peça voltou?')).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: /Defeito alegado/ }).click()
  const caixa = page.getByRole('checkbox', { name: /vai para o fornecedor/ })
  await expect(caixa).toBeVisible()
  await caixa.check()
  await page.screenshot({ path: 'test-results/devolucao-fornecedor.png', fullPage: true })

  // voltando à etapa 2: o item agora sai do estoque
  await page.getByRole('button', { name: /Voltar/i }).click()
  await expect(itemSelect).toHaveValue('troca', { timeout: 15000 })
})
