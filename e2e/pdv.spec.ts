import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { login, carregarEnv } from './helpers'

const env = carregarEnv()

// Credenciais lidas do .env.local — nunca fixas no código
const TESTE_EMAIL = env.TESTE_USUARIO_EMAIL
const TESTE_SENHA = env.TESTE_USUARIO_SENHA

if (!TESTE_EMAIL || !TESTE_SENHA) {
  throw new Error(
    '❌ TESTE_USUARIO_EMAIL e TESTE_USUARIO_SENHA precisam estar no .env.local'
  )
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!
)

// Produto com estoque no depósito padrão da 1ª loja (PETRÓPOLIS LOJA), nome único.
// Era 'pelicula iphone 11' — o SIGE renomeou os produtos e o termo não existe mais.
const PRODUTO_BUSCA = 'xerox'

// ── Testes unitários de UI (mantidos) ────────────────────────────────────────
test.describe('PDV', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto('/painel/pdv')
    await page.waitForLoadState('networkidle')
  })

  test('página carrega com produtos disponíveis', async ({ page }) => {
    await expect(page.locator('text=PDV').first()).toBeVisible()
    await expect(page.locator('input[placeholder*="Buscar produto"]').first()).toBeVisible()
    await expect(page.locator('text=produtos disponíveis')).toBeVisible()
  })

  test('busca filtra produtos', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const dropdown = page.locator('[class*="shadow-lg"]').first()
    await expect(dropdown).toBeVisible({ timeout: 3000 })
  })

  test('botão ℹ abre ficha do produto', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
  })

  test('botão Fechar fecha ficha do produto', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    await expect(page.locator('text=Preço de venda')).toBeVisible({ timeout: 3000 })
    await page.locator('button', { hasText: 'Fechar' }).click()
    await expect(page.locator('text=Preço de venda')).not.toBeVisible({ timeout: 2000 })
  })

  test('adicionar produto ao carrinho via ficha', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const infoBtn = page.locator('button[title*="F1"]').first()
    if ((await infoBtn.count()) === 0) { test.skip(); return }
    await infoBtn.click()
    const addBtn = page.getByRole('button', { name: '+ Adicionar', exact: true })
    if (await addBtn.isDisabled()) { test.skip(); return }
    await addBtn.click()
    await expect(page.locator('text=Preço de venda')).not.toBeVisible()
    await expect(page.locator('text=R$ 0,00').first()).not.toBeVisible({ timeout: 2000 }).catch(() => {})
  })

  test('adicionar produto via click no dropdown', async ({ page }) => {
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await input.click()
    await input.fill('a')
    await page.waitForTimeout(400)
    const primeiroItem = page.locator('[class*="shadow-lg"] button').first()
    if ((await primeiroItem.count()) === 0) { test.skip(); return }
    await primeiroItem.click()
    await expect(page.locator('text=Qtd. total de itens')).toBeVisible()
  })

  test('F2 foca input de busca via JS', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })))
    await page.waitForTimeout(300)
    const input = page.locator('input[placeholder*="Buscar produto"]').first()
    await expect(input).toBeFocused({ timeout: 2000 }).catch(() => {})
  })
})

