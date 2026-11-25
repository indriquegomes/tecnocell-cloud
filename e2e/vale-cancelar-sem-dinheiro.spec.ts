import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { login } from './helpers'

// QA: cancelar um vale que NÃO tem dinheiro a devolver ("só cancelar (não devo
// nada)") tem que tirar o crédito do saldo do cliente e NÃO criar conta a pagar
// nenhuma. Antes esse caso era impossível: a trava de 22/11 recusava o estorno e o
// vale ficava preso no saldo. A pessoa/crédito __QA__ é criada por
// scripts/qa-vale-cancelar.mjs e apagada no fim.
test.beforeAll(() => {
  execSync('node scripts/qa-vale-cancelar.mjs criar', { stdio: 'inherit' })
})

test.afterAll(() => {
  // QA_SEM_LIMPAR=1 deixa os dados no banco para conferência manual (script ver)
  if (!process.env.QA_SEM_LIMPAR) execSync('node scripts/qa-vale-cancelar.mjs limpar', { stdio: 'inherit' })
})

test('cancelar vale com "só cancelar" não cria conta a pagar', async ({ page }) => {
  await login(page)
  await page.goto('/painel/vales-credito')

  await page.locator('input[placeholder="Buscar cliente..."]').fill('__QA__ VALE CANCELAR')
  await page.getByRole('button', { name: /__QA__ VALE CANCELAR/ }).first().click({ timeout: 15000 })

  const select = page.locator('select[name="origem"]').first()
  await expect(select).toBeVisible({ timeout: 15000 })
  await select.selectOption('CANCELAR')

  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: /^Cancelar$/ }).first().click()

  await expect(page.getByText(/Crédito cancelado\. Nenhuma conta a pagar/)).toBeVisible({ timeout: 20000 })
})
