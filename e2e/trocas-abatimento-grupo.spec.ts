import { test, expect } from '@playwright/test'
import { login } from './helpers'

test('trocas: abatimento em grupo', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await page.waitForTimeout(2000)
  const btn = page.getByRole('button', { name: 'Abatimento em grupo' })
  await expect(btn).toBeVisible()
  await btn.click()
  await expect(page.getByText('Abatimento em grupo').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Abater \d+ peça/ })).toBeVisible()
  const texto = await page.locator('main').innerText()
  console.log(texto.split('\n').filter((l) => /abatimento|peças marcadas|custo|dívida/i.test(l)).slice(0, 10).join('\n'))
})
