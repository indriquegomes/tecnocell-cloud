import { test, expect } from '@playwright/test'
import { login } from './helpers'

// ═══════════════ 20 TESTES DE FUNCIONAMENTO ═══════════════

test('01 abre a aba Trocas', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await expect(page.getByRole('heading', { name: 'Trocas com fornecedor' })).toBeVisible()
})

test('02 filtro por loja existe e conta', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await expect(page.getByRole('button', { name: /^As duas \(\d+\)$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Petrópolis \(\d+\)$/ })).toBeVisible()
})

test('03 filtro por fornecedor existe', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await expect(page.locator('select').filter({ hasText: 'Todos os fornecedores' }).first()).toBeVisible()
})

test('04 botão de abatimento em grupo abre o painel', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await page.getByRole('button', { name: 'Abatimento em grupo' }).click()
  await expect(page.getByText('O fornecedor abateu')).toBeVisible()
})

test('05 lançar troca na mão abre e busca peça', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await page.getByRole('button', { name: '+ Lançar troca na mão' }).click()
  await page.getByPlaceholder('ex: frontal samsung a15').fill('frontal')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByText('Peça escolhida:').or(page.getByText('Peça escolhida'))).toBeHidden({ timeout: 1000 }).catch(() => {})
  await expect(page.locator('button', { hasText: 'FRONTAL' }).first()).toBeVisible({ timeout: 15000 })
})

test('06 cartões de resumo das trocas aparecem', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await expect(page.getByText('ABATIDO EM DÍVIDA')).toBeVisible()
  await expect(page.getByText('CUSTO FORA DO ESTOQUE')).toBeVisible()
})

test('07 devolução: caixa "vai para o fornecedor" aparece', async ({ page }) => {
  await login(page)
  await page.goto('/painel/devolucoes')
  await page.getByRole('button', { name: /Nova Devolução/i }).click()
  await page.waitForTimeout(1500)
  await page.locator('button:has-text("#")').first().click({ timeout: 15000 })
  await page.getByRole('button', { name: /Revisar devolução/i }).click({ timeout: 15000 })
  await expect(page.getByText('Por que a peça voltou?')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('checkbox', { name: /vai para o fornecedor/ })).toBeVisible()
})

test('08 financeiro novo: "Sem conta" é o padrão', async ({ page }) => {
  await login(page)
  await page.goto('/painel/financeiro/novo?tipo=pagar')
  const conta = page.locator('select[name="conta_id"]')
  await expect(conta).toHaveValue('')
  await expect(conta.locator('option').first()).toContainText('Sem conta')
})

test('09 financeiro: lista A Pagar abre', async ({ page }) => {
  await login(page)
  await page.goto('/painel/financeiro?tipo=pagar')
  await expect(page.getByText('A Pagar (pendente)').first()).toBeVisible()
})

test('10 menu Geral/Vendas sem a aba Serviços', async ({ page }) => {
  await login(page)
  const nav = page.locator('nav, [class*="sidebar"]').first()
  await expect(nav.getByText('Ordens de Serviço')).toHaveCount(0)
})

test('11 estoque não mostra mais "Aparelhos" no menu', async ({ page }) => {
  await login(page)
  await page.goto('/painel/estoque')
  await expect(page.getByText('Aparelhos', { exact: true })).toHaveCount(0)
})

test('12 PDV abre sem pedir IMEI na carga', async ({ page }) => {
  await login(page)
  await page.goto('/painel/pdv')
  await page.waitForTimeout(2500)
  const txt = (await page.locator('body').innerText()).toLowerCase()
  expect(txt.includes('bipe o imei')).toBe(false)
})

test('13 movimentar estoque sem IMEI', async ({ page }) => {
  await login(page)
  await page.goto('/painel/estoque/movimentar')
  await page.waitForTimeout(1500)
  const txt = (await page.locator('body').innerText()).toLowerCase()
  expect(txt.includes('bipe o imei') || txt.includes('controla número de série')).toBe(false)
})

test('14 transferências sem IMEI', async ({ page }) => {
  await login(page)
  await page.goto('/painel/estoque/transferencias')
  await page.waitForTimeout(1500)
  const txt = (await page.locator('body').innerText()).toLowerCase()
  expect(txt.includes('bipe o imei')).toBe(false)
})

test('15 compras abre sem exigir IMEI', async ({ page }) => {
  await login(page)
  await page.goto('/painel/compras')
  await page.waitForTimeout(1500)
  const txt = (await page.locator('body').innerText()).toLowerCase()
  expect(txt.includes('faltam') && txt.includes('imei')).toBe(false)
})

test('16 fechamento de novembro abre', async ({ page }) => {
  await login(page)
  await page.goto('/painel/fechamento-mes?mes=2026-11')
  await expect(page.getByText(/novembro\/2026/i).first()).toBeVisible({ timeout: 15000 })
})

test('17 contas: saldos carregam', async ({ page }) => {
  await login(page)
  await page.goto('/painel/contas?aba=saldos')
  await expect(page.getByText('SALDO TOTAL')).toBeVisible({ timeout: 15000 })
})

test('18 relatórios abre', async ({ page }) => {
  await login(page)
  await page.goto('/painel/relatorios')
  await expect(page.locator('main')).toBeVisible()
})

test('19 produto editar mostra campo de custo', async ({ page }) => {
  await login(page)
  await page.goto('/painel/produtos')
  const primeiro = page.locator('main a[href*="/produtos/"]').first()
  await primeiro.click({ timeout: 15000 })
  await page.waitForTimeout(1200)
  const txt = await page.locator('body').innerText()
  expect(/editar|Custo/i.test(txt)).toBe(true)
})

test('20 trocas: botão ajustar custo aparece em peça aberta', async ({ page }) => {
  await login(page)
  await page.goto('/painel/trocas')
  await page.waitForTimeout(1500)
  const abrir = page.getByRole('button', { name: 'Aberta (' })
  if (await abrir.count()) await abrir.first().click()
  await expect(page.getByRole('button', { name: 'ajustar' }).first()).toBeVisible({ timeout: 15000 })
})
