// Script focado em F8, F9, F12 — usa ArrowDown+Enter para adicionar produto
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-deep';

let idx = 30; // começa do 30 para não sobrescrever screenshots anteriores
const shot = async (page, name) => {
  const file = path.join(OUT, `${String(idx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('📸', name, file);
};

async function textoBody(page, n = 30) {
  return (await page.locator('body').innerText()).split('\n').filter(l => l.trim()).slice(0, n);
}
async function getBotoes(page) {
  return (await page.locator('button:visible, .btn-flat:visible a, a.btn:visible').allTextContents()).map(t => t.trim()).filter(Boolean);
}
async function getInputs(page) {
  const els = await page.locator('input:visible, select:visible, textarea:visible').all();
  return Promise.all(els.map(async el => ({
    id: await el.getAttribute('id').catch(() => ''),
    placeholder: await el.getAttribute('placeholder').catch(() => ''),
    type: await el.getAttribute('type').catch(() => ''),
  })));
}

const r = {};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);

  // LOGIN
  await page.goto('https://app.sigecloud.com.br/Login.aspx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('#txtEmail', 'indrique@hotmail.com');
  await page.fill('#txtPass', '21#04#2008@@');
  await page.click('#btnEntrar');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('✅ Login');

  // PDV
  await page.goto('https://app.sigecloud.com.br/pdv', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  // ADICIONA PRODUTO: seleciona no autocomplete + clica "Add. Item"
  console.log('Adicionando produto...');
  await page.click('#txtNomeProduto');
  await page.keyboard.type('Pel', { delay: 150 });
  await page.waitForTimeout(3500);

  // Seleciona via ArrowDown (2x para pular "Cadastrar Novo Produto") + Enter
  const sugCount = await page.locator('.autocomplete-suggestion').count();
  console.log('Sugestões:', sugCount);
  if (sugCount > 0) {
    const textos = await page.locator('.autocomplete-suggestion').allTextContents();
    console.log('Sugestões:', textos.slice(0, 4));
    await page.keyboard.press('ArrowDown'); // Cadastrar Novo Produto
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown'); // 1º produto real
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');     // preenche o campo
    await page.waitForTimeout(1000);
  }
  // Clica "Add. Item" para adicionar ao carrinho
  await page.locator('#btnAddItem, button:has-text("Add. Item"), button:has-text("Add Item"), a:has-text("Add")').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, 'produto-adicionado');

  const carrinhoTexto = await textoBody(page, 10);
  console.log('Carrinho:', carrinhoTexto.join(' | '));

  // ADICIONA CLIENTE
  console.log('Adicionando cliente...');
  await page.click('#txtNomeCliente');
  await page.waitForTimeout(400);
  await page.keyboard.type('Vitor', { delay: 150 });
  await page.waitForTimeout(2500);
  const cSugs = await page.locator('.autocomplete-suggestion').count();
  if (cSugs > 0) {
    await page.keyboard.press('ArrowDown'); // Cadastrar Novo Cliente
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown'); // primeiro cliente real
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
  }
  await shot(page, 'pdv-pronto');

  // VERIFICA CARRINHO
  const carrinhoFinal = await textoBody(page, 15);
  console.log('Estado final PDV:', carrinhoFinal.join(' | '));

  // ── F4 — MUDAR QUANTIDADE ───────────────────────────────────────────────
  console.log('\n=== F4 ===');
  await page.keyboard.press('F4');
  await page.waitForTimeout(1500);
  await shot(page, 'f4');
  const f4Foco = await page.evaluate(() => {
    const el = document.activeElement;
    return { id: el?.id, class: el?.className?.slice?.(0,60), tag: el?.tagName, type: el?.type };
  });
  const f4Modal = await page.locator('.modalBlue:visible, [id*=modal]:visible').count();
  r.F4 = { foco: f4Foco, modal: f4Modal > 0 };
  console.log('  F4 foco:', JSON.stringify(f4Foco));
  if (f4Modal > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ── F8 — FINALIZAR VENDA ────────────────────────────────────────────────
  console.log('\n=== F8 FINALIZAR VENDA ===');
  await page.keyboard.press('F8');
  await page.waitForTimeout(5000);
  await shot(page, 'f8-tela');
  fs.writeFileSync(path.join(OUT, 'f8-full.html'), await page.content());

  const f8Texto = await textoBody(page, 60);
  const f8Botoes = await getBotoes(page);
  const f8Inputs = await getInputs(page);
  r.F8 = { texto: f8Texto, botoes: f8Botoes, inputs: f8Inputs };
  console.log('  F8 URL:', page.url());
  console.log('  F8 Botões:', f8Botoes.join(' | '));
  console.log('  F8 Texto (10):', f8Texto.slice(0, 10).join(' | '));

  // Mapeia o que está visível
  const f8Secoes = await page.locator('[class*=pagamento], [id*=pagamento], [class*=payment], [class*=forma]').all();
  for (const sec of f8Secoes) {
    const id = await sec.getAttribute('id').catch(()=>'');
    const t = (await sec.innerText().catch(()=>'')).slice(0, 80);
    if (t.trim()) console.log(`  Seção [${id}]:`, t);
  }

  // Tenta Dinheiro (forma de pagamento)
  const dinBtn = page.locator('[ng-click*="dinheiro" i], [onclick*="dinheiro" i], button:has-text("Dinheiro"), a:has-text("Dinheiro"), img[alt*="dinheiro" i], [class*="dinheiro"]').first();
  const temDin = await dinBtn.count() > 0;
  if (temDin) {
    await dinBtn.click({ force: true }); await page.waitForTimeout(2000);
    await shot(page, 'f8-dinheiro');
    r.F8.dinheiro = { texto: await textoBody(page, 15), inputs: await getInputs(page) };
    console.log('  Dinheiro OK:', r.F8.dinheiro.inputs.map(i=>`${i.id}|${i.placeholder}`).join(' | '));
  } else {
    console.log('  Botão Dinheiro não encontrado');
    // Lista todos os clickáveis
    const clickaveis = await page.locator('[ng-click], [onclick]').all();
    for (const el of clickaveis.slice(0, 20)) {
      const ngc = await el.getAttribute('ng-click').catch(()=>'');
      const onc = await el.getAttribute('onclick').catch(()=>'');
      const t = (await el.innerText().catch(()=>'')).slice(0, 30);
      if (ngc || onc) console.log(`  Clickável: ${t} | ng-click=${ngc} | onclick=${onc}`);
    }
  }

  await shot(page, 'f8-final');
  // Volta
  await page.keyboard.press('F11');
  await page.waitForTimeout(2000);

  // ── F9 — CREDIÁRIO ─────────────────────────────────────────────────────
  console.log('\n=== F9 CREDIÁRIO ===');
  await page.keyboard.press('F9');
  await page.waitForTimeout(4000);
  await shot(page, 'f9-tela');
  fs.writeFileSync(path.join(OUT, 'f9-full.html'), await page.content());
  const f9Texto = await textoBody(page, 40);
  const f9Botoes = await getBotoes(page);
  const f9Ths = (await page.locator('th:visible').allTextContents()).filter(t=>t.trim());
  r.F9 = { texto: f9Texto, botoes: f9Botoes, colunas: f9Ths };
  console.log('  F9 URL:', page.url());
  console.log('  F9 colunas:', f9Ths.join(' | '));
  console.log('  F9 botões:', f9Botoes.join(' | '));

  // Conta linhas
  const f9Rows = await page.locator('tbody tr:visible').count().catch(()=>0);
  console.log('  F9 linhas:', f9Rows);
  if (f9Rows > 0) {
    const f9R1 = (await page.locator('tbody tr:first-child td').allTextContents()).filter(t=>t.trim());
    r.F9.primeira_linha = f9R1;
    console.log('  F9 linha 1:', f9R1.join(' | '));
    // Checkbox
    const f9Chk = page.locator('tbody tr:first-child input[type=checkbox]');
    if (await f9Chk.count() > 0) {
      await f9Chk.check({ force: true });
      await page.waitForTimeout(500);
      r.F9.botoes_pos_check = await getBotoes(page);
      await shot(page, 'f9-checkbox');
      console.log('  F9 botões pós-check:', r.F9.botoes_pos_check.join(' | '));
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  // ── F12 — SAÍDA CONSIGNADA ─────────────────────────────────────────────
  console.log('\n=== F12 SAÍDA CONSIGNADA ===');
  await page.keyboard.press('F12');
  await page.waitForTimeout(4000);
  await shot(page, 'f12-tela');
  fs.writeFileSync(path.join(OUT, 'f12-full.html'), await page.content());
  const f12Texto = await textoBody(page, 30);
  const f12Botoes = await getBotoes(page);
  r.F12 = { texto: f12Texto, botoes: f12Botoes };
  console.log('  F12 URL:', page.url());
  console.log('  F12 botões:', f12Botoes.join(' | '));
  console.log('  F12 texto:', f12Texto.slice(0, 10).join(' | '));

  // Identifica sub-opções
  const f12NgClicks = [];
  for (const el of await page.locator('[ng-click]:visible, [onclick]:visible').all()) {
    const ngc = await el.getAttribute('ng-click').catch(()=>'');
    const t = (await el.innerText().catch(()=>'')).trim().slice(0, 40);
    if (ngc && t) f12NgClicks.push(`${t} → ${ngc}`);
  }
  r.F12.opcoes = f12NgClicks;
  console.log('  F12 opções ng-click:', f12NgClicks.join(' | '));

  // Ctrl+F11
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  console.log('\n=== CTRL+F11 VENDAS ===');
  await page.keyboard.press('Control+F11');
  await page.waitForTimeout(4000);
  await shot(page, 'ctrlf11-tela');
  const cf11Ths = (await page.locator('th:visible').allTextContents()).filter(t=>t.trim());
  const cf11Btns = await getBotoes(page);
  r.CtrlF11 = { colunas: cf11Ths, botoes: cf11Btns };
  console.log('  Ctrl+F11 colunas:', cf11Ths.join(' | '));
  console.log('  Ctrl+F11 botões:', cf11Btns.join(' | '));
  // Linha 1
  const cf11R1 = (await page.locator('tbody tr:first-child td').allTextContents()).filter(t=>t.trim());
  r.CtrlF11.primeira_linha = cf11R1;
  console.log('  Ctrl+F11 linha 1:', cf11R1.join(' | '));
  if (cf11R1.length > 0) {
    await page.locator('tbody tr:first-child').click().catch(()=>{});
    await page.waitForTimeout(2000);
    await shot(page, 'ctrlf11-detalhe');
    r.CtrlF11.detalhe = { botoes: await getBotoes(page), texto: await textoBody(page, 20) };
    console.log('  Detalhe botões:', r.CtrlF11.detalhe.botoes.join(' | '));
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'analise-b2.json'), JSON.stringify(r, null, 2));
  console.log('\n✅ CONCLUÍDO. JSON:', path.join(OUT, 'analise-b2.json'));
})().catch(e => {
  console.error('\n❌ ERRO:', e.message.slice(0, 600));
  process.exit(1);
});
