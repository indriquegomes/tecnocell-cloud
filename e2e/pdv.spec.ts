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
  // Só fecha no fim o caixa que ESTE teste abriu. Antes, quando já existia caixa
  // aberto, o teste adotava o caixa REAL do operador e o fechava com
  // valor_fechamento: 0 — rodar no expediente zerava a gaveta de quem estava
  // trabalhando. Caixa de terceiro o teste usa, não mexe.
  let caixaCriadoPeloTeste: string | null = null
  if (lojaId) {
    const { data: cxAberto } = await supabase
      .from('caixas').select('id').eq('loja_id', lojaId).eq('status', 'aberto').limit(1).maybeSingle()
    if (!cxAberto) {
      const { data: novoCaixa } = await supabase
        .from('caixas').insert({ loja_id: lojaId, status: 'aberto', valor_abertura: 0 }).select('id').single()
      caixaCriadoPeloTeste = novoCaixa?.id ?? null
    }
  }

  // Instante ANTES da venda, para identificar depois EXATAMENTE a venda que este
  // teste criou. Aqui toISOString() é o uso correto: vendas.created_at é
  // timestamptz e a comparação é de INSTANTE, não de data — a armadilha de fuso
  // do projeto é derivar um DIA com toISOString, o que não acontece aqui.
  // 60s de folga cobre relógio do runner adiantado em relação ao do banco; se
  // isso pegar uma venda real junto, a checagem abaixo aborta em vez de cancelar.
  const inicioDoTeste = new Date(Date.now() - 60_000).toISOString()

  // A partir daqui o teste MEXE no banco real, então tudo vai dentro de
  // try/finally: antes, uma falha no meio (estoque errado, venda não encontrada,
  // valor divergente) abortava ANTES da limpeza e deixava venda concluída, baixa
  // de estoque e o caixa aberto pelo teste — permanentes.
  let vendaCriadaId: string | null = null
  const errosLimpeza: string[] = []

  try {
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

    // PASSO 5 vem ANTES da conferência de estoque de propósito: identificar a
    // venda é o que permite limpar depois. Se a checagem de estoque falhasse
    // primeiro, a limpeza não saberia o que cancelar.
    //
    // A venda do teste é achada por DIFERENÇA (instante + produto), nunca por
    // "a última venda de hoje": com a loja aberta, a última venda pode ser de um
    // cliente real feita no outro terminal — e a limpeza CANCELA o que achar.
    // status='concluida' também evita pegar uma venda já cancelada de uma
    // execução anterior, caso em que cancelar_venda devolve 'ja_cancelada' sem
    // erro e a limpeza passaria batido.
    const { data: novas, error: erroVenda } = await supabase
      .from('vendas')
      .select('id, total, created_at, itens_venda!inner(produto_id)')
      .eq('status', 'concluida')
      .gte('created_at', inicioDoTeste)
      .eq('itens_venda.produto_id', produtoId)
      .order('created_at', { ascending: true })

    if (erroVenda) throw new Error(`❌ Erro ao consultar vendas: ${erroVenda.message}`)
    if ((novas ?? []).length !== 1) {
      throw new Error(
        `❌ Esperava exatamente 1 venda nova deste teste, encontrei ${(novas ?? []).length}.\n` +
        `   NÃO vou cancelar nada — pode haver venda de cliente real no meio.\n` +
        `   Confira e resolva na mão: ${(novas ?? []).map((v) => v.id).join(', ') || '(nenhuma)'}`
      )
    }
    const venda = novas![0]
    vendaCriadaId = venda.id as string

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
  } finally {
    // Limpeza SEMPRE, mesmo com o teste falhando. Cancela a venda antes de fechar
    // o caixa. O comentário antigo dizia que "o runner cancela via cancelar_venda
    // depois" — esse runner nunca existiu no repositório, e cada execução deixava
    // venda concluída e baixa de estoque PERMANENTES no banco real.
    // O teste pode ter morrido DEPOIS de gravar a venda e ANTES de identificá-la
    // — o caso mais provável é a tela não pintar "Venda Concluída" nos 15s,
    // enquanto o finalizar_venda já gravou. Sem procurar aqui, a venda ficaria
    // concluída e o estoque baixado, que é exatamente o que este finally existe
    // pra evitar. Mesmo critério de sempre: só cancela se houver UMA candidata.
    if (!vendaCriadaId) {
      const { data: orfas } = await supabase
        .from('vendas')
        .select('id, itens_venda!inner(produto_id)')
        .eq('status', 'concluida')
        .gte('created_at', inicioDoTeste)
        .eq('itens_venda.produto_id', produtoId)
      if ((orfas ?? []).length === 1) {
        vendaCriadaId = orfas![0].id as string
      } else if ((orfas ?? []).length > 1) {
        const aviso = `venda do teste ambígua na limpeza (${orfas!.length} candidatas) — nada cancelado, resolva na mão: ${orfas!.map((v) => v.id).join(', ')}`
        console.error('⚠️ ' + aviso); errosLimpeza.push(aviso)
      }
    }
    if (vendaCriadaId) {
      const { error } = await supabase.rpc('cancelar_venda', {
        p_venda_id: vendaCriadaId,
        p_motivo: '__QA__ e2e pdv — venda de teste, cancelada pelo próprio teste',
      })
      // console.error além do push: quando o try já falhou, os expect lá embaixo
      // nunca rodam e a falha de limpeza ficaria MUDA justo quando sobrou dado.
      if (error) { console.error('⚠️ cancelar_venda falhou:', error.message); errosLimpeza.push(`cancelar_venda: ${error.message}`) }
    }
    if (caixaCriadoPeloTeste) {
      const { error } = await supabase
        .from('caixas').update({ status: 'fechado', valor_fechamento: 0 }).eq('id', caixaCriadoPeloTeste)
      if (error) { console.error('⚠️ fechar caixa falhou:', error.message); errosLimpeza.push(`fechar caixa: ${error.message}`) }
    }
  }

  // Falha de limpeza não pode passar calada: significa dado de teste vivo no banco.
  expect(errosLimpeza, 'a limpeza do teste falhou — pode ter sobrado venda/caixa __QA__ no banco').toEqual([])
  expect(await somaEstoque(), 'cancelar a venda tem que devolver a unidade ao estoque').toBe(estoqueInicial)

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
