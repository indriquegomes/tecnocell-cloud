const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/AppData/Local/Temp/claude/teste-dev2';
const EMAIL = 'indrique@hotmail.com';
const PASSWORD = '21042008Fenix@#';
const BASE = 'http://localhost:3000';

const results = [];
function log(msg) { console.log(msg); results.push(msg); }
async function ss(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  log(`  [ss] ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);

  // LOGIN
  log('=== LOGIN ===');
  await page.goto(BASE + '/login');
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 15000 });
  await page.waitForTimeout(800);
  log('Login OK');

  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(2000);
  await ss(page, 'T0-lista-inicial');

  // ===== TESTE 1: BUSCA POR NÚMERO "1" =====
  log('\n=== TESTE 1: BUSCA POR "1" ===');
  await page.click('button:has-text("Nova Devolução")');
  await page.waitForTimeout(800);

  const inputBusca = page.locator('input[placeholder*="nome do cliente"]');
  await inputBusca.fill('1');
  await page.waitForTimeout(1500);
  await ss(page, 'T1-busca-numero-1');

  // Conta quantos resultados apareceram (buttons dentro do div de resultados)
  const vendaButtons = page.locator('.fixed.inset-0 button[class*="flex w-full"], .fixed.inset-0 div[class*="divide-y"] button');
  const countResults = await vendaButtons.count();
  log(`TESTE 1: Busca por "1" — resultados encontrados: ${countResults}`);
  if (countResults > 0) {
    const texts = await vendaButtons.allTextContents();
    log(`  Primeiros resultados: ${JSON.stringify(texts.slice(0,3))}`);
  }

  // ===== TESTE 2: STEP 2 — clicar na venda (usa o button real) =====
  log('\n=== TESTE 2: STEP 2 — botões +/- e total ===');
  // Limpa a busca e aguarda lista recente
  await inputBusca.fill('');
  await page.waitForTimeout(1200);
  await ss(page, 'T2-01-lista-recente');

  // Clica na PRIMEIRA venda (button com flex w-full dentro do modal overlay)
  const firstVendaBtn = page.locator('.fixed.inset-0.z-50 button.flex.w-full').first();
  const firstVendaVis = await firstVendaBtn.isVisible().catch(() => false);
  log(`  Primeiro botão de venda visível: ${firstVendaVis}`);

  if (firstVendaVis) {
    const vendaText = await firstVendaBtn.textContent().catch(() => '');
    log(`  Venda a selecionar: ${vendaText.trim().slice(0, 60)}`);
    await firstVendaBtn.click();
    await page.waitForTimeout(1200);
    await ss(page, 'T2-02-step2-itens');

    // Verifica se step mudou para "itens"
    const stepItensAtivo = await page.locator('.fixed.inset-0.z-50 text=Itens').isVisible().catch(() => false);
    log(`  Stepper "Itens" ativo: ${stepItensAtivo}`);

    // Botões + e - (texto real é o caractere − e +)
    // Código usa texto "−" (U+2212) para o menos e "+" para mais
    const btnMenos = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: '−' });
    const btnMais = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: '+' });
    const cntMenos = await btnMenos.count();
    const cntMais = await btnMais.count();
    log(`  Botões − encontrados: ${cntMenos}`);
    log(`  Botões + encontrados: ${cntMais}`);

    if (cntMais > 0) {
      // Pega o total antes
      const totalEl = page.locator('.fixed.inset-0.z-50 text=Total a devolver').locator('..').locator('span').last();
      const totalBefore = await totalEl.textContent().catch(() => '?');
      log(`  Total antes de clicar +: ${totalBefore}`);

      await btnMais.first().click();
      await page.waitForTimeout(500);
      await ss(page, 'T2-03-apos-mais');

      const totalAfter = await totalEl.textContent().catch(() => '?');
      log(`  Total depois de clicar +: ${totalAfter}`);
      log(`TESTE 2 - Botão + funciona: ${totalBefore !== totalAfter}`);
    } else {
      log('  Botões +/- não encontrados pelo texto');

      // Tenta de outra forma: botões com dimensões h-7 w-7
      const botoesH7 = page.locator('.fixed.inset-0.z-50 button.flex.h-7.w-7');
      const cntH7 = await botoesH7.count();
      log(`  Botões h-7 w-7 encontrados: ${cntH7}`);

      if (cntH7 >= 2) {
        // h-7 w-7 são os botões - e + alternados por item
        // Pega o texto do modal para ver totais
        const modalText1 = await page.locator('.fixed.inset-0.z-50').textContent().catch(() => '');
        const valores1 = modalText1.match(/R\$\s*[\d.,]+/g) || [];
        log(`  Valores R$ antes: ${JSON.stringify(valores1)}`);

        // Clica no segundo botão h-7 (que seria o +) do primeiro item
        if (cntH7 >= 2) {
          await botoesH7.nth(1).click(); // índice 1 = +
          await page.waitForTimeout(500);
          await ss(page, 'T2-04-apos-h7-mais');
          const modalText2 = await page.locator('.fixed.inset-0.z-50').textContent().catch(() => '');
          const valores2 = modalText2.match(/R\$\s*[\d.,]+/g) || [];
          log(`  Valores R$ depois: ${JSON.stringify(valores2)}`);
          log(`TESTE 2 - Botão + (h-7) funciona: ${JSON.stringify(valores1) !== JSON.stringify(valores2)}`);
        }
      }
    }

    // ===== TESTE 4b: ESCAPE NO STEP 2 =====
    log('\n=== TESTE 4b: ESCAPE NO STEP 2 ===');
    const step2Aberto = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
    log(`  Modal aberto no step 2: ${step2Aberto}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await ss(page, 'T4b-escape-step2');
    const fechadoS2 = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => true));
    log(`TESTE 4b: Escape fechou modal no step 2: ${fechadoS2}`);
  } else {
    log('TESTE 2: Nenhum botão de venda encontrado — verificando estrutura');
    // Dump dos botões dentro do overlay
    const allBtns = await page.locator('.fixed.inset-0.z-50 button').allTextContents().catch(() => []);
    log(`  Botões encontrados: ${JSON.stringify(allBtns)}`);
    await ss(page, 'T2-debug-modal');
  }

  // ===== AVANÇA PARA STEP 3 =====
  log('\n=== AVANÇANDO PARA STEP 3 ===');
  // Reabre o modal
  const modalFechado = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => true));
  if (modalFechado) {
    await page.click('button:has-text("Nova Devolução")');
    await page.waitForTimeout(800);
  }

  // Aguarda lista carregar e clica na primeira venda
  await page.waitForTimeout(800);
  const firstBtn = page.locator('.fixed.inset-0.z-50 button.flex.w-full').first();
  if (await firstBtn.isVisible().catch(() => false)) {
    await firstBtn.click();
    await page.waitForTimeout(1000);
    await ss(page, 'T3-01-step2');

    // Agora todos os itens já têm qtd=original
    // Precisa clicar em "Revisar devolução →" (step === 'itens' && totalSelecionado > 0)
    // O total começa com todos os itens marcados, mas para avançar precisa de totalSelecionado > 0
    // O botão é "Revisar devolução →"
    const btnRevisar = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: /revisar devolução/i });
    const btnRevisarCount = await btnRevisar.count();
    log(`  Botão "Revisar devolução": ${btnRevisarCount}`);

    if (btnRevisarCount > 0) {
      // Verifica se está disabled
      const disabled = await btnRevisar.first().isDisabled().catch(() => false);
      log(`  Botão desabilitado: ${disabled}`);

      if (disabled) {
        // Precisa selecionar pelo menos 1 item — checkbox ou botão +
        log('  Total = 0, ativando um item...');
        // Clica no primeiro checkbox
        const check = page.locator('.fixed.inset-0.z-50 input[type="checkbox"]').first();
        if (await check.isVisible().catch(() => false)) {
          const isChecked = await check.isChecked().catch(() => false);
          if (!isChecked) {
            await check.click();
            await page.waitForTimeout(400);
            log('  Marcou checkbox do primeiro item');
          } else {
            log('  Checkbox já estava marcado');
          }
        }
        // Ou usa o botão +
        const btnPlusItem = page.locator('.fixed.inset-0.z-50 button.flex.h-7.w-7').nth(1);
        if (await btnPlusItem.isVisible().catch(() => false)) {
          await btnPlusItem.click();
          await page.waitForTimeout(400);
          log('  Clicou no botão + do primeiro item');
        }
      }
      await ss(page, 'T3-02-antes-revisar');
      await btnRevisar.first().click();
      await page.waitForTimeout(800);
      await ss(page, 'T3-03-step3-confirmar');

      // ===== TESTE 3: STEP 3 — botões de crédito =====
      log('\n=== TESTE 3: STEP 3 — botões crédito ===');
      const botoesStep3 = await page.locator('.fixed.inset-0.z-50 button').allTextContents().catch(() => []);
      log(`  Botões no step 3: ${JSON.stringify(botoesStep3)}`);

      // Os 5 botões de crédito são do CREDITO_OPTS
      const dinheiro = await page.locator('.fixed.inset-0.z-50').locator('text=Dinheiro').isVisible().catch(() => false);
      const pix = await page.locator('.fixed.inset-0.z-50').locator('text=PIX').isVisible().catch(() => false);
      const debito = await page.locator('.fixed.inset-0.z-50').locator('text=Débito').isVisible().catch(() => false);
      const credito = await page.locator('.fixed.inset-0.z-50').locator('text=Crédito').first().isVisible().catch(() => false);
      const semReemb = await page.locator('.fixed.inset-0.z-50').locator('text=Sem reembolso').isVisible().catch(() => false);

      log(`TESTE 3 - Dinheiro: ${dinheiro}`);
      log(`TESTE 3 - PIX: ${pix}`);
      log(`TESTE 3 - Débito: ${debito}`);
      log(`TESTE 3 - Crédito: ${credito}`);
      log(`TESTE 3 - Sem reembolso: ${semReemb}`);
      log(`TESTE 3 - Todos os 5 aparecem: ${dinheiro && pix && debito && credito && semReemb}`);

      // Verifica grid-cols-3 no step 3
      const gridCols3 = await page.locator('.fixed.inset-0.z-50 .grid-cols-3').count();
      log(`  Grid de 3 colunas detectado: ${gridCols3 > 0} (count: ${gridCols3})`);

      // ===== TESTE 4c: ESCAPE NO STEP 3 =====
      log('\n=== TESTE 4c: ESCAPE NO STEP 3 ===');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await ss(page, 'T4c-escape-step3');
      const fechadoS3 = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => true));
      log(`TESTE 4c: Escape fechou modal no step 3: ${fechadoS3}`);
    } else {
      log('  Botão Revisar não encontrado');
      const allBtnsS2 = await page.locator('.fixed.inset-0.z-50 button').allTextContents().catch(() => []);
      log(`  Botões disponíveis: ${JSON.stringify(allBtnsS2)}`);
      await ss(page, 'T3-debug-sem-revisar');
    }
  } else {
    log('  Nenhuma venda disponível para clicar (step 3 skipped)');
  }

  // ===== TESTE 6: FLUXO COMPLETO =====
  log('\n=== TESTE 6: FLUXO COMPLETO ===');
  const mAberto = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
  if (!mAberto) {
    await page.goto(BASE + '/painel/devolucoes');
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Nova Devolução")');
    await page.waitForTimeout(800);
  }
  await ss(page, 'T6-01-step1');

  // Clica na segunda venda para não repetir (ou a primeira se precisar)
  const secondVenda = page.locator('.fixed.inset-0.z-50 button.flex.w-full').nth(1);
  const secondVendaVis = await secondVenda.isVisible().catch(() => false);
  const vendaParaClicar = secondVendaVis
    ? page.locator('.fixed.inset-0.z-50 button.flex.w-full').nth(1)
    : page.locator('.fixed.inset-0.z-50 button.flex.w-full').first();

  await vendaParaClicar.click();
  await page.waitForTimeout(1000);
  await ss(page, 'T6-02-step2');

  // Avança para step 3
  const btnRevStep3 = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: /revisar devolução/i });
  const isDisS3 = await btnRevStep3.first().isDisabled().catch(() => false);
  log(`  Botão Revisar desabilitado: ${isDisS3}`);
  if (isDisS3) {
    // Ativa um item
    const check = page.locator('.fixed.inset-0.z-50 input[type="checkbox"]').first();
    const isChecked = await check.isChecked().catch(() => false);
    if (!isChecked) { await check.click(); await page.waitForTimeout(300); }
    else {
      // usa o + do primeiro item (alternado: índice 1 = +)
      await page.locator('.fixed.inset-0.z-50 button.flex.h-7.w-7').nth(1).click();
      await page.waitForTimeout(300);
    }
  }
  await btnRevStep3.first().click();
  await page.waitForTimeout(800);
  await ss(page, 'T6-03-step3');

  // Seleciona forma PIX
  const btnPix = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: 'PIX' });
  if (await btnPix.isVisible().catch(() => false)) {
    await btnPix.click();
    log('  Selecionou PIX');
    await page.waitForTimeout(300);
  }

  // Preenche motivo (é um input no step 3, não textarea)
  const inputMotivo = page.locator('.fixed.inset-0.z-50 input[placeholder*="defeito"]');
  if (await inputMotivo.isVisible().catch(() => false)) {
    await inputMotivo.fill('Teste automatizado');
    log('  Preencheu motivo: Teste automatizado');
  }
  await ss(page, 'T6-04-antes-confirmar');

  // Clica em Confirmar
  const btnConfirmar = page.locator('.fixed.inset-0.z-50 button').filter({ hasText: /confirmar/i });
  if (await btnConfirmar.isVisible().catch(() => false)) {
    await btnConfirmar.click();
    log('  Clicou em Confirmar');
    await page.waitForTimeout(2500);
  }
  await ss(page, 'T6-05-apos-confirmar');

  // Verifica toast verde (fixed top-5 right-5)
  const toast = page.locator('.fixed.top-5.right-5');
  const toastVis = await toast.isVisible().catch(() => false);
  const toastText = await toast.textContent().catch(() => '');
  log(`TESTE 6: Toast visível: ${toastVis}`);
  log(`TESTE 6: Texto do toast: "${toastText.trim()}"`);

  // Verifica se modal fechou
  await page.waitForTimeout(500);
  const modalFechouFinal = !(await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => true));
  log(`TESTE 6: Modal fechou após confirmar: ${modalFechouFinal}`);

  // ===== TESTE 7: MODAL DETALHE =====
  log('\n=== TESTE 7: MODAL DETALHE ===');
  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(2000);
  await ss(page, 'T7-01-lista');

  const btnVer = page.locator('button:has-text("Ver")').first();
  if (await btnVer.isVisible().catch(() => false)) {
    await btnVer.click();
    await page.waitForTimeout(1200);
    await ss(page, 'T7-02-modal-detalhe');

    const detalheVis = await page.locator('.fixed.inset-0.z-50').isVisible().catch(() => false);
    log(`TESTE 7: Modal de detalhe abriu: ${detalheVis}`);

    if (detalheVis) {
      const detalheText = await page.locator('.fixed.inset-0.z-50').textContent().catch(() => '');
      log(`  Conteúdo (300 chars): ${detalheText.slice(0, 300).replace(/\s+/g, ' ')}`);

      const temProduto = detalheText.toLowerCase().includes('produto');
      const temData = detalheText.includes('Data') || detalheText.includes('data');
      const temCliente = detalheText.includes('Cliente');
      const temMotivo = detalheText.includes('Motivo');
      const travessoes = (detalheText.match(/—/g) || []).length;

      log(`  Tem "Produto": ${temProduto}`);
      log(`  Tem "Data": ${temData}`);
      log(`  Tem "Cliente": ${temCliente}`);
      log(`  Tem "Motivo": ${temMotivo}`);
      log(`  Quantidade de "—" (campos vazios): ${travessoes}`);
    }
  } else {
    log('TESTE 7: Botão Ver não encontrado');
  }

  // ===== TESTE 8: FILTRO DE DATA =====
  log('\n=== TESTE 8: FILTRO DE DATA ===');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(1500);

  const urlAntes = page.url();
  log(`  URL antes: ${urlAntes}`);

  const inputDe = page.locator('input[type="date"]').first();
  const inputAte = page.locator('input[type="date"]').last();

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = ontem.toISOString().split('T')[0];

  await inputDe.fill(ontemStr);
  log(`  Data "De" preenchida: ${ontemStr}`);
  await ss(page, 'T8-01-data-preenchida');

  await page.click('button:has-text("Filtrar")');
  await page.waitForTimeout(1500);
  await ss(page, 'T8-02-resultado-filtro');

  const urlDepois = page.url();
  log(`  URL depois: ${urlDepois}`);
  log(`TESTE 8: URL mudou: ${urlAntes !== urlDepois}`);
  log(`TESTE 8: URL contém parâmetro "de": ${urlDepois.includes('de=')}`);

  const rowsAposFilter = await page.locator('table tbody tr').count();
  log(`TESTE 8: Linhas visíveis após filtro: ${rowsAposFilter}`);

  await browser.close();

  log('\n========== RESUMO FINAL ==========');
  fs.writeFileSync(path.join(OUT, 'relatorio3.txt'), results.join('\n'), 'utf8');
  console.log(`\nRelatório salvo em ${OUT}/relatorio3.txt`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
