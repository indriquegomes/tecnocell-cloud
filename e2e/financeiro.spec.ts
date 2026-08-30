import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { login, carregarEnv } from './helpers'

const env = carregarEnv()
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!)

// Limpa qualquer lançamento de teste desta suíte, mesmo se um teste anterior
// quebrou no meio e não chegou a limpar sozinho.
test.afterAll(async () => {
  await supabase.from('lancamentos').delete().ilike('descricao', '__QA__ e2e financeiro%')
})

test.describe('Financeiro', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('conta A PAGAR marcada como paga NÃO cria movimento no caixa', async ({ page }) => {
    // Regressão do bug de 28/08: marcarPago tratava toda baixa como dinheiro
    // ENTRANDO, mesmo pra contas a pagar (dinheiro SAINDO) — inflava a gaveta.
    const descricao = `__QA__ e2e financeiro pagar ${Date.now()}`

    await page.goto('/painel/financeiro/novo')
    await page.waitForLoadState('networkidle')
    await page.fill('input[placeholder*="Ex: Compra"]', descricao)
    await page.selectOption('select[name="tipo"]', { label: 'A Pagar' })
    await page.locator('input[placeholder="0,00"]').fill('37,00')
    await page.selectOption('select[name="conta_id"]', { index: 1 })
    await page.click('button:has-text("Salvar Lançamento")')
    await page.waitForURL((url) => url.pathname === '/painel/financeiro', { timeout: 10000 })

    const { data: lanc } = await supabase.from('lancamentos').select('id').eq('descricao', descricao).single()
    expect(lanc).toBeTruthy()

    const antesIds = new Set((await supabase.from('movimentos_caixa').select('id')).data?.map((m) => m.id) ?? [])

    await page.goto(`/painel/financeiro?busca=${encodeURIComponent(descricao)}`)
    await page.waitForLoadState('networkidle')
    // Esperar navegação por URL é frágil aqui (marcarPago as vezes volta pra
    // mesma pathname com busca ainda na query, o predicado nunca "vira" de
    // jeito detectável). Mais robusto: clicar e conferir DIRETO no banco até
    // o status mudar, com um tempo limite — é o dado real que importa, não
    // a URL do navegador.
    await page.click('button:has-text("Pago")')
    await expect.poll(async () => {
      const { data } = await supabase.from('lancamentos').select('status').eq('id', lanc!.id).single()
      return data?.status
    }, { timeout: 10000, message: 'lançamento deveria virar "pago" depois de clicar em Pago' }).toBe('pago')

    const { data: lancDepois } = await supabase.from('lancamentos').select('status, valor_pago').eq('id', lanc!.id).single()
    expect(lancDepois?.status).toBe('pago')
    expect(Number(lancDepois?.valor_pago)).toBeCloseTo(37, 2)

    const depoisIds = (await supabase.from('movimentos_caixa').select('id')).data ?? []
    const novos = depoisIds.filter((m) => !antesIds.has(m.id))
    expect(novos.length, 'marcar uma conta A PAGAR como paga não pode criar movimento_caixa').toBe(0)
  })

  // Lançamento avulso (sem venda_id) não tem loja associada — lib/caixa.ts
  // (registrarNoCaixa/lojaDoLancamento) por design não gera movimento_caixa
  // pra isso ("fiado avulso não tem loja, não sei de qual gaveta saiu"). Marcar
  // como pago tem que continuar funcionando (status vira pago) sem quebrar
  // tentando achar uma loja que não existe.
  test('conta A RECEBER avulsa (sem venda) marcada como paga não quebra e não inventa loja', async ({ page }) => {
    const descricao = `__QA__ e2e financeiro receber ${Date.now()}`

    await page.goto('/painel/financeiro/novo')
    await page.waitForLoadState('networkidle')
    await page.fill('input[placeholder*="Ex: Compra"]', descricao)
    await page.selectOption('select[name="tipo"]', { label: 'A Receber' })
    await page.locator('input[placeholder="0,00"]').fill('22,00')
    await page.selectOption('select[name="conta_id"]', { index: 1 })
    await page.click('button:has-text("Salvar Lançamento")')
    await page.waitForURL((url) => url.pathname === '/painel/financeiro', { timeout: 10000 })

    const { data: lanc } = await supabase.from('lancamentos').select('id').eq('descricao', descricao).single()

    await page.goto(`/painel/financeiro?busca=${encodeURIComponent(descricao)}`)
    await page.waitForLoadState('networkidle')
    await page.click('button:has-text("Pago")')
    await expect.poll(async () => {
      const { data } = await supabase.from('lancamentos').select('status').eq('id', lanc!.id).single()
      return data?.status
    }, { timeout: 10000, message: 'lançamento deveria virar "pago" depois de clicar em Pago' }).toBe('pago')

    const { data: lancDepois } = await supabase.from('lancamentos').select('status, valor_pago').eq('id', lanc!.id).single()
    expect(lancDepois?.status).toBe('pago')
    expect(Number(lancDepois?.valor_pago)).toBeCloseTo(22, 2)

    await supabase.from('lancamentos').delete().eq('id', lanc!.id)
  })

  test('lista de Financeiro carrega com os cards de A Receber / A Pagar', async ({ page }) => {
    await page.goto('/painel/financeiro')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=A Receber (pendente)')).toBeVisible()
    await expect(page.locator('text=A Pagar (pendente)')).toBeVisible()
  })
})
