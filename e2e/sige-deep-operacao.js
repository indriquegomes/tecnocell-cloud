const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/operacao-deep';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let idx = 0;
const shot = async (page, name) => {
  const file = path.join(OUT, `${String(idx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('SCREENSHOT:', name);
  return file;
};

const report = { cards: [], operacoes: {}, network: [], saldo_formula: null };
const networkReqs = [];

async function textoBody(page, n = 50) {
  return (await page.locator('body').innerText()).split('\n').filter(l => l.trim()).slice(0, n);
}

async function getInputsDetalhado(page) {
  const els = await page.locator('input, select, textarea').all();
  const result = [];
  for (const el of els) {
    try {
      const visible = await el.isVisible();
      const tag = await el.evaluate(e => e.tagName.toLowerCase());
      const id = await el.getAttribute('id').catch(() => '');
      const name = await el.getAttribute('name').catch(() => '');
      const type = await el.getAttribute('type').catch(() => '');
      const placeholder = await el.getAttribute('placeholder').catch(() => '');
      const value = await el.inputValue().catch(() => '');
      const required = await el.getAttribute('required').catch(() => null);
      const disabled = await el.isDisabled().catch(() => false);
      let options = [];
      if (tag === 'select') {
        options = await el.locator('option').allTextContents().catch(() => []);
      }
      result.push({ tag, id, name, type, placeholder, value, required: required !== null, disabled, visible, options });
    } catch (e) {
      // skip
    }
  }
  return result;
}

async function getBotoes(page) {
  const btns = await page.locator('button, a.btn, input[type=submit], input[type=button], [class*="btn"]').all();
  const result = [];
  for (const btn of btns) {
    try {
      const visible = await btn.isVisible();
      if (!visible) continue;
      const text = (await btn.innerText().catch(() => '')).trim();
      const id = await btn.getAttribute('id').catch(() => '');
      const cls = (await btn.getAttribute('class').catch(() => '')).slice(0, 80);
      const onclick = await btn.getAttribute('onclick').catch(() => '');
      const ngClick = await btn.getAttribute('ng-click').catch(() => '');
      result.push({ text, id, cls, onclick: onclick || ngClick });
    } catch (e) {
      // skip
    }
  }
  return result.filter(b => b.text || b.id);
}

async function getTableData(page) {
  const tables = await page.locator('table').all();
  const result = [];
  for (const tbl of tables) {
    try {
      const visible = await tbl.isVisible();
      if (!visible) continue;
      const headers = (await tbl.locator('th').allTextContents()).map(t => t.trim()).filter(Boolean);
      const rows = await tbl.locator('tbody tr').all();
      const rowData = [];
      for (const row of rows.slice(0, 20)) {
        const cells = (await row.locator('td').allTextContents()).map(t => t.trim());
        rowData.push(cells);
      }
      result.push({ headers, rows: rowData, totalRows: rows.length });
    } catch (e) {
      // skip
    }
  }
  return result;
}

async function capturarHTML(page, selector) {
  try {
    const el = page.locator(selector).first();
    if (await el.count() > 0) {
      return await el.evaluate(e => e.outerHTML);
    }
  } catch (e) {}
  return '';
}

async function fecharModal(page) {
  const closers = [
    'button.close',
    '[data-dismiss="modal"]',
    '.modal-header .close',
    '[ng-click*="fechar"]',
    '[ng-click*="Fechar"]',
    '[ng-click*="cancel"]',
    '.btn-danger:has-text("Cancelar")',
    'button:has-text("Cancelar")',
    'button:has-text("Fechar")',
    'button:has-text("Voltar")',
    '.close',
  ];
  for (const sel of closers) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible()) {
      await el.click({ force: true }).catch(() => {});
      await page.waitForTimeout(500);
      return true;
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // Monitorar network
  page.on('request', req => {
    if (req.resourceType() === 'xhr' || req.resourceType() === 'fetch') {
      networkReqs.push({ type: 'request', method: req.method(), url: req.url(), time: new Date().toISOString() });
    }
  });
  page.on('response', async res => {
    if (res.request().resourceType() === 'xhr' || res.request().resourceType() === 'fetch') {
      let body = '';
      try { body = (await res.text()).slice(0, 500); } catch (e) {}
      networkReqs.push({ type: 'response', status: res.status(), url: res.url(), body });
    }
  });

  // LOGIN
  console.log('\n=== LOGIN ===');
  await page.goto('https://app.sigecloud.com.br/Login.aspx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.fill('#txtEmail', 'indrique@hotmail.com');
  await page.fill('#txtPass', '21#04#2008@@');
  await page.click('#btnEntrar');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  console.log('Login OK. URL:', page.url());

  // NAVEGAR PARA OPERAÇÕES PDV
  console.log('\n=== NAVEGANDO PARA OperacoesPDV ===');
  await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  console.log('URL atual:', page.url());

  await shot(page, 'operacoes-pdv-fullpage');

  // Capturar texto completo da página
  const textoCompleto = await page.locator('body').innerText();
  fs.writeFileSync(path.join(OUT, 'pagina-texto-completo.txt'), textoCompleto);
  console.log('Texto da página salvo.');

  // HTML completo
  const htmlCompleto = await page.content();
  fs.writeFileSync(path.join(OUT, 'pagina-html-completo.html'), htmlCompleto);

  // ── CARDS DA PÁGINA PRINCIPAL ──────────────────────────────────────────────
  console.log('\n=== ANALISANDO CARDS ===');

  // Tentar identificar cards/tiles
  const cardSelectors = [
    '.card', '.tile', '.panel', '.box', '.operacao-item',
    '[class*="card"]', '[class*="tile"]', '[class*="panel"]',
    '.col-md-4', '.col-sm-4', '.col-xs-12',
    '.btn-operacao', '[ng-repeat]',
  ];

  for (const sel of cardSelectors) {
    const count = await page.locator(sel).count();
    if (count > 0 && count <= 20) {
      console.log(`Selector "${sel}": ${count} elementos`);
    }
  }

  // Tentar pegar todos os elementos clicáveis principais
  const mainClickables = await page.locator('a, button').all();
  const clickableTexts = [];
  for (const el of mainClickables) {
    try {
      const vis = await el.isVisible();
      if (!vis) continue;
      const text = (await el.innerText()).trim();
      const href = await el.getAttribute('href').catch(() => '');
      const onclick = await el.getAttribute('onclick').catch(() => '');
      const ngClick = await el.getAttribute('ng-click').catch(() => '');
      if (text) clickableTexts.push({ text, href, onclick: onclick || ngClick });
    } catch (e) {}
  }
  report.cards = clickableTexts;
  console.log('Elementos clicáveis na página:', clickableTexts.map(c => c.text).join(' | '));

  // Capturar valores numéricos visíveis (saldo, totais)
  const numerosVisiveis = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    const nums = [];
    for (const el of els) {
      const txt = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.childNodes[0].textContent.trim() : '';
      if (txt && /R\$|[\d]+[,.]\d{2}/.test(txt)) {
        nums.push({ tag: el.tagName, class: el.className.slice(0, 50), text: txt });
      }
    }
    return nums.slice(0, 50);
  });
  report.valores_numericos = numerosVisiveis;
  console.log('Valores numéricos:', numerosVisiveis.map(n => n.text).join(' | '));

  // JS globals relevantes
  const jsGlobals = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k =>
      k.includes('pdv') || k.includes('PDV') || k.includes('caixa') || k.includes('Caixa') ||
      k.includes('saldo') || k.includes('Saldo') || k.includes('operacao') || k.includes('Operacao')
    );
    const result = {};
    for (const k of keys.slice(0, 20)) {
      try { result[k] = JSON.stringify(window[k]).slice(0, 200); } catch (e) { result[k] = String(window[k]).slice(0, 100); }
    }
    return result;
  });
  report.js_globals = jsGlobals;
  console.log('JS globals PDV:', JSON.stringify(jsGlobals).slice(0, 300));

  // ── 1. FECHAR CAIXA ──────────────────────────────────────────────────────
  console.log('\n=== 1. FECHAR CAIXA ===');
  const networkAntes1 = networkReqs.length;

  // Tentar clicar em "Fechar Caixa"
  const fecharCaixaBtn = page.locator(
    'a:has-text("Fechar Caixa"), button:has-text("Fechar Caixa"), ' +
    '[ng-click*="fechar"], [onclick*="fechar"], ' +
    'a:has-text("Fechar"), button:has-text("Fechar Caixa")'
  ).first();

  let fecharClicado = false;
  if (await fecharCaixaBtn.count() > 0) {
    await fecharCaixaBtn.click({ force: true });
    fecharClicado = true;
  } else {
    // Tentar por texto parcial
    const links = await page.locator('a, button').all();
    for (const lnk of links) {
      const txt = (await lnk.innerText().catch(() => '')).trim().toLowerCase();
      if (txt.includes('fechar caixa') || txt.includes('fechamento')) {
        await lnk.click({ force: true }).catch(() => {});
        fecharClicado = true;
        break;
      }
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, 'fechar-caixa-1-aberto');

  const fecharCaixaHTML = await capturarHTML(page, '.modal, .modal-dialog, [class*="modal"], [id*="modal"], .panel, form');
  fs.writeFileSync(path.join(OUT, 'fechar-caixa-html.txt'), fecharCaixaHTML);

  const fecharCaixaInputs = await getInputsDetalhado(page);
  const fecharCaixaBotoes = await getBotoes(page);
  const fecharCaixaTabelas = await getTableData(page);
  const fecharCaixaTexto = await textoBody(page, 100);

  // Capturar breakdown de saldo (linhas com R$ ou valores)
  const saldoBreakdown = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('tr, .row-item, .saldo-item, [class*="saldo"], li').forEach(el => {
      const txt = el.innerText.trim();
      if (txt && (txt.includes('R$') || /\d+[,.]\d{2}/.test(txt))) {
        items.push(txt.replace(/\s+/g, ' ').slice(0, 200));
      }
    });
    return [...new Set(items)].slice(0, 30);
  });

  report.operacoes.fechar_caixa = {
    clicado: fecharClicado,
    texto: fecharCaixaTexto,
    inputs: fecharCaixaInputs,
    botoes: fecharCaixaBotoes.map(b => b.text),
    tabelas: fecharCaixaTabelas,
    saldo_breakdown: saldoBreakdown,
    network_novos: networkReqs.slice(networkAntes1).map(r => ({ url: r.url, status: r.status })),
  };

  console.log('Fechar Caixa - texto:', fecharCaixaTexto.slice(0, 15).join(' | '));
  console.log('Fechar Caixa - inputs:', fecharCaixaInputs.filter(i => i.visible).map(i => `${i.tag}#${i.id}[${i.type}] val="${i.value}" req=${i.required}`).join('\n  '));
  console.log('Fechar Caixa - botões:', fecharCaixaBotoes.map(b => b.text).join(' | '));
  console.log('Fechar Caixa - saldo breakdown:', saldoBreakdown.join(' | '));

  await shot(page, 'fechar-caixa-2-detalhe');

  // Dados do operador e data de abertura
  const operadorInfo = await page.evaluate(() => {
    const body = document.body.innerText;
    const lines = body.split('\n').filter(l => l.trim());
    return lines.filter(l =>
      l.toLowerCase().includes('operador') ||
      l.toLowerCase().includes('abertura') ||
      l.toLowerCase().includes('usuário') ||
      l.toLowerCase().includes('usuario') ||
      l.toLowerCase().includes('data') ||
      l.toLowerCase().includes('hora')
    ).slice(0, 10);
  });
  report.operacoes.fechar_caixa.operador_data = operadorInfo;
  console.log('Fechar Caixa - operador/data:', operadorInfo.join(' | '));

  await fecharModal(page);
  await page.waitForTimeout(1000);

  // Voltar para a página de operações se necessário
  const urlAtual = page.url();
  if (!urlAtual.includes('OperacoesPDV')) {
    await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  // ── 2. REFORÇAR CAIXA ──────────────────────────────────────────────────────
  console.log('\n=== 2. REFORÇAR CAIXA ===');
  const networkAntes2 = networkReqs.length;

  const reforcarBtn = page.locator(
    'a:has-text("Reforç"), button:has-text("Reforç"), ' +
    'a:has-text("Reforcar"), button:has-text("Reforcar"), ' +
    '[onclick*="refor"], [ng-click*="refor"]'
  ).first();

  let reforcarClicado = false;
  if (await reforcarBtn.count() > 0) {
    await reforcarBtn.click({ force: true });
    reforcarClicado = true;
  } else {
    const links = await page.locator('a, button').all();
    for (const lnk of links) {
      const txt = (await lnk.innerText().catch(() => '')).trim().toLowerCase();
      if (txt.includes('refor')) {
        await lnk.click({ force: true }).catch(() => {});
        reforcarClicado = true;
        break;
      }
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, 'reforcar-caixa-1-aberto');

  const reforcarHTML = await capturarHTML(page, '.modal, .modal-dialog, form, [class*="modal"]');
  fs.writeFileSync(path.join(OUT, 'reforcar-caixa-html.txt'), reforcarHTML);

  const reforcarInputs = await getInputsDetalhado(page);
  const reforcarBotoes = await getBotoes(page);
  const reforcarTabelas = await getTableData(page);
  const reforcarTexto = await textoBody(page, 60);

  // Capturar opções do select de forma de pagamento
  const formaPgtoOpcoes = [];
  for (const inp of reforcarInputs) {
    if (inp.tag === 'select' && inp.options.length > 0) {
      formaPgtoOpcoes.push({ id: inp.id, name: inp.name, options: inp.options });
    }
  }

  report.operacoes.reforcar_caixa = {
    clicado: reforcarClicado,
    texto: reforcarTexto,
    inputs: reforcarInputs.filter(i => i.visible),
    botoes: reforcarBotoes.map(b => b.text),
    tabelas: reforcarTabelas,
    selects_forma_pgto: formaPgtoOpcoes,
    network_novos: networkReqs.slice(networkAntes2).map(r => ({ url: r.url, status: r.status })),
  };

  console.log('Reforçar - texto:', reforcarTexto.slice(0, 10).join(' | '));
  console.log('Reforçar - inputs:', reforcarInputs.filter(i => i.visible).map(i => `${i.tag}#${i.id} val="${i.value}" req=${i.required}`).join(' | '));
  console.log('Reforçar - selects:', formaPgtoOpcoes.map(s => `${s.id}: [${s.options.join(', ')}]`).join(' | '));
  console.log('Reforçar - botões:', reforcarBotoes.map(b => b.text).join(' | '));
  console.log('Reforçar - tabelas:', reforcarTabelas.map(t => `headers=[${t.headers.join(', ')}] rows=${t.totalRows}`).join(' | '));

  await shot(page, 'reforcar-caixa-2-detalhe');
  await fecharModal(page);
  await page.waitForTimeout(1000);

  // Voltar para operações
  if (!page.url().includes('OperacoesPDV')) {
    await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  // ── 3. RETIRADA (SANGRIA) ──────────────────────────────────────────────────
  console.log('\n=== 3. RETIRADA (SANGRIA) ===');
  const networkAntes3 = networkReqs.length;

  const retiradaBtn = page.locator(
    'a:has-text("Retirada"), button:has-text("Retirada"), ' +
    'a:has-text("Sangria"), button:has-text("Sangria"), ' +
    '[onclick*="retirada"], [ng-click*="retirada"], ' +
    '[onclick*="sangria"], [ng-click*="sangria"]'
  ).first();

  let retiradaClicado = false;
  if (await retiradaBtn.count() > 0) {
    await retiradaBtn.click({ force: true });
    retiradaClicado = true;
  } else {
    const links = await page.locator('a, button').all();
    for (const lnk of links) {
      const txt = (await lnk.innerText().catch(() => '')).trim().toLowerCase();
      if (txt.includes('retirada') || txt.includes('sangria')) {
        await lnk.click({ force: true }).catch(() => {});
        retiradaClicado = true;
        break;
      }
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, 'retirada-1-aberto');

  const retiradaHTML = await capturarHTML(page, '.modal, .modal-dialog, form, [class*="modal"]');
  fs.writeFileSync(path.join(OUT, 'retirada-html.txt'), retiradaHTML);

  const retiradaInputs = await getInputsDetalhado(page);
  const retiradaBotoes = await getBotoes(page);
  const retiradaTabelas = await getTableData(page);
  const retiradaTexto = await textoBody(page, 60);

  const retiradaSelects = retiradaInputs.filter(i => i.tag === 'select' && i.options.length > 0)
    .map(s => ({ id: s.id, name: s.name, options: s.options }));

  // Diferenças em relação ao Reforço
  const difsRetiradaVsReforco = [];
  const reforcarIds = new Set(report.operacoes.reforcar_caixa.inputs.map(i => i.id).filter(Boolean));
  for (const inp of retiradaInputs.filter(i => i.visible)) {
    if (inp.id && !reforcarIds.has(inp.id)) {
      difsRetiradaVsReforco.push(`NOVO: ${inp.tag}#${inp.id}`);
    }
  }

  report.operacoes.retirada = {
    clicado: retiradaClicado,
    texto: retiradaTexto,
    inputs: retiradaInputs.filter(i => i.visible),
    botoes: retiradaBotoes.map(b => b.text),
    tabelas: retiradaTabelas,
    selects: retiradaSelects,
    diferencas_vs_reforco: difsRetiradaVsReforco,
    network_novos: networkReqs.slice(networkAntes3).map(r => ({ url: r.url, status: r.status })),
  };

  console.log('Retirada - texto:', retiradaTexto.slice(0, 10).join(' | '));
  console.log('Retirada - inputs:', retiradaInputs.filter(i => i.visible).map(i => `${i.tag}#${i.id} req=${i.required}`).join(' | '));
  console.log('Retirada - selects:', retiradaSelects.map(s => `${s.id}: [${s.options.join(', ')}]`).join(' | '));
  console.log('Retirada - difs vs reforco:', difsRetiradaVsReforco.join(' | ') || 'nenhuma');

  await shot(page, 'retirada-2-detalhe');
  await fecharModal(page);
  await page.waitForTimeout(1000);

  // Voltar para operações
  if (!page.url().includes('OperacoesPDV')) {
    await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  // ── 4. DEVOLUÇÃO DE MERCADORIA ─────────────────────────────────────────────
  console.log('\n=== 4. DEVOLUÇÃO DE MERCADORIA ===');
  const networkAntes4 = networkReqs.length;

  const devolucaoBtn = page.locator(
    'a:has-text("Devolu"), button:has-text("Devolu"), ' +
    '[onclick*="devolu"], [ng-click*="devolu"]'
  ).first();

  let devolucaoClicado = false;
  if (await devolucaoBtn.count() > 0) {
    await devolucaoBtn.click({ force: true });
    devolucaoClicado = true;
  } else {
    const links = await page.locator('a, button').all();
    for (const lnk of links) {
      const txt = (await lnk.innerText().catch(() => '')).trim().toLowerCase();
      if (txt.includes('devolu') || txt.includes('retorno') || txt.includes('estorno')) {
        await lnk.click({ force: true }).catch(() => {});
        devolucaoClicado = true;
        break;
      }
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, 'devolucao-1-aberto');

  const devolucaoHTML = await capturarHTML(page, '.modal, .modal-dialog, form, [class*="modal"]');
  fs.writeFileSync(path.join(OUT, 'devolucao-html.txt'), devolucaoHTML);

  const devolucaoInputs = await getInputsDetalhado(page);
  const devolucaoBotoes = await getBotoes(page);
  const devolucaoTabelas = await getTableData(page);
  const devolucaoTexto = await textoBody(page, 60);

  // Verificar se busca por produto ou código de venda
  const buscarPorVenda = devolucaoInputs.some(i =>
    i.placeholder?.toLowerCase().includes('venda') ||
    i.id?.toLowerCase().includes('venda') ||
    i.name?.toLowerCase().includes('venda')
  );
  const buscarPorProduto = devolucaoInputs.some(i =>
    i.placeholder?.toLowerCase().includes('produto') ||
    i.id?.toLowerCase().includes('produto') ||
    i.name?.toLowerCase().includes('produto')
  );

  report.operacoes.devolucao = {
    clicado: devolucaoClicado,
    texto: devolucaoTexto,
    inputs: devolucaoInputs.filter(i => i.visible),
    botoes: devolucaoBotoes.map(b => b.text),
    tabelas: devolucaoTabelas,
    busca_por_venda: buscarPorVenda,
    busca_por_produto: buscarPorProduto,
    network_novos: networkReqs.slice(networkAntes4).map(r => ({ url: r.url, status: r.status })),
  };

  console.log('Devolução - texto:', devolucaoTexto.slice(0, 10).join(' | '));
  console.log('Devolução - inputs:', devolucaoInputs.filter(i => i.visible).map(i => `${i.tag}#${i.id}[${i.type}] ph="${i.placeholder}"`).join(' | '));
  console.log('Devolução - busca por venda?', buscarPorVenda, '| por produto?', buscarPorProduto);
  console.log('Devolução - botões:', devolucaoBotoes.map(b => b.text).join(' | '));

  await shot(page, 'devolucao-2-detalhe');
  await fecharModal(page);
  await page.waitForTimeout(1000);

  // Voltar para operações
  if (!page.url().includes('OperacoesPDV')) {
    await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }

  // ── 5. SALDO EM CAIXA ─────────────────────────────────────────────────────
  console.log('\n=== 5. SALDO EM CAIXA ===');
  const networkAntes5 = networkReqs.length;

  const saldoBtn = page.locator(
    'a:has-text("Saldo"), button:has-text("Saldo"), ' +
    '[onclick*="saldo"], [ng-click*="saldo"]'
  ).first();

  let saldoClicado = false;
  if (await saldoBtn.count() > 0) {
    await saldoBtn.click({ force: true });
    saldoClicado = true;
  } else {
    const links = await page.locator('a, button').all();
    for (const lnk of links) {
      const txt = (await lnk.innerText().catch(() => '')).trim().toLowerCase();
      if (txt.includes('saldo') || txt.includes('consultar caixa')) {
        await lnk.click({ force: true }).catch(() => {});
        saldoClicado = true;
        break;
      }
    }
  }

  await page.waitForTimeout(3000);
  await shot(page, 'saldo-caixa-1-aberto');

  const saldoHTML = await capturarHTML(page, '.modal, .modal-dialog, form, [class*="modal"], body');
  fs.writeFileSync(path.join(OUT, 'saldo-caixa-html.txt'), saldoHTML.slice(0, 50000));

  const saldoTexto = await textoBody(page, 100);
  const saldoTabelas = await getTableData(page);

  // Capturar TODA a fórmula do saldo (linhas com R$, totais, etc.)
  const saldoFormula = await page.evaluate(() => {
    const items = [];
    const allEls = document.querySelectorAll('tr, li, p, div, span, td, h1, h2, h3, h4, h5');
    for (const el of allEls) {
      if (el.children.length > 2) continue; // skip containers
      const txt = el.innerText?.trim().replace(/\s+/g, ' ');
      if (!txt) continue;
      if (txt.includes('R$') || /[\d]+[,.]\d{2}/.test(txt) ||
          txt.toLowerCase().includes('abertura') ||
          txt.toLowerCase().includes('venda') ||
          txt.toLowerCase().includes('crediário') ||
          txt.toLowerCase().includes('reforço') ||
          txt.toLowerCase().includes('retirada') ||
          txt.toLowerCase().includes('devolução') ||
          txt.toLowerCase().includes('total') ||
          txt.toLowerCase().includes('saldo')) {
        items.push(txt.slice(0, 300));
      }
    }
    return [...new Set(items)].slice(0, 50);
  });

  report.operacoes.saldo_caixa = {
    clicado: saldoClicado,
    texto: saldoTexto,
    tabelas: saldoTabelas,
    formula_saldo: saldoFormula,
    network_novos: networkReqs.slice(networkAntes5).map(r => ({ url: r.url, status: r.status })),
  };
  report.saldo_formula = saldoFormula;

  console.log('Saldo - fórmula:', saldoFormula.join('\n  '));
  console.log('Saldo - tabelas:', saldoTabelas.map(t => `headers=[${t.headers.join(', ')}] rows=${t.totalRows}`).join(' | '));

  await shot(page, 'saldo-caixa-2-detalhe');

  // Screenshot extra de cada detalhe visível
  await page.waitForTimeout(1000);
  await shot(page, 'saldo-caixa-3-full');

  await fecharModal(page);
  await page.waitForTimeout(1000);

  // ── SCREENSHOT FINAL DA PÁGINA ──────────────────────────────────────────────
  if (!page.url().includes('OperacoesPDV')) {
    await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
  }
  await shot(page, 'estado-final');

  // ── SALVAR REPORT ─────────────────────────────────────────────────────────
  report.network_total = networkReqs.slice(0, 50);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

  // Gerar report.txt legível
  let txt = '=== REPORT OPERAÇÕES PDV SIGE ===\n';
  txt += `Data: ${new Date().toISOString()}\n\n`;

  txt += '--- PÁGINA PRINCIPAL ---\n';
  txt += 'Elementos clicáveis:\n';
  for (const c of report.cards) {
    txt += `  [${c.text}] href="${c.href}" onclick="${c.onclick}"\n`;
  }
  txt += '\nValores numéricos visíveis:\n';
  for (const v of report.valores_numericos || []) {
    txt += `  ${v.tag}.${v.class}: ${v.text}\n`;
  }

  txt += '\n--- 1. FECHAR CAIXA ---\n';
  txt += `Clicado: ${report.operacoes.fechar_caixa?.clicado}\n`;
  txt += `Texto: ${(report.operacoes.fechar_caixa?.texto || []).join('\n  ')}\n`;
  txt += `Inputs:\n${(report.operacoes.fechar_caixa?.inputs || []).filter(i=>i.visible).map(i=>`  ${i.tag}#${i.id}[${i.type}] placeholder="${i.placeholder}" value="${i.value}" required=${i.required}`).join('\n')}\n`;
  txt += `Botões: ${(report.operacoes.fechar_caixa?.botoes || []).join(' | ')}\n`;
  txt += `Saldo breakdown:\n  ${(report.operacoes.fechar_caixa?.saldo_breakdown || []).join('\n  ')}\n`;
  txt += `Operador/Data:\n  ${(report.operacoes.fechar_caixa?.operador_data || []).join('\n  ')}\n`;

  txt += '\n--- 2. REFORÇAR CAIXA ---\n';
  txt += `Clicado: ${report.operacoes.reforcar_caixa?.clicado}\n`;
  txt += `Texto: ${(report.operacoes.reforcar_caixa?.texto || []).join('\n  ')}\n`;
  txt += `Inputs:\n${(report.operacoes.reforcar_caixa?.inputs || []).map(i=>`  ${i.tag}#${i.id}[${i.type}] placeholder="${i.placeholder}" value="${i.value}" required=${i.required}`).join('\n')}\n`;
  txt += `Selects forma pagamento:\n${(report.operacoes.reforcar_caixa?.selects_forma_pgto || []).map(s=>`  #${s.id}: [${s.options.join(', ')}]`).join('\n')}\n`;
  txt += `Botões: ${(report.operacoes.reforcar_caixa?.botoes || []).join(' | ')}\n`;
  txt += `Tabelas:\n${(report.operacoes.reforcar_caixa?.tabelas || []).map(t=>`  headers=[${t.headers.join(', ')}] rows=${t.totalRows}\n  ${t.rows.slice(0,3).map(r=>r.join(' | ')).join('\n  ')}`).join('\n')}\n`;

  txt += '\n--- 3. RETIRADA ---\n';
  txt += `Clicado: ${report.operacoes.retirada?.clicado}\n`;
  txt += `Texto: ${(report.operacoes.retirada?.texto || []).join('\n  ')}\n`;
  txt += `Inputs:\n${(report.operacoes.retirada?.inputs || []).map(i=>`  ${i.tag}#${i.id}[${i.type}] placeholder="${i.placeholder}" required=${i.required}`).join('\n')}\n`;
  txt += `Selects:\n${(report.operacoes.retirada?.selects || []).map(s=>`  #${s.id}: [${s.options.join(', ')}]`).join('\n')}\n`;
  txt += `Diferenças vs Reforço: ${(report.operacoes.retirada?.diferencas_vs_reforco || []).join(' | ') || 'nenhuma'}\n`;

  txt += '\n--- 4. DEVOLUÇÃO DE MERCADORIA ---\n';
  txt += `Clicado: ${report.operacoes.devolucao?.clicado}\n`;
  txt += `Texto: ${(report.operacoes.devolucao?.texto || []).join('\n  ')}\n`;
  txt += `Busca por venda: ${report.operacoes.devolucao?.busca_por_venda}\n`;
  txt += `Busca por produto: ${report.operacoes.devolucao?.busca_por_produto}\n`;
  txt += `Inputs:\n${(report.operacoes.devolucao?.inputs || []).map(i=>`  ${i.tag}#${i.id}[${i.type}] placeholder="${i.placeholder}" required=${i.required}`).join('\n')}\n`;
  txt += `Botões: ${(report.operacoes.devolucao?.botoes || []).join(' | ')}\n`;

  txt += '\n--- 5. SALDO EM CAIXA ---\n';
  txt += `Clicado: ${report.operacoes.saldo_caixa?.clicado}\n`;
  txt += `Fórmula do saldo:\n${(report.operacoes.saldo_caixa?.formula_saldo || []).map(l=>`  ${l}`).join('\n')}\n`;
  txt += `Tabelas:\n${(report.operacoes.saldo_caixa?.tabelas || []).map(t=>`  headers=[${t.headers.join(', ')}]\n  ${t.rows.slice(0,5).map(r=>r.join(' | ')).join('\n  ')}`).join('\n')}\n`;

  txt += '\n--- NETWORK (principais requests) ---\n';
  for (const req of networkReqs.filter(r => r.type === 'request').slice(0, 30)) {
    txt += `  ${req.method} ${req.url}\n`;
  }

  fs.writeFileSync(path.join(OUT, 'report.txt'), txt);
  console.log('\n=== CONCLUÍDO ===');
  console.log('JSON:', path.join(OUT, 'report.json'));
  console.log('TXT:', path.join(OUT, 'report.txt'));

  await browser.close();
})().catch(e => {
  console.error('\nERRO:', e.message.slice(0, 1000));
  console.error(e.stack?.slice(0, 500));
  process.exit(1);
});
