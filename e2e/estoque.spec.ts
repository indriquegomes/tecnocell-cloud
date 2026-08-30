import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { login, carregarEnv } from './helpers'

const env = carregarEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

// Busca pelo CÓDIGO, não pelo nome — "fone com fio p2 kapbom" bate em 2
// produtos (COM e SEM borrachinha) e o clique pegava o errado (achado rodando
// este mesmo teste, 30/08 — corrigiu estoque real do produto errado depois).
const PRODUTO_CODIGO = '12107' // FONE COM FIO P2 KAPBOM ... (COM BORRACHINHA)

test.describe('Estoque', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('página de estoque carrega com a lista de produtos', async ({ page }) => {
    await page.goto('/painel/estoque')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Estoque').first()).toBeVisible()
  })

  test('movimentação de ENTRADA soma exatamente a quantidade lançada', async ({ page }) => {
    const { data: produto } = await supabase
      .from('produtos').select('id, nome').eq('codigo', PRODUTO_CODIGO).single()
    test.skip(!produto, `produto de teste código "${PRODUTO_CODIGO}" não encontrado — ajuste PRODUTO_CODIGO`)

    const somaEstoque = async () => {
      const { data } = await supabase.from('estoque').select('quantidade').eq('produto_id', produto!.id)
      return (data ?? []).reduce((s, r) => s + Number(r.quantidade), 0)
    }
    const antes = await somaEstoque()

    await page.goto('/painel/estoque/movimentar')
    await page.waitForLoadState('networkidle')
    await page.fill('input[name="produto_busca"]', PRODUTO_CODIGO)
    await page.waitForTimeout(500)
    await page.locator('button', { hasText: PRODUTO_CODIGO }).first().click()
    // trava de segurança: confere que o produto certo foi escolhido ANTES de
    // salvar — sem isso um clique ambíguo mexe no estoque do produto errado
    // sem ninguém perceber até já ter acontecido (foi exatamente o que rolou
    // aqui rodando este teste pela primeira vez, 30/08).
    await expect(page.locator('input[name="produto_id"]')).toHaveValue(produto!.id)
    await page.selectOption('select[name="deposito_id"]', { index: 1 })
    await page.selectOption('select[name="operacao"]', { label: 'Entrada' })
    await page.fill('input[name="quantidade"]', '1')
    await page.fill('textarea[name="observacao"]', '__QA__ e2e estoque — entrada de teste, revertida no afterEach')
    await page.click('button:has-text("Salvar")')
    await page.waitForURL('**/painel/estoque/historico**', { timeout: 10000 })

    const depois = await somaEstoque()
    expect(depois, 'entrada de 1 unidade deveria somar exatamente 1 no total do produto').toBe(antes + 1)

    // reverte: tira a mesma unidade de volta, não deixa estoque real inflado por teste
    const { data: linhas } = await supabase.from('estoque').select('id, quantidade').eq('produto_id', produto!.id).gt('quantidade', 0).limit(1)
    if (linhas?.[0]) {
      await supabase.from('estoque').update({ quantidade: linhas[0].quantidade - 1 }).eq('id', linhas[0].id)
    }
    expect(await somaEstoque()).toBe(antes)
  })
})
