import { Page } from '@playwright/test'

const EMAIL = 'indrique@hotmail.com'
const PASSWORD = process.env.TEST_PASSWORD ?? '21042008Fenix@#'

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/painel**', { timeout: 20000 })
}
