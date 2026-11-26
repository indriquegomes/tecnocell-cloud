import { test, expect } from '@playwright/test'
import { login } from './helpers'

// Conferência de novembro: lê os saldos que a tela Contas mostra (a verdade do app)
// para o dono comparar com o extrato do banco. Não altera nada.
test('Contas mostra as contas ativas do mês (sem as arquivadas)', async ({ page }) => {
  await login(page)
  await page.goto('/painel/contas')

  for (const nome of ['Caixa Petrópolis', 'Caixa Teresópolis', 'Dinheiro vivo Petrópolis', 'Dinheiro vivo Teresópolis', 'Caixinha PagBank', 'PagBank Petrópolis']) {
    await expect(page.getByText(nome, { exact: false }).first()).toBeVisible({ timeout: 20000 })
  }
  // as antigas ficam arquivadas: não podem aparecer como conta do mês
  await expect(page.getByText('ARQUIVADA — PIX', { exact: false })).toHaveCount(0)

  const corpo = await page.locator('main, body').first().innerText()
  const linhas = corpo.split('\n').filter((l) => /Petrópolis|Teresópolis|Caixinha/.test(l)).slice(0, 30)
  console.log('--- TELA CONTAS ---\n' + linhas.join('\n'))
})
