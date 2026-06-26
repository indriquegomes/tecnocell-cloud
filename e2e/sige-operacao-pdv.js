const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/operacao-pdv';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let idx = 0;
const shot = async (page, name) => {
  const file = path.join(OUT, `${String(idx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('📸', name);
};
const txt = async (page, n = 40) =>
  (await page.locator('body').innerText()).split('\n').filter(l => l.trim()).slice(0, n);
const campos = async (page) => {
  const els = await page.locator('input:visible, select:visible, textarea:visible').all();
  return Promise.all(els.map(async el => ({
    id: await el.getAttribute('id').catch(() => ''),
    name: await el.getAttribute('name').catch(() => ''),
    label: await el.getAttribute('placeholder').catch(() => ''),
    type: await el.getAttribute('type').catch(() => ''),
  })));
};

const navOp = async (page) => {
  await page.goto('https://app.sigecloud.com.br/OperacoesPDV/Edit', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
};

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 350 });
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

  // Tela principal de Operações
  await navOp(page);
  await shot(page, '00-operacoes-pdv-principal');
  console.log('TEXTO PRINCIPAL:', await txt(page, 20));

  // ─────────────────────────────────────────────────────────────
  // 1. FECHAR MEU CAIXA
  // ─────────────────────────────────────────────────────────────
  console.log('\n══ FECHAR MEU CAIXA ══');
  await navOp(page);
  try {
    await page.locator('text=/fechar.*caixa/i').first().click();
    await page.waitForTimeout(2000);
    await shot(page, '01-fechar-caixa');
    console.log('TEXTO:', await txt(page, 30));
    console.log('CAMPOS:', await campos(page));
  } catch (e) { console.log('ERRO:', e.message); }

  // ─────────────────────────────────────────────────────────────
  // 2. REFORÇAR CAIXA
  // ─────────────────────────────────────────────────────────────
  console.log('\n══ REFORÇAR CAIXA ══');
  await navOp(page);
  try {
    await page.locator('text=/refor[çc]ar/i').first().click();
    await page.waitForTimeout(2000);
    await shot(page, '02-reforcar-caixa');
    console.log('TEXTO:', await txt(page, 30));
    console.log('CAMPOS:', await campos(page));
  } catch (e) { console.log('ERRO:', e.message); }

  // ─────────────────────────────────────────────────────────────
  // 3. RETIRADA
  // ─────────────────────────────────────────────────────────────
  console.log('\n══ RETIRADA ══');
  await navOp(page);
  try {
    await page.locator('text=/^retirada$/i').first().click();
    await page.waitForTimeout(2000);
    await shot(page, '03-retirada');
    console.log('TEXTO:', await txt(page, 30));
    console.log('CAMPOS:', await campos(page));
  } catch (e) { console.log('ERRO:', e.message); }

  // ─────────────────────────────────────────────────────────────
  // 4. DEVOLUÇÃO DE MERCADORIA
  // ─────────────────────────────────────────────────────────────
  console.log('\n══ DEVOLUÇÃO DE MERCADORIA ══');
  await navOp(page);
  try {
    await page.locator('text=/devolu/i').first().click();
    await page.waitForTimeout(2000);
    await shot(page, '04-devolucao-mercadoria');
    console.log('TEXTO:', await txt(page, 40));
    console.log('CAMPOS:', await campos(page));
  } catch (e) { console.log('ERRO:', e.message); }

  // ─────────────────────────────────────────────────────────────
  // 5. SALDO EM CAIXA
  // ─────────────────────────────────────────────────────────────
  console.log('\n══ SALDO EM CAIXA ══');
  await navOp(page);
  try {
    await page.locator('text=/saldo.*caixa/i').first().click();
    await page.waitForTimeout(2000);
    await shot(page, '05-saldo-caixa');
    console.log('TEXTO:', await txt(page, 50));
    console.log('CAMPOS:', await campos(page));
  } catch (e) { console.log('ERRO:', e.message); }

  await shot(page, '06-final');
  console.log('\n✅ Investigação completa. Screenshots em:', OUT);
  await browser.close();
})();
