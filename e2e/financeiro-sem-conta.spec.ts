import { test, expect } from '@playwright/test'
import { login } from './helpers'

// QA: o cadastro de lançamento aceita "Sem conta" (PIX do cliente direto ao
// fornecedor). Só confere a tela — não salva nada.
test('lançamento aceita sem conta', async ({ page }) => {
  await login(page)
  await page.goto('/painel/financeiro/novo?tipo=pagar')
  const conta = page.locator('select[name="conta_id"]')
  await expect(conta).toBeVisible()
  await expect(conta).toHaveValue('')
  const semConta = await conta.locator('option').first().textContent()
  expect(semConta).toContain('Sem conta')
  // o campo não pode ser obrigatório (senão o navegador barra o envio)
  await expect(conta).not.toHaveAttribute('required', /.*/)
})
