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

  // Navega fresh na operação
  await page.goto('http://localhost:3333/painel/pdv/operacao');
  await page.waitForTimeout(2500);

  const saldo = await page.locator('.text-cyan-600').first().textContent().catch(() => 'N/A');
  const totalVendas = await page.locator('.text-green-600').first().textContent().catch(() => 'N/A');
  console.log('Saldo em Caixa:', saldo);
  console.log('Total Vendas:', totalVendas);

  // Abre reforço pra ver histórico
  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/saldo-atualizado.png' });
  console.log('OK');
  await browser.close();
})();
