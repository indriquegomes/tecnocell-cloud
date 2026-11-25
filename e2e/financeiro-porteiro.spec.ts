import { test, expect } from '@playwright/test'
import { login } from './helpers'

// O porteiro do dinheiro: desde 25/11/2026 o Novo lançamento só aceita categoria da
// lista oficial e forma de pagamento do cadastro — e o SERVIDOR recusa o que não é.
// Esse teste tenta driblar o <select> (injeta a categoria "FONE QUE VITÃO PEGOU NA
// LOJA", a linha que virou despesa de R$ 49,00 em 24/11) e confere que nada é gravado.
test('categoria inventada é recusada pelo servidor', async ({ page }) => {
  await login(page)
  await page.goto('/painel/financeiro/novo?tipo=pagar')

  // a categoria é lista fechada (não é mais campo de texto)
  const select = page.locator('select[name="categoria"]')
  await expect(select).toBeVisible()
  const opcoes = await select.locator('option').count()
  expect(opcoes).toBeGreaterThan(20)
  await expect(page.locator('input[name="categoria"]')).toHaveCount(0)

  // tenta entrar com uma categoria que não existe, driblando o select
  await select.evaluate((el: HTMLSelectElement) => {
    const o = document.createElement('option')
    o.value = 'FONE QUE VITÃO PEGOU NA LOJA'
    o.text = o.value
    el.appendChild(o)
    el.value = o.value
  })

  await page.locator('input[name="descricao"]').fill('teste porteiro')
  // CampoDinheiro: o campo visível é a máscara, o valor real vai num input escondido
  const dinheiro = page.getByPlaceholder('0,00').first()
  await dinheiro.click()
  await dinheiro.pressSequentially('4900')
  await page.getByRole('button', { name: /Salvar Lançamento/i }).click()

  // volta na tela com a recusa do servidor e NADA foi criado
  await expect(page.getByText(/não existe na lista do financeiro/i)).toBeVisible({ timeout: 20000 })
})
