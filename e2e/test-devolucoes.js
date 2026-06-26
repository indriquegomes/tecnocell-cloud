const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/AppData/Local/Temp/claude/teste-dev2';
const EMAIL = 'indrique@hotmail.com';
const PASSWORD = '21042008Fenix@#';
const BASE = 'http://localhost:3000';

const results = [];

function log(msg) {
  console.log(msg);
  results.push(msg);
}

async function ss(page, name) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  log(`  [screenshot] ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(15000);

  // LOGIN
  log('\n=== LOGIN ===');
  await page.goto(BASE + '/login');
  await page.waitForTimeout(800);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 15000 });
  await page.waitForTimeout(1000);
  log('Login OK');

  // NAVEGA DEVOLUÇÕES
  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(2000);
  await ss(page, '01-lista-devolucoes');
  log('Página /painel/devolucoes carregada');

  // ABRE MODAL
  log('\n=== MODAL ABERTURA ===');
  await page.click('button:has-text("Nova Devolução")');
  await page.waitForTimeout(1000);
  await ss(page, '02-modal-step1-aberto');

  // ===== TESTE 1: BUSCA POR NÚMERO "1" =====
  log('\n=== TESTE 1: BUSCA POR NÚMERO "1" ===');
  try {
    // Tenta localizar o input de busca (pode ter vários placeholders)
    const inputBusca = page.locator('input[placeholder*="buscar"], input[placeholder*="Buscar"], input[placeholder*="cliente"], input[placeholder*="número"], input[placeholder*="numero"], input[placeholder*="venda"]').first();
    const visible = await inputBusca.isVisible().catch(() => false);
    if (visible) {
      await inputBusca.fill('1');
      await page.waitForTimeout(1500);
      await ss(page, '03-busca-numero-1');
      // Verifica resultados
      const rows = await page.locator('table tbody tr, [data-testid="venda-item"], .venda-item, li:has-text("Venda"), div:has-text("Venda #")').count();
      log(`TESTE 1: Input visível=SIM | Resultados encontrados: ${rows}`);
      // Tenta contar vendas listadas de forma mais genérica
      const anyResults = await page.locator('button:has-text("Selecionar"), button:has-text("Usar")').count();
      log(`  Botões "Selecionar/Usar" encontrados: ${anyResults}`);
    } else {
      log('TESTE 1: Input de busca NÃO encontrado com placeholders conhecidos');
      // Tira screenshot para ver o que tem no modal
      await ss(page, '03-busca-nao-encontrada');
    }
  } catch (e) {
    log(`TESTE 1 ERRO: ${e.message}`);
    await ss(page, '03-erro-busca');
  }

  // ===== TESTE 4: ESCAPE FECHA MODAL (step 1) =====
  log('\n=== TESTE 4a: ESCAPE NO STEP 1 ===');
  try {
    // Verifica se modal está aberto
    const modalAberto = await page.locator('[role="dialog"], .modal, [data-modal]').isVisible().catch(() => false);
    log(`Modal aberto antes do Escape: ${modalAberto}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await ss(page, '04a-escape-step1');
    const modalFechado = await page.locator('[role="dialog"], .modal, [data-modal]').isVisible().catch(() => false);
    log(`TESTE 4a: Modal fechado após Escape: ${!modalFechado}`);
  } catch (e) {
    log(`TESTE 4a ERRO: ${e.message}`);
  }

  // ===== TESTE 5: CLIQUE FORA FECHA MODAL =====
  log('\n=== TESTE 5: CLIQUE FORA (overlay) ===');
  try {
    // Reabre o modal
    await page.click('button:has-text("Nova Devolução")');
    await page.waitForTimeout(800);
    await ss(page, '05a-modal-reaberto');

    // Clica no overlay (geralmente fora do dialog, no canto)
    await page.mouse.click(50, 50);
    await page.waitForTimeout(600);
    await ss(page, '05b-apos-clique-fora');
    const modalFechado = await page.locator('[role="dialog"], .modal, [data-modal]').isVisible().catch(() => false);
    log(`TESTE 5: Modal fechado após clique fora: ${!modalFechado}`);
  } catch (e) {
    log(`TESTE 5 ERRO: ${e.message}`);
  }

  // ===== REABRIR MODAL PARA TESTES 2, 3, 4b, 4c =====
  log('\n=== REABRINDO MODAL ===');
  await page.click('button:has-text("Nova Devolução")');
  await page.waitForTimeout(1000);

  // Busca para ter vendas na lista — tenta busca vazia (recentes)
  const inputBusca2 = page.locator('input').first();
  try {
    await inputBusca2.fill('');
    await page.waitForTimeout(1500);
  } catch (e) {}
  await ss(page, '06-step1-com-vendas');

  // Conta vendas disponíveis
  const vendaCount = await page.locator('button:has-text("Selecionar"), button:has-text("Usar"), [data-action="selecionar"]').count();
  log(`Vendas disponíveis para seleção: ${vendaCount}`);

  let vendaSelecionada = false;

  // ===== TESTE 2: STEP 2 — botões +/- e total =====
  log('\n=== TESTE 2: STEP 2 — itens da venda ===');
  try {
    // Tenta clicar no primeiro item de venda disponível
    const btnSelecionar = page.locator('button:has-text("Selecionar"), button:has-text("Usar"), tr button').first();
    const selVisible = await btnSelecionar.isVisible().catch(() => false);

    if (!selVisible) {
      // Tenta clicar na linha da tabela diretamente
      const tableRow = page.locator('table tbody tr').first();
      const rowVisible = await tableRow.isVisible().catch(() => false);
      if (rowVisible) {
        await tableRow.click();
        log('  Clicou na linha da tabela');
      } else {
        log('  Nenhuma venda disponível para selecionar');
      }
    } else {
      await btnSelecionar.click();
      log('  Clicou em Selecionar');
      vendaSelecionada = true;
    }

    await page.waitForTimeout(1000);
    await ss(page, '07-step2-itens');

    // Verifica botões +/-
    const btnMais = page.locator('button:has-text("+"), button[aria-label*="aumentar"], button[aria-label*="mais"]');
    const btnMenos = page.locator('button:has-text("-"), button[aria-label*="diminuir"], button[aria-label*="menos"]');
    const maisCount = await btnMais.count();
    const menosCount = await btnMenos.count();
    log(`TESTE 2: Botões + encontrados: ${maisCount} | Botões - encontrados: ${menosCount}`);

    if (maisCount > 0) {
      // Pega o total antes
      const totalBefore = await page.locator('[data-testid="total"], .total').first().textContent().catch(() => '?');
      log(`  Total antes: ${totalBefore}`);

      // Clica em + no primeiro item
      await btnMais.first().click();
      await page.waitForTimeout(500);
      await ss(page, '08-step2-apos-mais');
      const totalAfter = await page.locator('[data-testid="total"], .total').first().textContent().catch(() => '?');
      log(`  Total depois de +: ${totalAfter}`);
      log(`  Total mudou: ${totalBefore !== totalAfter}`);
    }

    if (menosCount > 0) {
      await btnMenos.first().click();
      await page.waitForTimeout(500);
      await ss(page, '09-step2-apos-menos');
    }

    vendaSelecionada = true;
  } catch (e) {
    log(`TESTE 2 ERRO: ${e.message}`);
    await ss(page, '07-erro-step2');
  }

  // ===== TESTE 4b: ESCAPE NO STEP 2 =====
  log('\n=== TESTE 4b: ESCAPE NO STEP 2 ===');
  try {
    const modalAberto = await page.locator('[role="dialog"], .modal, [data-modal]').isVisible().catch(() => false);
    if (modalAberto && vendaSelecionada) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await ss(page, '04b-escape-step2');
      const fechado = await page.locator('[role="dialog"], .modal, [data-modal]').isVisible().catch(() => false);
      log(`TESTE 4b: Modal fechado após Escape no step 2: ${!fechado}`);
    } else {
      log('TESTE 4b: pulado (modal não estava no step 2)');
    }
  } catch (e) {
    log(`TESTE 4b ERRO: ${e.message}`);
  }

  // ===== VOLTAR AO FLUXO: REABRE E CHEGA NO STEP 3 =====
  log('\n=== REABRINDO PARA STEP 3 ===');
  try {
    // Garante que o modal está fechado e reabre
    const modalStatus = await page.locator('[role="dialog"], .modal').isVisible().catch(() => false);
    if (!modalStatus) {
      await page.click('button:has-text("Nova Devolução")');
      await page.waitForTimeout(800);
    }

    // Se ainda no step 1, seleciona uma venda
    await page.waitForTimeout(500);
    await ss(page, '10-step1-para-step3');

    const btnSel = page.locator('button:has-text("Selecionar"), button:has-text("Usar"), tr button').first();
    const selVis = await btnSel.isVisible().catch(() => false);
    if (selVis) {
      await btnSel.click();
      await page.waitForTimeout(800);
    }

    // Agora deve estar no step 2 — avança para step 3
    await ss(page, '11-step2-antes-avancar');

    // Procura botão para avançar (Próximo, Continuar, etc)
    const btnProximo = page.locator('button:has-text("Próximo"), button:has-text("Continuar"), button:has-text("Avançar"), button:has-text("próximo")');
    const btnCount = await btnProximo.count();
    log(`Botões de avanço encontrados: ${btnCount}`);

    if (btnCount > 0) {
      await btnProximo.first().click();
      await page.waitForTimeout(800);
      await ss(page, '12-step3-credito');

      // ===== TESTE 3: STEP 3 — 5 botões de crédito =====
      log('\n=== TESTE 3: STEP 3 — botões de crédito ===');
      const btnDinheiro = await page.locator('button:has-text("Dinheiro"), [data-forma="dinheiro"]').isVisible().catch(() => false);
      const btnPix = await page.locator('button:has-text("PIX"), button:has-text("Pix"), [data-forma="pix"]').isVisible().catch(() => false);
      const btnDebito = await page.locator('button:has-text("Débito"), button:has-text("Debito"), [data-forma="debito"]').isVisible().catch(() => false);
      const btnCredito = await page.locator('button:has-text("Crédito"), button:has-text("Credito"), [data-forma="credito"]').isVisible().catch(() => false);
      const btnSemReemb = await page.locator('button:has-text("Sem reembolso"), button:has-text("Sem Reembolso"), [data-forma="sem_reembolso"]').isVisible().catch(() => false);

      log(`TESTE 3 - Dinheiro: ${btnDinheiro}`);
      log(`TESTE 3 - PIX: ${btnPix}`);
      log(`TESTE 3 - Débito: ${btnDebito}`);
      log(`TESTE 3 - Crédito: ${btnCredito}`);
      log(`TESTE 3 - Sem reembolso: ${btnSemReemb}`);

      // Verifica se está em grid 3 colunas
      const gridEl = await page.locator('.grid-cols-3, [style*="grid-template-columns"]').count();
      log(`  Grid 3 colunas detectado: ${gridEl > 0}`);

      // ===== TESTE 4c: ESCAPE NO STEP 3 =====
      log('\n=== TESTE 4c: ESCAPE NO STEP 3 ===');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await ss(page, '04c-escape-step3');
      const fechadoStep3 = await page.locator('[role="dialog"], .modal').isVisible().catch(() => false);
      log(`TESTE 4c: Modal fechado após Escape no step 3: ${!fechadoStep3}`);
    } else {
      log('TESTE 3: Botão de avanço não encontrado — verificando step atual');
      await ss(page, '12-sem-botao-avancar');
    }
  } catch (e) {
    log(`STEP 3 ERRO: ${e.message}`);
    await ss(page, '12-erro-step3');
  }

  // ===== TESTE 6: FLUXO COMPLETO =====
  log('\n=== TESTE 6: FLUXO COMPLETO ===');
  try {
    // Garante modal fechado
    const mStatus = await page.locator('[role="dialog"], .modal').isVisible().catch(() => false);
    if (!mStatus) {
      await page.click('button:has-text("Nova Devolução")');
      await page.waitForTimeout(800);
    }

    await ss(page, '13-fluxo-step1');

    // Seleciona primeira venda
    const btnSel2 = page.locator('button:has-text("Selecionar"), button:has-text("Usar"), tr button').first();
    const selVis2 = await btnSel2.isVisible().catch(() => false);
    if (selVis2) {
      await btnSel2.click();
      await page.waitForTimeout(800);
    }
    await ss(page, '14-fluxo-step2');

    // Avança para step 3
    const btnNext = page.locator('button:has-text("Próximo"), button:has-text("Continuar"), button:has-text("Avançar")').first();
    if (await btnNext.isVisible().catch(() => false)) {
      await btnNext.click();
      await page.waitForTimeout(800);
    }
    await ss(page, '15-fluxo-step3');

    // Seleciona forma de reembolso
    const btnDinheiro2 = page.locator('button:has-text("Dinheiro")').first();
    if (await btnDinheiro2.isVisible().catch(() => false)) {
      await btnDinheiro2.click();
      await page.waitForTimeout(500);
      log('  Selecionou forma: Dinheiro');
    }

    // Preenche motivo
    const inputMotivo = page.locator('textarea, input[placeholder*="motivo"], input[name="motivo"]').first();
    if (await inputMotivo.isVisible().catch(() => false)) {
      await inputMotivo.fill('Teste automatizado');
      log('  Preencheu motivo: Teste automatizado');
    }
    await ss(page, '16-fluxo-antes-confirmar');

    // Clica em Confirmar
    const btnConfirmar = page.locator('button:has-text("Confirmar"), button:has-text("Salvar"), button[type="submit"]').last();
    if (await btnConfirmar.isVisible().catch(() => false)) {
      await btnConfirmar.click();
      await page.waitForTimeout(2000);
    }
    await ss(page, '17-fluxo-apos-confirmar');

    // Verifica toast verde
    const toast = page.locator('[role="status"], .toast, .alert, [class*="toast"], [class*="success"], [class*="green"]');
    const toastText = await toast.first().textContent().catch(() => '(sem toast visível)');
    log(`TESTE 6: Toast após confirmar: "${toastText}"`);

  } catch (e) {
    log(`TESTE 6 ERRO: ${e.message}`);
    await ss(page, '17-erro-fluxo-completo');
  }

  // ===== TESTE 7: MODAL DETALHE =====
  log('\n=== TESTE 7: MODAL DETALHE ===');
  try {
    await page.goto(BASE + '/painel/devolucoes');
    await page.waitForTimeout(2000);
    await ss(page, '18-lista-pos-devolucao');

    const btnVer = page.locator('button:has-text("Ver"), a:has-text("Ver"), button:has-text("Detalhe"), [aria-label*="detalhe"]').first();
    if (await btnVer.isVisible().catch(() => false)) {
      await btnVer.click();
      await page.waitForTimeout(800);
      await ss(page, '19-modal-detalhe');

      // Verifica conteúdo do modal
      const modalContent = await page.locator('[role="dialog"], .modal').textContent().catch(() => '');
      const temCliente = modalContent.includes('—') ? false : true;
      const temMotivo = modalContent.toLowerCase().includes('motivo');
      const temItens = modalContent.toLowerCase().includes('item') || modalContent.toLowerCase().includes('produto');

      log(`TESTE 7: Modal detalhe aberto: SIM`);
      log(`  Tem itens: ${temItens}`);
      log(`  Tem motivo: ${temMotivo}`);
      log(`  Conteúdo tem "—" (valores vazios): ${modalContent.includes('—')}`);
      log(`  Trecho do conteúdo: ${modalContent.slice(0, 200).replace(/\n/g, ' ')}`);
    } else {
      log('TESTE 7: Botão "Ver" não encontrado na lista');
      await ss(page, '19-sem-botao-ver');
    }
  } catch (e) {
    log(`TESTE 7 ERRO: ${e.message}`);
    await ss(page, '19-erro-modal-detalhe');
  }

  // ===== TESTE 8: FILTRO DE DATA =====
  log('\n=== TESTE 8: FILTRO DE DATA ===');
  try {
    await page.goto(BASE + '/painel/devolucoes');
    await page.waitForTimeout(2000);

    // Pega a URL atual
    const urlAntes = page.url();
    log(`URL antes do filtro: ${urlAntes}`);

    // Procura input de data "De"
    const inputDe = page.locator('input[type="date"]:first-of-type, input[name="de"], input[name="data_inicio"], input[placeholder*="De"], input[placeholder*="de"]').first();
    if (await inputDe.isVisible().catch(() => false)) {
      // Ontem
      const hoje = new Date();
      const ontem = new Date(hoje);
      ontem.setDate(hoje.getDate() - 1);
      const ontemStr = ontem.toISOString().split('T')[0]; // YYYY-MM-DD

      await inputDe.fill(ontemStr);
      log(`  Data "De" preenchida: ${ontemStr}`);
      await ss(page, '20-filtro-data-preenchido');

      // Clica em Filtrar
      const btnFiltrar = page.locator('button:has-text("Filtrar"), button:has-text("Buscar"), button[type="submit"]').first();
      if (await btnFiltrar.isVisible().catch(() => false)) {
        await btnFiltrar.click();
        await page.waitForTimeout(1500);
        await ss(page, '21-filtro-data-resultado');
        const urlDepois = page.url();
        log(`URL depois do filtro: ${urlDepois}`);
        log(`TESTE 8: URL mudou: ${urlAntes !== urlDepois}`);
      } else {
        log('TESTE 8: Botão Filtrar não encontrado');
      }
    } else {
      log('TESTE 8: Input de data "De" não encontrado');
      await ss(page, '20-sem-filtro-data');
    }
  } catch (e) {
    log(`TESTE 8 ERRO: ${e.message}`);
    await ss(page, '21-erro-filtro');
  }

  await browser.close();

  log('\n========== RESUMO ==========');
  results.forEach(r => console.log(r));

  // Salva relatório
  fs.writeFileSync(path.join(OUT, 'relatorio.txt'), results.join('\n'), 'utf8');
  console.log(`\nRelatório salvo em ${OUT}/relatorio.txt`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
