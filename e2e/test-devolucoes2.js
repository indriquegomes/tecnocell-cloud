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

async function login(page) {
  await page.goto(BASE + '/login');
  await page.waitForTimeout(600);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function abrirModal(page) {
  const modalAberto = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  if (!modalAberto) {
    await page.goto(BASE + '/painel/devolucoes');
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Nova Devolução")');
    await page.waitForTimeout(800);
  }
}

async function selecionarPrimeiraVenda(page) {
  // As vendas são clicáveis por clique na linha/div — sem botão "Selecionar"
  // Tenta clicar no primeiro item da lista de vendas dentro do modal
  const item = page.locator('[role="dialog"] >> text=#0').first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    log('  Clicou na venda via texto #0...');
    await page.waitForTimeout(800);
    return true;
  }
  // Alternativa: primeiro div clicável dentro do modal
  const divVenda = page.locator('[role="dialog"] div').filter({ hasText: /R\$\s+[\d.,]+/ }).first();
  if (await divVenda.isVisible().catch(() => false)) {
    await divVenda.click();
    log('  Clicou na venda via div com R$');
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12000);

  log('=== LOGIN ===');
  await login(page);
  log('Login OK');

  // ===== TESTE 2: step 2 — botões +/- e total =====
  log('\n=== TESTE 2: STEP 2 ===');
  await abrirModal(page);
  await ss(page, 'T2-01-modal-aberto');

  // Inspeciona o HTML do modal para entender a estrutura
  const modalHtml = await page.locator('[role="dialog"]').innerHTML().catch(() => '');
  // Salva para análise
  fs.writeFileSync(path.join(OUT, 'modal-step1-html.txt'), modalHtml.slice(0, 5000));
  log('  HTML do modal salvo em modal-step1-html.txt');

  // Tenta clicar na primeira linha da lista (clique direto no item)
  // O componente provavelmente usa onClick na div/li
  const listaItens = page.locator('[role="dialog"] >> [class*="cursor"], [role="dialog"] li, [role="dialog"] >> div[class*="hover"]');
  const itemCount = await listaItens.count();
  log(`  Itens clicáveis encontrados: ${itemCount}`);

  // Tenta clicar na venda #0034 (a primeira da lista)
  let vendaClicada = false;
  try {
    const primeiraVenda = page.locator('[role="dialog"]').locator('text=#0034').first();
    if (await primeiraVenda.isVisible().catch(() => false)) {
      await primeiraVenda.click();
      log('  Clicou em #0034');
      vendaClicada = true;
    } else {
      // Tenta pegar qualquer texto com # seguido de dígitos
      const qualquerVenda = page.locator('[role="dialog"] >> text=/^#\\d+/').first();
      if (await qualquerVenda.isVisible().catch(() => false)) {
        await qualquerVenda.click();
        log('  Clicou em venda genérica');
        vendaClicada = true;
      }
    }
  } catch (e) {
    log(`  Erro ao clicar: ${e.message}`);
  }

  await page.waitForTimeout(1000);
  await ss(page, 'T2-02-apos-click-venda');

  // Verifica se avançou para step 2
  const step2Indicador = await page.locator('[role="dialog"]').locator('text=Itens, text=itens').isVisible().catch(() => false);
  log(`  Step 2 visível (Itens): ${step2Indicador}`);

  // Inspeciona HTML do modal no estado atual
  const modal2Html = await page.locator('[role="dialog"]').innerHTML().catch(() => '');
  fs.writeFileSync(path.join(OUT, 'modal-step2-html.txt'), modal2Html.slice(0, 8000));
  log('  HTML do step atual salvo em modal-step2-html.txt');

  // Botões + e -
  const btns = await page.locator('[role="dialog"] button').allTextContents().catch(() => []);
  log(`  Botões no modal: ${JSON.stringify(btns)}`);

  const btnMais = page.locator('[role="dialog"] button').filter({ hasText: '+' });
  const btnMenos = page.locator('[role="dialog"] button').filter({ hasText: '-' });
  const cntMais = await btnMais.count();
  const cntMenos = await btnMenos.count();
  log(`  Botões +: ${cntMais} | Botões -: ${cntMenos}`);

  if (cntMais > 0) {
    // Pega texto de total antes
    const totalTexto = await page.locator('[role="dialog"]').textContent().catch(() => '');
    const matchBefore = totalTexto.match(/R\$\s*([\d.,]+)/g);
    log(`  Valores R$ antes: ${JSON.stringify(matchBefore)}`);

    await btnMais.first().click();
    await page.waitForTimeout(600);
    await ss(page, 'T2-03-apos-mais');

    const totalDepois = await page.locator('[role="dialog"]').textContent().catch(() => '');
    const matchAfter = totalDepois.match(/R\$\s*([\d.,]+)/g);
    log(`  Valores R$ depois: ${JSON.stringify(matchAfter)}`);
    log(`TESTE 2: Botão + funcionou: ${JSON.stringify(matchBefore) !== JSON.stringify(matchAfter)}`);

    // Clica em - para restaurar
    if (cntMenos > 0) {
      await btnMenos.first().click();
      await page.waitForTimeout(400);
      await ss(page, 'T2-04-apos-menos');
      log(`TESTE 2: Botão - clicado OK`);
    }
  } else {
    log('TESTE 2: Botões +/- NÃO encontrados');
  }

  // ===== TESTE 4b: ESCAPE NO STEP 2 =====
  log('\n=== TESTE 4b: ESCAPE NO STEP 2 ===');
  const mOpenStep2 = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  log(`  Modal aberto: ${mOpenStep2}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await ss(page, 'T4b-escape-step2');
  const fechadoS2 = !(await page.locator('[role="dialog"]').isVisible().catch(() => true));
  log(`TESTE 4b: Modal fechou com Escape no step 2: ${fechadoS2}`);

  // ===== AVANÇA PARA STEP 3 =====
  log('\n=== AVANÇANDO PARA STEP 3 ===');
  await abrirModal(page);
  await page.waitForTimeout(500);

  // Clica na primeira venda de novo
  try {
    const v = page.locator('[role="dialog"]').locator('text=#0034').first();
    if (await v.isVisible().catch(() => false)) {
      await v.click();
    } else {
      const v2 = page.locator('[role="dialog"]').locator('text=/^#\\d+/').first();
      await v2.click();
    }
    await page.waitForTimeout(800);
  } catch (e) {
    log(`  Erro ao clicar na venda: ${e.message}`);
  }
  await ss(page, 'T3-01-step2');

  // Procura botão de avançar para step 3
  const botoesModal = await page.locator('[role="dialog"] button').allTextContents().catch(() => []);
  log(`  Botões disponíveis: ${JSON.stringify(botoesModal)}`);

  const btnProximo = page.locator('[role="dialog"] button').filter({ hasText: /próximo|continuar|avançar|confirmar/i });
  const btnProxCount = await btnProximo.count();
  log(`  Botões de avanço: ${btnProxCount}`);

  if (btnProxCount > 0) {
    await btnProximo.first().click();
    await page.waitForTimeout(800);
    await ss(page, 'T3-02-step3');

    // ===== TESTE 3: STEP 3 — botões de crédito =====
    log('\n=== TESTE 3: STEP 3 — botões crédito ===');
    const step3Html = await page.locator('[role="dialog"]').innerHTML().catch(() => '');
    fs.writeFileSync(path.join(OUT, 'modal-step3-html.txt'), step3Html.slice(0, 8000));

    const botoesStep3 = await page.locator('[role="dialog"] button').allTextContents().catch(() => []);
    log(`  Todos os botões no step 3: ${JSON.stringify(botoesStep3)}`);

    const dinheiro = await page.locator('[role="dialog"]').locator('text=Dinheiro').isVisible().catch(() => false);
    const pix = await page.locator('[role="dialog"]').locator('text=PIX, text=Pix').first().isVisible().catch(() => false);
    const debito = await page.locator('[role="dialog"]').locator('text=Débito, text=Debito').first().isVisible().catch(() => false);
    const credito = await page.locator('[role="dialog"]').locator('text=Crédito, text=Credito').first().isVisible().catch(() => false);
    const semReemb = await page.locator('[role="dialog"]').locator('text=Sem reembolso').isVisible().catch(() => false);

    log(`TESTE 3 - Dinheiro: ${dinheiro}`);
    log(`TESTE 3 - PIX: ${pix}`);
    log(`TESTE 3 - Débito: ${debito}`);
    log(`TESTE 3 - Crédito: ${credito}`);
    log(`TESTE 3 - Sem reembolso: ${semReemb}`);

    // Verifica grid
    const gridClass = await page.locator('[role="dialog"] .grid-cols-3, [role="dialog"] .grid-cols-2').count();
    log(`  Elementos com grid-cols: ${gridClass}`);

    // ===== TESTE 4c: ESCAPE NO STEP 3 =====
    log('\n=== TESTE 4c: ESCAPE NO STEP 3 ===');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await ss(page, 'T4c-escape-step3');
    const fechadoS3 = !(await page.locator('[role="dialog"]').isVisible().catch(() => true));
    log(`TESTE 4c: Modal fechou com Escape no step 3: ${fechadoS3}`);
  } else {
    log('  Botão de avanço para step 3 NÃO encontrado');
    await ss(page, 'T3-02-sem-avancar');
  }

  // ===== TESTE 6: FLUXO COMPLETO =====
  log('\n=== TESTE 6: FLUXO COMPLETO ===');
  await abrirModal(page);
  await page.waitForTimeout(500);
  await ss(page, 'T6-01-step1');

  // Seleciona venda
  try {
    const v = page.locator('[role="dialog"]').locator('text=#0033').first();
    if (await v.isVisible().catch(() => false)) {
      await v.click();
    } else {
      const v2 = page.locator('[role="dialog"]').locator('text=/^#\\d+/').first();
      await v2.click();
    }
    await page.waitForTimeout(800);
  } catch (e) {
    log(`  Erro selecionar venda: ${e.message}`);
  }
  await ss(page, 'T6-02-step2');

  // Avança para step 3
  const bNext = page.locator('[role="dialog"] button').filter({ hasText: /próximo|continuar|avançar/i });
  if (await bNext.count() > 0) {
    await bNext.first().click();
    await page.waitForTimeout(800);
    await ss(page, 'T6-03-step3');
  }

  // Seleciona forma Dinheiro
  const btnDin = page.locator('[role="dialog"]').locator('button').filter({ hasText: 'Dinheiro' });
  if (await btnDin.isVisible().catch(() => false)) {
    await btnDin.click();
    log('  Selecionou Dinheiro');
    await page.waitForTimeout(400);
  }

  // Preenche motivo
  const textarea = page.locator('[role="dialog"] textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill('Teste automatizado');
    log('  Preencheu motivo');
  } else {
    const inputMotivo = page.locator('[role="dialog"] input[placeholder*="motivo"], [role="dialog"] input[name*="motivo"]').first();
    if (await inputMotivo.isVisible().catch(() => false)) {
      await inputMotivo.fill('Teste automatizado');
      log('  Preencheu motivo (input)');
    }
  }
  await ss(page, 'T6-04-antes-confirmar');

  // Clica em Confirmar
  const btnConf = page.locator('[role="dialog"] button').filter({ hasText: /confirmar/i }).last();
  if (await btnConf.isVisible().catch(() => false)) {
    await btnConf.click();
    log('  Clicou em Confirmar');
    await page.waitForTimeout(2500);
  }
  await ss(page, 'T6-05-apos-confirmar');

  // Verifica toast
  const bodyText = await page.locator('body').textContent().catch(() => '');
  const temToast = bodyText.toLowerCase().includes('devolução registrada') || bodyText.toLowerCase().includes('registrada') || bodyText.toLowerCase().includes('sucesso');
  log(`TESTE 6: Toast "Devolução registrada" encontrado: ${temToast}`);

  // Verifica se modal fechou
  const modalFechouFinal = !(await page.locator('[role="dialog"]').isVisible().catch(() => true));
  log(`TESTE 6: Modal fechou após confirmar: ${modalFechouFinal}`);

  // ===== TESTE 7: MODAL DETALHE (Ver) =====
  log('\n=== TESTE 7: MODAL DETALHE ===');
  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(2000);
  await ss(page, 'T7-01-lista');

  // Clica em "Ver" no primeiro item
  const btnVer = page.locator('button:has-text("Ver")').first();
  if (await btnVer.isVisible().catch(() => false)) {
    await btnVer.click();
    await page.waitForTimeout(1000);
    await ss(page, 'T7-02-modal-detalhe');

    const detalheHtml = await page.locator('[role="dialog"]').innerHTML().catch(() => '');
    fs.writeFileSync(path.join(OUT, 'modal-detalhe-html.txt'), detalheHtml.slice(0, 8000));

    const detalheText = await page.locator('[role="dialog"]').textContent().catch(() => '');
    log(`  Conteúdo do detalhe (200 chars): ${detalheText.slice(0, 200).replace(/\s+/g, ' ')}`);

    const temCliente = !detalheText.match(/^(\s*—\s*){2}/);
    const temMotivo = detalheText.toLowerCase().includes('motivo');
    const temItens = detalheText.toLowerCase().includes('produto') || detalheText.toLowerCase().includes('item') || detalheText.toLowerCase().includes('qtd') || detalheText.toLowerCase().includes('quantidade');
    const travessoes = (detalheText.match(/—/g) || []).length;

    log(`TESTE 7: Modal aberto: SIM`);
    log(`  Tem "motivo": ${temMotivo}`);
    log(`  Tem itens/produto: ${temItens}`);
    log(`  Quantidade de "—" (vazios): ${travessoes}`);
  } else {
    log('TESTE 7: Botão Ver não encontrado');
  }

  // ===== TESTE 8: FILTRO DE DATA (revisão) =====
  log('\n=== TESTE 8: FILTRO DE DATA ===');
  // Fecha modal se aberto
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.goto(BASE + '/painel/devolucoes');
  await page.waitForTimeout(1500);

  const urlAntes = page.url();
  log(`  URL antes: ${urlAntes}`);

  // Inputs de data
  const inputs = page.locator('input[type="date"]');
  const inputCount = await inputs.count();
  log(`  Inputs date encontrados: ${inputCount}`);

  if (inputCount >= 1) {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemStr = ontem.toISOString().split('T')[0];

    await inputs.first().fill(ontemStr);
    log(`  Data "De" preenchida: ${ontemStr}`);
    await ss(page, 'T8-01-data-preenchida');

    const btnFiltrar = page.locator('button:has-text("Filtrar")');
    if (await btnFiltrar.isVisible().catch(() => false)) {
      await btnFiltrar.click();
      await page.waitForTimeout(1500);
      await ss(page, 'T8-02-resultado-filtro');
      const urlDepois = page.url();
      log(`  URL depois: ${urlDepois}`);
      log(`TESTE 8: URL mudou: ${urlAntes !== urlDepois}`);

      // Verifica se os dados mudaram
      const countDev = await page.locator('table tbody tr').count();
      log(`  Devoluções visíveis após filtro: ${countDev}`);
    } else {
      log('TESTE 8: Botão Filtrar não encontrado');
    }
  } else {
    log('TESTE 8: Inputs de data não encontrados');
  }

  await browser.close();

  log('\n========== RESUMO FINAL ==========');
  fs.writeFileSync(path.join(OUT, 'relatorio2.txt'), results.join('\n'), 'utf8');
  console.log(`\nRelatório salvo em ${OUT}/relatorio2.txt`);
}

main().catch(e => {
  console.error('ERRO FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
