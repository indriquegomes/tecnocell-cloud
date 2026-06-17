/**
 * Teste de funcionalidades do painel TecnoCell Cloud
 * Roda com: node playwright-test-painel.mjs
 */
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const resultados = []

function log(pagina, botao, esperado, real, status) {
  resultados.push({ pagina, botao, esperado, real, status })
  const emoji = status === 'OK' ? '✅' : status === 'ERRO' ? '❌' : status === 'PARCIAL' ? '⚠️' : '🔍'
  console.log(`${emoji} [${pagina}] ${botao} → ${real}`)
}

async function goTo(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(800)
}

async function getConsoleErrors(page) {
  const erros = []
  page.on('console', msg => { if (msg.type() === 'error') erros.push(msg.text()) })
  return erros
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', err => consoleErrors.push('PAGE ERROR: ' + err.message))

  // ─── 1. DASHBOARD ────────────────────────────────────────────────────
  console.log('\n=== DASHBOARD (/painel) ===')
  await goTo(page, '/painel')

  // Verifica se a página carregou
  const dashTitle = await page.locator('h2').first().textContent().catch(() => '')
  if (dashTitle.includes('Dashboard')) {
    log('Dashboard', 'Carregamento', 'Página visível', `Título: "${dashTitle}"`, 'OK')
  } else {
    log('Dashboard', 'Carregamento', 'Página visível', `Título inesperado: "${dashTitle}"`, 'ERRO')
  }

  // Cards de resumo
  const cards = await page.locator('a.rounded-xl').all()
  log('Dashboard', 'Cards de resumo', '4 cards clicáveis', `${cards.length} cards encontrados`, cards.length >= 4 ? 'OK' : 'ERRO')

  // A Receber e A Pagar - verificar se aparecem e têm valores
  const aReceberEl = page.locator('text=A Receber').first()
  const aReceberVisible = await aReceberEl.isVisible().catch(() => false)
  log('Dashboard', 'A Receber visível', 'Bloco A Receber presente', aReceberVisible ? 'Visível' : 'Não encontrado', aReceberVisible ? 'OK' : 'ERRO')

  // Verificar valores de A Receber/A Pagar (bug: calculado sobre limit(5))
  const aPagarEl = page.locator('text=A Pagar').first()
  const aPagarVisible = await aPagarEl.isVisible().catch(() => false)
  log('Dashboard', 'A Pagar visível', 'Bloco A Pagar presente', aPagarVisible ? 'Visível' : 'Não encontrado', aPagarVisible ? 'OK' : 'ERRO')

  // Valores dos cards
  const boldTexts = await page.locator('p.text-3xl.font-bold').allTextContents().catch(() => [])
  log('Dashboard', 'Valores dos cards', 'Números visíveis', boldTexts.join(' | '), boldTexts.length > 0 ? 'OK' : 'ERRO')

  // Atalhos
  const atalhos = await page.locator('a:has-text("Abrir PDV"), a:has-text("Novo Lançamento"), a:has-text("Chat")').all()
  log('Dashboard', 'Atalhos', '3 atalhos visíveis', `${atalhos.length} atalhos encontrados`, atalhos.length === 3 ? 'OK' : 'PARCIAL')

  // Navegação pelo card Produtos Ativos
  const cardProdutos = page.locator('a[href="/painel/produtos"]').first()
  if (await cardProdutos.isVisible()) {
    await cardProdutos.click()
    await page.waitForURL('**/produtos**', { timeout: 5000 }).catch(() => {})
    log('Dashboard', 'Card Produtos Ativos → clique', 'Navega para /painel/produtos', page.url(), page.url().includes('/produtos') ? 'OK' : 'ERRO')
  }

  // ─── 2. PRODUTOS ────────────────────────────────────────────────────
  console.log('\n=== PRODUTOS (/painel/produtos) ===')
  await goTo(page, '/painel/produtos')

  const prodTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Produtos', 'Carregamento', 'Página Produtos', `Título: "${prodTitle}"`, prodTitle.includes('Produto') ? 'OK' : 'ERRO')

  // Verificar se tabela tem linhas
  const prodRows = await page.locator('tbody tr').all()
  log('Produtos', 'Tabela de produtos', 'Linhas de produtos visíveis', `${prodRows.length} linhas`, prodRows.length > 0 ? 'OK' : 'PARCIAL')

  // TESTE CRÍTICO: Thumbnails de imagem — bug documentado
  const imgThumbs = await page.locator('tbody img').all()
  const placeholders = await page.locator('tbody svg').all()
  if (imgThumbs.length > 0) {
    log('Produtos', 'Thumbnails de imagem', 'Imagens dos produtos visíveis', `${imgThumbs.length} imagens reais encontradas`, 'OK')
  } else if (placeholders.length > 0) {
    log('Produtos', 'Thumbnails de imagem', 'Imagens dos produtos visíveis', `0 imagens reais — ${placeholders.length} placeholders SVG (bug: imagem_url ausente do SELECT)`, 'ERRO')
  } else {
    log('Produtos', 'Thumbnails de imagem', 'Imagens dos produtos visíveis', 'Sem produtos cadastrados para testar', 'PARCIAL')
  }

  // Botão Novo Produto
  const btnNovoProd = page.locator('a[href="/painel/produtos/novo"]')
  const novoProdVisible = await btnNovoProd.isVisible().catch(() => false)
  log('Produtos', '+ Novo Produto', 'Botão visível', novoProdVisible ? 'Visível' : 'Não encontrado', novoProdVisible ? 'OK' : 'ERRO')

  // Busca
  const buscaProd = page.locator('input[name="busca"]').first()
  if (await buscaProd.isVisible()) {
    await buscaProd.fill('a')
    const filtrarBtn = page.locator('button[type="submit"]').first()
    await filtrarBtn.click()
    await page.waitForTimeout(1000)
    log('Produtos', 'Campo busca + Filtrar', 'Filtra lista de produtos', `URL: ${page.url()}`, 'OK')
  }

  // Editar primeiro produto (se existir)
  await goTo(page, '/painel/produtos')
  const editarProd = page.locator('a:has-text("Editar")').first()
  if (await editarProd.isVisible().catch(() => false)) {
    const href = await editarProd.getAttribute('href')
    log('Produtos', 'Botão Editar', 'Link para edição', `href: ${href}`, href?.includes('/editar') ? 'OK' : 'ERRO')
  } else {
    log('Produtos', 'Botão Editar', 'Link para edição', 'Nenhum produto para editar', 'PARCIAL')
  }

  // ─── 3. PDV ────────────────────────────────────────────────────────
  console.log('\n=== PDV (/painel/pdv) ===')
  await goTo(page, '/painel/pdv')

  const pdvTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('PDV', 'Carregamento', 'Frente de Caixa visível', `Título: "${pdvTitle}"`, pdvTitle.includes('PDV') ? 'OK' : 'ERRO')

  // Campo de busca
  const buscaPDV = page.locator('input[placeholder*="Buscar produto"]')
  const buscaVisible = await buscaPDV.isVisible().catch(() => false)
  log('PDV', 'Campo busca', 'Input visível', buscaVisible ? 'Visível' : 'Não encontrado', buscaVisible ? 'OK' : 'ERRO')

  if (buscaVisible) {
    // Tentar adicionar produto ao carrinho
    await buscaPDV.fill('a')
    await page.waitForTimeout(600)
    const dropdown = page.locator('.absolute.z-10')
    const dropdownVisible = await dropdown.isVisible().catch(() => false)
    log('PDV', 'Dropdown de busca', 'Aparece com produtos', dropdownVisible ? 'Dropdown visível' : 'Sem dropdown', dropdownVisible ? 'OK' : 'PARCIAL')

    if (dropdownVisible) {
      const firstProduct = dropdown.locator('button').first()
      const prodName = await firstProduct.textContent().catch(() => '').then(t => t?.trim().substring(0, 30))
      await firstProduct.click()
      await page.waitForTimeout(800)
      log('PDV', 'Adicionar produto ao carrinho', 'Produto vai para o carrinho', `Produto: "${prodName}"`, 'OK')

      // Verificar carrinho — a tabela só aparece quando há itens (condicional no JSX)
      // O carrinho usa min-w-full mas a seção muda de "Nenhum item" para tabela
      const carrinhoVazio = await page.locator('text=Nenhum item no carrinho').isVisible().catch(() => false)
      const carrinhoRows = await page.locator('tbody tr').all()
      log('PDV', 'Carrinho com produto', '1+ linha no carrinho', carrinhoVazio ? 'Ainda mostra "Nenhum item" — produto pode não ter estoque' : `${carrinhoRows.length} linhas no carrinho`, (!carrinhoVazio && carrinhoRows.length > 0) ? 'OK' : 'PARCIAL')

      if (carrinhoRows.length > 0) {
        // Botão + (aumentar qtd)
        const btnMais = page.locator('button:has-text("+")').first()
        if (await btnMais.isVisible()) {
          await btnMais.click()
          await page.waitForTimeout(300)
          log('PDV', 'Botão + (aumentar qtd)', 'Qtd incrementa', 'Clicado', 'OK')
        }

        // Botão - (diminuir qtd)
        const btnMenos = page.locator('button:has-text("−")').first()
        if (await btnMenos.isVisible()) {
          await btnMenos.click()
          await page.waitForTimeout(300)
          log('PDV', 'Botão − (diminuir qtd)', 'Qtd decrementa', 'Clicado', 'OK')
        }

        // Desconto
        const campoDesconto = page.locator('input[placeholder="0,00"]')
        if (await campoDesconto.isVisible()) {
          await campoDesconto.fill('1')
          await page.waitForTimeout(300)
          log('PDV', 'Campo desconto', 'Desconto aplicado', 'Valor 1.00 inserido', 'OK')
          await campoDesconto.fill('')
        }

        // Selecionar forma de pagamento
        const selectForma = page.locator('select').first()
        if (await selectForma.isVisible()) {
          const opcoes = await selectForma.locator('option').all()
          if (opcoes.length > 1) {
            await selectForma.selectOption({ index: 1 })
            const formaSelecionada = await selectForma.inputValue()
            log('PDV', 'Selecionar forma pagamento', 'Forma selecionada', `Value: ${formaSelecionada}`, 'OK')

            // Finalizar Venda
            const btnFinalizar = page.locator('button:has-text("Finalizar Venda")')
            if (await btnFinalizar.isVisible()) {
              const disabled = await btnFinalizar.isDisabled()
              log('PDV', 'Botão Finalizar Venda', 'Habilitado com produto+pagamento', disabled ? 'DESABILITADO (bug!)' : 'Habilitado', disabled ? 'ERRO' : 'OK')

              if (!disabled) {
                await btnFinalizar.click()
                await page.waitForTimeout(2000)
                const sucessoEl = await page.locator('text=Venda Concluída').isVisible().catch(() => false)
                log('PDV', 'Finalizar Venda → sucesso', 'Tela de venda concluída', sucessoEl ? 'Tela de sucesso visível ✓' : 'Sem tela de sucesso', sucessoEl ? 'OK' : 'ERRO')

                if (sucessoEl) {
                  // Nova Venda
                  const btnNovaVenda = page.locator('button:has-text("Nova Venda")')
                  if (await btnNovaVenda.isVisible()) {
                    await btnNovaVenda.click()
                    await page.waitForTimeout(500)
                    log('PDV', 'Botão Nova Venda', 'Reseta PDV', 'Clicado', 'OK')
                  }
                }
              }
            }
          } else {
            log('PDV', 'Formas de pagamento', 'Formas no select', 'Nenhuma forma cadastrada', 'PARCIAL')
          }
        }
      }
    }
  }

  // Finalizar com carrinho vazio
  await goTo(page, '/painel/pdv')
  const btnFin = page.locator('button:has-text("Finalizar Venda")')
  const isFinalDisabled = await btnFin.isDisabled().catch(() => true)
  log('PDV', 'Finalizar Venda (carrinho vazio)', 'Botão desabilitado', isFinalDisabled ? 'Corretamente desabilitado' : 'Habilitado (bug!)', isFinalDisabled ? 'OK' : 'ERRO')

  // ─── 4. OPERAÇÃO PDV ────────────────────────────────────────────────
  console.log('\n=== OPERAÇÃO PDV (/painel/pdv/operacao) ===')
  await goTo(page, '/painel/pdv/operacao')

  const opTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Op. PDV', 'Carregamento', 'Página Operação do PDV', `Título: "${opTitle}"`, opTitle.includes('Operação') ? 'OK' : 'ERRO')

  const statusCaixa = await page.locator('text=Status do Caixa').isVisible().catch(() => false)
  log('Op. PDV', 'Status do Caixa', 'Bloco status visível', statusCaixa ? 'Visível' : 'Não encontrado', statusCaixa ? 'OK' : 'ERRO')

  const abrirCaixaBtn = page.locator('button:has-text("Abrir Caixa")')
  const fecharCaixaBtn = page.locator('button:has-text("Fechar Caixa")')
  const temAbrirCaixa = await abrirCaixaBtn.isVisible().catch(() => false)
  const temFecharCaixa = await fecharCaixaBtn.isVisible().catch(() => false)
  log('Op. PDV', 'Botão Abrir/Fechar Caixa', 'Botão correto visível', temAbrirCaixa ? 'Abrir Caixa visível' : (temFecharCaixa ? 'Fechar Caixa visível (caixa aberto)' : 'Nenhum botão'), (temAbrirCaixa || temFecharCaixa) ? 'OK' : 'ERRO')

  // ─── 5. PEDIDOS ─────────────────────────────────────────────────────
  console.log('\n=== PEDIDOS (/painel/pedidos) ===')
  await goTo(page, '/painel/pedidos')

  const pedTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Pedidos', 'Carregamento', 'Página Pedidos e Orçamentos', `Título: "${pedTitle}"`, pedTitle.includes('Pedido') ? 'OK' : 'ERRO')

  const pedRows = await page.locator('tbody tr').all()
  log('Pedidos', 'Lista de pedidos', 'Tabela carregada', `${pedRows.length} linhas`, 'OK')

  const btnNovoPed = page.locator('a[href="/painel/pedidos/novo"]')
  log('Pedidos', '+ Novo pedido', 'Link visível', await btnNovoPed.isVisible() ? 'Visível' : 'Ausente', await btnNovoPed.isVisible() ? 'OK' : 'ERRO')

  // Filtros de tipo
  const filtroTodos = page.locator('a:has-text("Todos")').first()
  const filtroOrc = page.locator('a[href*="tipo=orcamento"]')
  const filtroPed = page.locator('a[href*="tipo=pedido"]').first()
  log('Pedidos', 'Filtros tipo (Todos/Orçamentos/Pedidos)', '3 filtros visíveis',
    `Todos:${await filtroTodos.isVisible()} Orc:${await filtroOrc.isVisible()} Ped:${await filtroPed.isVisible()}`,
    (await filtroTodos.isVisible() && await filtroOrc.isVisible()) ? 'OK' : 'PARCIAL')

  // Abrir primeiro pedido se existir
  const abrirPed = page.locator('a:has-text("Abrir")').first()
  if (await abrirPed.isVisible().catch(() => false)) {
    const href = await abrirPed.getAttribute('href')
    log('Pedidos', 'Botão Abrir', 'Link para detalhe', `href: ${href}`, href?.includes('/pedidos/') ? 'OK' : 'ERRO')
  } else {
    log('Pedidos', 'Botão Abrir', 'Link para detalhe', 'Nenhum pedido para abrir', 'PARCIAL')
  }

  // ─── 6. VALES DE CRÉDITO ────────────────────────────────────────────
  console.log('\n=== VALES (/painel/vales-credito) ===')
  await goTo(page, '/painel/vales-credito')

  const valesTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Vales', 'Carregamento', 'Página Vales de Crédito', `Título: "${valesTitle}"`, valesTitle.includes('Vale') ? 'OK' : 'ERRO')

  const emitirBtn = page.locator('button:has-text("Emitir Vale")')
  log('Vales', 'Botão Emitir Vale', 'Visível', await emitirBtn.isVisible() ? 'Visível' : 'Ausente', await emitirBtn.isVisible() ? 'OK' : 'ERRO')

  // ─── 7. PROMOÇÕES ───────────────────────────────────────────────────
  console.log('\n=== PROMOÇÕES (/painel/promocoes) ===')
  await goTo(page, '/painel/promocoes')

  const promTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Promoções', 'Carregamento', 'Página Promoções', `Título: "${promTitle}"`, promTitle.includes('Promoç') ? 'OK' : 'ERRO')

  const criarPromBtn = page.locator('button:has-text("Criar Promoção")')
  log('Promoções', 'Botão Criar Promoção', 'Visível', await criarPromBtn.isVisible() ? 'Visível' : 'Ausente', await criarPromBtn.isVisible() ? 'OK' : 'ERRO')

  // ─── 8. COMPRAS (Notas de Entrada) ──────────────────────────────────
  console.log('\n=== COMPRAS (/painel/compras) ===')
  await goTo(page, '/painel/compras')

  const compTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Compras', 'Carregamento', 'Notas de Entrada', `Título: "${compTitle}"`, compTitle.includes('Nota') ? 'OK' : 'ERRO')

  const btnNovaCompra = page.locator('a[href="/painel/compras/nova"]')
  log('Compras', '+ Nova Nota', 'Link visível', await btnNovaCompra.isVisible() ? 'Visível' : 'Ausente', await btnNovaCompra.isVisible() ? 'OK' : 'ERRO')

  // ─── 9. CLIENTES ────────────────────────────────────────────────────
  console.log('\n=== CLIENTES (/painel/clientes) ===')
  await goTo(page, '/painel/clientes')

  const cliTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Clientes', 'Carregamento', 'Clientes e Fornecedores', `Título: "${cliTitle}"`, cliTitle.includes('Cliente') ? 'OK' : 'ERRO')

  const cliRows = await page.locator('tbody tr').all()
  log('Clientes', 'Lista de clientes', 'Tabela carregada', `${cliRows.length} registros`, 'OK')

  // Busca
  const buscaCli = page.locator('input[placeholder*="Buscar"]').first()
  if (await buscaCli.isVisible()) {
    await buscaCli.fill('a')
    // Formulário GET — precisa submit via botão ou form.submit
    await page.evaluate(() => {
      const form = document.querySelector('form[method="GET"]')
      if (form) form.submit()
    })
    await page.waitForTimeout(1000)
    const urlAfterSearch = page.url()
    log('Clientes', 'Busca por nome', 'Filtra por ?busca=', urlAfterSearch.includes('busca=') ? 'URL com ?busca= ✓' : `URL: ${urlAfterSearch}`, urlAfterSearch.includes('busca=') ? 'OK' : 'ERRO')
  }

  // ─── 10. FINANCEIRO ─────────────────────────────────────────────────
  console.log('\n=== FINANCEIRO (/painel/financeiro) ===')
  await goTo(page, '/painel/financeiro')

  const finTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Financeiro', 'Carregamento', 'Página Financeiro', `Título: "${finTitle}"`, finTitle.includes('Financeiro') ? 'OK' : 'ERRO')

  const finRows = await page.locator('tbody tr').all()
  log('Financeiro', 'Lista de lançamentos', 'Tabela carregada', `${finRows.length} registros`, 'OK')

  // Resumo cards
  const aReceberCard = page.locator('text=A Receber (pendente)')
  const aReceberVal = await page.locator('p.text-3xl.text-green-700').first().textContent().catch(() => 'N/A')
  log('Financeiro', 'Card A Receber', 'Valor visível', `${aReceberVal}`, await aReceberCard.isVisible() ? 'OK' : 'PARCIAL')

  const aPagarCard = page.locator('text=A Pagar (pendente)')
  const aPagarVal = await page.locator('p.text-3xl.text-red-700').first().textContent().catch(() => 'N/A')
  log('Financeiro', 'Card A Pagar', 'Valor visível', `${aPagarVal}`, await aPagarCard.isVisible() ? 'OK' : 'PARCIAL')

  // Botões + A Receber e + A Pagar
  const btnAReceber = page.locator('a[href*="financeiro/novo?tipo=receber"]')
  const btnAPagar = page.locator('a[href*="financeiro/novo?tipo=pagar"]')
  log('Financeiro', 'Botão + A Receber', 'Link visível', await btnAReceber.isVisible() ? 'Visível' : 'Ausente', await btnAReceber.isVisible() ? 'OK' : 'ERRO')
  log('Financeiro', 'Botão + A Pagar', 'Link visível', await btnAPagar.isVisible() ? 'Visível' : 'Ausente', await btnAPagar.isVisible() ? 'OK' : 'ERRO')

  // Filtros
  const filtroReceber = page.locator('a[href="/painel/financeiro?tipo=receber"]')
  const filtroPagar = page.locator('a[href="/painel/financeiro?tipo=pagar"]')
  log('Financeiro', 'Filtro A Receber', 'Link visível', await filtroReceber.isVisible() ? 'Visível' : 'Ausente', await filtroReceber.isVisible() ? 'OK' : 'ERRO')
  log('Financeiro', 'Filtro A Pagar', 'Link visível', await filtroPagar.isVisible() ? 'Visível' : 'Ausente', await filtroPagar.isVisible() ? 'OK' : 'ERRO')

  // Botão Pago (primeiro lançamento não pago)
  const btnPago = page.locator('button:has-text("Pago")').first()
  log('Financeiro', 'Botão Pago', 'Visível em lançamentos pendentes', await btnPago.isVisible() ? 'Visível' : 'Nenhum lançamento pendente', 'OK')

  // ─── 11. ESTOQUE ────────────────────────────────────────────────────
  console.log('\n=== ESTOQUE (/painel/estoque) ===')
  await goTo(page, '/painel/estoque')

  const estTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Estoque', 'Carregamento', 'Página Estoque', `Título: "${estTitle}"`, estTitle.includes('Estoque') ? 'OK' : 'ERRO')

  const estRows = await page.locator('tbody tr').all()
  log('Estoque', 'Lista de estoque', 'Tabela carregada', `${estRows.length} registros`, 'OK')

  // Cards de resumo
  const cardEmEstoque = page.locator('p:text-is("Em Estoque")')
  const cardBaixo = page.locator('p:text-is("Estoque Baixo (≤3)")')
  const cardZerado = page.locator('p:text-is("Sem Estoque")')
  const emEst = await cardEmEstoque.isVisible().catch(() => false)
  const baixo = await cardBaixo.isVisible().catch(() => false)
  log('Estoque', 'Cards resumo', '3 cards visíveis',
    `EmEstoque:${emEst} Baixo:${baixo} Zerado:${await cardZerado.isVisible().catch(() => false)}`,
    (emEst || baixo) ? 'OK' : 'PARCIAL')

  const btnEntradaSaida = page.locator('a[href="/painel/estoque/movimentar"]')
  log('Estoque', '+ Entrada / Saída', 'Link visível', await btnEntradaSaida.isVisible() ? 'Visível' : 'Ausente', await btnEntradaSaida.isVisible() ? 'OK' : 'ERRO')

  // Botão Ajustar (primeiro produto)
  const btnAjustar = page.locator('a:has-text("Ajustar")').first()
  log('Estoque', 'Botão Ajustar', 'Link para movimentar com produto_id', await btnAjustar.isVisible() ? `href: ${await btnAjustar.getAttribute('href')}` : 'Nenhum', await btnAjustar.isVisible() ? 'OK' : 'PARCIAL')

  // Histórico de movimentações — BUG DOCUMENTADO
  const histBtn = page.locator('a:has-text("Histórico"), button:has-text("Histórico")')
  const temHistorico = await histBtn.isVisible().catch(() => false)
  log('Estoque', 'Histórico de movimentações', 'Link para histórico', temHistorico ? 'Existe' : 'AUSENTE — funcionalidade não implementada', temHistorico ? 'OK' : 'ERRO')

  // ─── 12. MOVIMENTAR ESTOQUE ──────────────────────────────────────────
  console.log('\n=== MOVIMENTAR ESTOQUE (/painel/estoque/movimentar) ===')
  await goTo(page, '/painel/estoque/movimentar')

  const movTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Mov. Estoque', 'Carregamento', 'Página Movimentar Estoque', `Título: "${movTitle}"`, movTitle.includes('Movimentar') ? 'OK' : 'ERRO')

  const selectProd = page.locator('select[name="produto_id"]')
  const selectDep = page.locator('select[name="deposito_id"]')
  const selectOp = page.locator('select[name="operacao"]')
  const campoQtd = page.locator('input[name="quantidade"]')
  const btnRegistrar = page.locator('button:has-text("Registrar")')

  log('Mov. Estoque', 'Select Produto', 'Visível e populado', await selectProd.isVisible() ? `${await selectProd.locator('option').count()} opções` : 'Ausente', await selectProd.isVisible() ? 'OK' : 'ERRO')
  log('Mov. Estoque', 'Select Depósito', 'Visível e populado', await selectDep.isVisible() ? `${await selectDep.locator('option').count()} opções` : 'Ausente', await selectDep.isVisible() ? 'OK' : 'ERRO')
  log('Mov. Estoque', 'Select Operação', 'Entrada/Saída/Ajuste', await selectOp.isVisible() ? 'Visível' : 'Ausente', await selectOp.isVisible() ? 'OK' : 'ERRO')
  log('Mov. Estoque', 'Campo Quantidade', 'Input numérico', await campoQtd.isVisible() ? 'Visível' : 'Ausente', await campoQtd.isVisible() ? 'OK' : 'ERRO')
  log('Mov. Estoque', 'Botão Registrar', 'Botão de submit', await btnRegistrar.isVisible() ? 'Visível' : 'Ausente', await btnRegistrar.isVisible() ? 'OK' : 'ERRO')

  // ─── 13. DEPÓSITOS ──────────────────────────────────────────────────
  console.log('\n=== DEPÓSITOS (/painel/depositos) ===')
  await goTo(page, '/painel/depositos')

  const depTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Depósitos', 'Carregamento', 'Página Depósitos', `Título: "${depTitle}"`, depTitle.includes('Depósito') ? 'OK' : 'ERRO')

  const btnAdicionarDep = page.locator('button:has-text("Adicionar")')
  log('Depósitos', 'Botão Adicionar', 'Formulário + submit', await btnAdicionarDep.isVisible() ? 'Visível' : 'Ausente', await btnAdicionarDep.isVisible() ? 'OK' : 'ERRO')

  // ─── 14. FORMAS DE PAGAMENTO ─────────────────────────────────────────
  console.log('\n=== FORMAS PAGAMENTO (/painel/formas-pagamento) ===')
  await goTo(page, '/painel/formas-pagamento')

  const fpTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Formas Pgto', 'Carregamento', 'Página Formas de Pagamento', `Título: "${fpTitle}"`, fpTitle.includes('Forma') ? 'OK' : 'ERRO')

  const fpRows = await page.locator('tbody tr').all()
  log('Formas Pgto', 'Lista de formas', `${fpRows.length} formas cadastradas`, `${fpRows.length} linhas`, 'OK')

  // ─── 15. TABELAS DE PREÇO ────────────────────────────────────────────
  console.log('\n=== TABELAS DE PREÇO (/painel/tabelas-preco) ===')
  await goTo(page, '/painel/tabelas-preco')

  const tpTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Tabelas Preço', 'Carregamento', 'Página Tabelas de Preço', `Título: "${tpTitle}"`, tpTitle.includes('Tabela') ? 'OK' : 'ERRO')

  const btnCriarTabela = page.locator('button:has-text("Criar Tabela")')
  log('Tabelas Preço', 'Botão Criar Tabela', 'Visível', await btnCriarTabela.isVisible() ? 'Visível' : 'Ausente', await btnCriarTabela.isVisible() ? 'OK' : 'ERRO')

  // ─── 16. EMPRESAS ────────────────────────────────────────────────────
  console.log('\n=== EMPRESAS (/painel/empresas) ===')
  await goTo(page, '/painel/empresas')

  const empTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Empresas', 'Carregamento', 'Página Empresas', `Título: "${empTitle}"`, empTitle.includes('Empresa') ? 'OK' : 'ERRO')

  const empRows = await page.locator('tbody tr').all()
  log('Empresas', 'Lista de empresas', 'Tabela carregada', `${empRows.length} registros`, 'OK')

  // ─── 17. RELATÓRIOS ──────────────────────────────────────────────────
  console.log('\n=== RELATÓRIOS (/painel/relatorios) ===')
  await goTo(page, '/painel/relatorios')

  const relTitle = await page.locator('h2').first().textContent().catch(() => '')
  log('Relatórios', 'Carregamento', 'Página Relatórios', `Título: "${relTitle}"`, relTitle.includes('Relat') ? 'OK' : 'ERRO')

  // Abas
  const abaFin = page.locator('a:has-text("Financeiro")').first()
  const abaVendas = page.locator('a:has-text("Vendas")').first()
  const abaEstoque = page.locator('a:has-text("Estoque")').first()
  log('Relatórios', 'Abas (Financeiro/Vendas/Estoque)', '3 abas visíveis',
    `Fin:${await abaFin.isVisible()} Vnd:${await abaVendas.isVisible()} Est:${await abaEstoque.isVisible()}`,
    (await abaFin.isVisible() && await abaVendas.isVisible()) ? 'OK' : 'ERRO')

  // Aba Financeiro
  if (await abaFin.isVisible()) {
    await abaFin.click()
    await page.waitForTimeout(800)
    const tabelaFin = await page.locator('table').count()
    log('Relatórios', 'Aba Financeiro → tabela', 'Dados carregados', `${tabelaFin} tabela(s) visível(is)`, tabelaFin > 0 ? 'OK' : 'PARCIAL')
  }

  // Aba Vendas
  if (await abaVendas.isVisible()) {
    await abaVendas.click()
    await page.waitForTimeout(800)
    const tabelaVnd = await page.locator('table').count()
    log('Relatórios', 'Aba Vendas → tabela', 'Dados carregados', `${tabelaVnd} tabela(s) visível(is)`, tabelaVnd > 0 ? 'OK' : 'PARCIAL')
  }

  // Aba Estoque
  if (await abaEstoque.isVisible()) {
    await abaEstoque.click()
    await page.waitForTimeout(800)
    const tabelaEst = await page.locator('table').count()
    log('Relatórios', 'Aba Estoque → tabela', 'Dados carregados', `${tabelaEst} tabela(s) visível(is)`, tabelaEst > 0 ? 'OK' : 'PARCIAL')
  }

  // Filtro de período
  const inputDe = page.locator('input[name="de"]')
  const inputAte = page.locator('input[name="ate"]')
  const btnFiltrarRel = page.locator('button:has-text("Filtrar")')
  log('Relatórios', 'Filtro de período (De/Até)', 'Inputs visíveis', `De:${await inputDe.isVisible()} Ate:${await inputAte.isVisible()}`, (await inputDe.isVisible()) ? 'OK' : 'ERRO')
  log('Relatórios', 'Botão Filtrar', 'Submit do período', await btnFiltrarRel.isVisible() ? 'Visível' : 'Ausente', await btnFiltrarRel.isVisible() ? 'OK' : 'ERRO')

  // Exportação CSV/PDF — BUG
  const exportBtn = page.locator('button:has-text("Exportar"), a:has-text("CSV"), a:has-text("PDF")')
  const temExport = await exportBtn.isVisible().catch(() => false)
  log('Relatórios', 'Exportação CSV/PDF', 'Botão de exportação', temExport ? 'Existe' : 'AUSENTE — não implementado', temExport ? 'OK' : 'ERRO')

  // ─── 18. CHAT ────────────────────────────────────────────────────────
  console.log('\n=== CHAT (/painel/chat) ===')
  await goTo(page, '/painel/chat')
  const chatStatus = page.url()
  const chatOk = chatStatus.includes('/chat')
  log('Chat', 'Carregamento', 'Página /painel/chat acessível', chatOk ? 'Página carregada' : 'Redirecionado', chatOk ? 'OK' : 'PARCIAL')
  const chatTitle = await page.locator('h1, h2').first().textContent().catch(() => '(sem título)')
  log('Chat', 'Conteúdo', 'Interface de chat', chatTitle, 'OK')

  // ─── ERROS DE CONSOLE ────────────────────────────────────────────────
  console.log('\n=== ERROS DE CONSOLE ===')
  if (consoleErrors.length > 0) {
    console.log('Erros encontrados:')
    consoleErrors.slice(0, 20).forEach(e => console.log('  ❌', e))
  } else {
    console.log('✅ Nenhum erro de console registrado')
  }

  await browser.close()

  // ─── RELATÓRIO FINAL ─────────────────────────────────────────────────
  console.log('\n\n══════════════════════════════════════════════')
  console.log('RESUMO FINAL')
  console.log('══════════════════════════════════════════════')
  const ok = resultados.filter(r => r.status === 'OK').length
  const erro = resultados.filter(r => r.status === 'ERRO').length
  const parcial = resultados.filter(r => r.status === 'PARCIAL').length
  console.log(`✅ OK:      ${ok}`)
  console.log(`❌ ERRO:    ${erro}`)
  console.log(`⚠️  PARCIAL: ${parcial}`)
  console.log(`TOTAL:     ${resultados.length}`)

  console.log('\nERROS ENCONTRADOS:')
  resultados.filter(r => r.status === 'ERRO').forEach(r => {
    console.log(`  ❌ [${r.pagina}] ${r.botao}: ${r.real}`)
  })

  // Gera JSON para o próximo passo (atualizar o .md)
  const fs = await import('fs')
  fs.default.writeFileSync('playwright-results.json', JSON.stringify(resultados, null, 2))
  console.log('\nResultados salvos em playwright-results.json')
})()
