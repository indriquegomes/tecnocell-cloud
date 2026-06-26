const { chromium } = require('playwright');
const fs = require('fs');
const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(20000);

  // Login
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(800);
  await page.fill('input[type="email"], input[name="email"]', 'indrique@hotmail.com');
  await page.fill('input[type="password"], input[name="password"]', '21042008Fenix@#');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Navega para Devoluções
  await page.goto('http://localhost:3000/painel/devolucoes');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/devolucoes-lista.png`, fullPage: true });
  console.log('1. Lista devoluções OK');

  // Abre modal Nova Devolução
  await page.click('button:has-text("Nova Devolução")');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/devolucoes-modal-buscar.png` });
  console.log('2. Modal aberto (step buscar) OK');

  // Verifica que o input de busca está presente e focado
  const inputBusca = page.locator('input[placeholder*="cliente"]');
  const inputVisible = await inputBusca.isVisible().catch(() => false);
  console.log('3. Input busca visível:', inputVisible);

  // Tenta buscar por venda (busca vazia = recentes)
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/devolucoes-modal-vendas.png` });
  console.log('4. Modal com lista de vendas OK');

  // Fecha com Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // PDV - botão Devoluções
  await page.goto('http://localhost:3000/painel/pdv');
  await page.waitForTimeout(2000);
  const btnDev = page.locator('button:has-text("Devolucoes"), button:has-text("Devoluções"), a:has-text("Devoluções")');
  const devVisible = await btnDev.first().isVisible().catch(() => false);
  console.log('5. Botão Devoluções no PDV visível:', devVisible);
  if (devVisible) {
    await page.screenshot({ path: `${OUT}/devolucoes-pdv-botao.png` });
  }

  await browser.close();
  console.log('\nOK - screenshots em', OUT);
})().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
