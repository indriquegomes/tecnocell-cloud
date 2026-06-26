const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.goto('http://localhost:3333/login');
  await page.waitForTimeout(800);
  await page.fill('input[type="email"], input[name="email"]', 'indrique@hotmail.com');
  await page.fill('input[type="password"], input[name="password"]', '21042008Fenix@#');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:3333/painel/pdv/operacao');
  await page.waitForTimeout(2000);

  // Registra retirada também
  await page.click('button:has-text("Retirada")');
  await page.waitForTimeout(500);
  await page.fill('input[name="motivo"]', 'Pagamento fornecedor');
  await page.fill('input[name="valor"]', '50');
  await page.click('button:has-text("Registrar Retirada")');
  await page.waitForTimeout(2000);

  // Reforço adicional
  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(500);
  await page.fill('input[name="motivo"]', 'Troco inicial');
  await page.fill('input[name="valor"]', '200');
  await page.click('button:has-text("Registrar Reforço")');
  await page.waitForTimeout(2000);

  // Screenshot final com histórico
  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/reforco-retirada-ok.png' });
  console.log('OK');
  await browser.close();
})();