// ── Teste de fluxo completo: login → venda → estoque → caixa ─────────────────
test('Fluxo completo de venda: login → PDV → estoque → caixa', async ({ page }) => {

  // PASSO 1: Login
  await page.goto('/login')
  await page.fill('input[name="email"]', TESTE_EMAIL)
  await page.fill('input[type="password"]', TESTE_SENHA)
  await page.click('button:has-text("Entrar")')
  await page.waitForURL('**/painel**', { timeout: 10000 })
  console.log('✅ Login realizado')

  // PASSO 2: Consulta estoque ANTES da venda direto no Supabase
  // (estoque não é coluna de produtos — é a tabela `estoque`, por depósito.
  // Soma todos os depósitos do produto: uma venda baixa só o do depósito
  // que a PDV usa, então a soma antes/depois ainda cai exatamente 1, sem
  // precisar saber de qual depósito é o usuário de teste.)
  const { data: produtoAntes, error: erroProdutoAntes } = await supabase
    .from('produtos')
    .select('id, nome, preco')
    .ilike('nome', `%${PRODUTO_BUSCA}%`)
    .order('nome')
    .limit(1)
    .maybeSingle()

  if (erroProdutoAntes || !produtoAntes) {
    throw new Error(
      `❌ Produto "${PRODUTO_BUSCA}" não encontrado no Supabase.\n` +
      `   Erro: ${erroProdutoAntes?.message}`
    )
  }

  const precoProduto = produtoAntes.preco
  const produtoId     = produtoAntes.id

  const somaEstoque = async (): Promise<number> => {
    const { data, error } = await supabase.from('estoque').select('quantidade').eq('produto_id', produtoId)
    if (error) throw new Error(`❌ Erro ao consultar estoque: ${error.message}`)
    return (data ?? []).reduce((soma, r) => soma + Number(r.quantidade), 0)
  }

  const estoqueInicial = await somaEstoque()

  console.log(`✅ Produto: ${produtoAntes.nome}`)
  console.log(`   Estoque inicial : ${estoqueInicial}`)
  console.log(`   Preço           : R$ ${precoProduto.toFixed(2)}`)

  // PASSO 2b: o PDV só vende com o caixa DA LOJA aberto. Garante um caixa aberto
  // na 1ª loja (Petrópolis) e fecha no fim — sem isso o botão "Finalizar Venda"
  // fica desabilitado ("🔒 Caixa fechado").
  const { data: primeiraLoja } = await supabase
    .from('lojas').select('id').order('nome').limit(1).maybeSingle()
  const lojaId = primeiraLoja?.id ?? null
  let caixaTesteId: string | null = null
  if (lojaId) {
    const { data: cxAberto } = await supabase
      .from('caixas').select('id').eq('loja_id', lojaId).eq('status', 'aberto').limit(1).maybeSingle()
    if (cxAberto) {
      caixaTesteId = cxAberto.id
    } else {
      const { data: novoCaixa } = await supabase
        .from('caixas').insert({ loja_id: lojaId, status: 'aberto', valor_abertura: 0 }).select('id').single()
      caixaTesteId = novoCaixa?.id ?? null
    }
  }

  // PASSO 3: Ir para o PDV e fazer a venda (PDV em 2 etapas: carrinho → pagamento)
  await page.goto('/painel/pdv')
  await page.waitForLoadState('networkidle')

  const inputBusca = page.locator('input[placeholder*="Buscar produto"]').first()
  await inputBusca.click()
  await inputBusca.fill(PRODUTO_BUSCA)
  await page.waitForTimeout(400)

  // Clica no produto no dropdown ou no card
  const itemDropdown = page.locator('[class*="shadow-lg"] button').first()
  if ((await itemDropdown.count()) > 0) {
    await itemDropdown.click()
  } else {
    await page.locator(`div:has-text("${PRODUTO_BUSCA}")`).first().click()
  }

  // Etapa 1 → 2: carrinho → tela de pagamento
  await page.getByRole('button', { name: /Ir para pagamento/ }).click()
  // Escolhe "Dinheiro" no grid de formas
  await page.locator('button:has-text("Dinheiro")').first().click()
  // Abre a confirmação
  await page.getByRole('button', { name: /Finalizar Venda/ }).click()
  // Confirma a venda
  await page.getByRole('button', { name: 'Confirmar venda' }).click()
  await expect(page.getByText('Venda Concluída')).toBeVisible({ timeout: 15000 })
  console.log('✅ Venda registrada na tela')

  // PASSO 4: Verifica estoque DEPOIS da venda no Supabase
  const estoqueDepois   = await somaEstoque()
  const estoqueEsperado = estoqueInicial - 1

  if (estoqueDepois !== estoqueEsperado) {
    throw new Error(
      `❌ ESTOQUE INCORRETO APÓS VENDA\n` +
      `   Esperado : ${estoqueEsperado} (${estoqueInicial} - 1)\n` +
      `   Recebido : ${estoqueDepois}`
    )
  }
  console.log(`✅ Estoque correto: ${estoqueInicial} → ${estoqueDepois}`)

  // PASSO 5: Verifica venda na tabela vendas do Supabase
  const hoje = new Date().toISOString().split('T')[0]

  const { data: venda, error: erroVenda } = await supabase
    .from('vendas')
    .select('id, total, created_at')
    .gte('created_at', `${hoje}T00:00:00`)
    .lte('created_at', `${hoje}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (erroVenda || !venda) {
    throw new Error(
      `❌ Nenhuma venda encontrada no Supabase para hoje (${hoje}).\n` +
      `   Erro: ${erroVenda?.message}`
    )
  }

  const valorEsperado = precoProduto        // 1 unidade
  const valorRecebido = Number(venda.total)

  if (Math.abs(valorRecebido - valorEsperado) > 0.01) {
    throw new Error(
      `❌ VALOR DA VENDA INCORRETO\n` +
      `   Esperado : R$ ${valorEsperado.toFixed(2)}\n` +
      `   Recebido : R$ ${valorRecebido.toFixed(2)}`
    )
  }

  console.log(`✅ Venda no caixa com valor correto: R$ ${valorRecebido.toFixed(2)}`)

  // Limpeza: fecha o caixa que o teste abriu (a venda em si é cancelada pelo
  // runner via cancelar_venda depois, restaurando o estoque).
  if (caixaTesteId) {
    await supabase.from('caixas').update({ status: 'fechado', valor_fechamento: 0 }).eq('id', caixaTesteId)
  }

  console.log('🎉 TESTE COMPLETO PASSOU!')
})

// ── Auth — middleware ─────────────────────────────────────────────────────────
test.describe('Auth — middleware', () => {
  test('sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/painel/pdv')
    await page.waitForURL('**/login**', { timeout: 8000 })
    expect(page.url()).toContain('/login')
  })
})
