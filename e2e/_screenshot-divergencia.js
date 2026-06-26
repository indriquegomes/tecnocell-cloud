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
  await page.waitForTimeout(1200);
  await page.goto('http://localhost:3333/painel/pdv/operacao');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Fechar Caixa")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Prosseguir com Fechamento")');
  await page.waitForTimeout(500);
  // digita valor baixo
  const input = page.locator('input[name="valor_fechamento"]');
  await input.fill('200');
  await input.dispatchEvent('input');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/divergencia-alerta.png', fullPage: false });
  console.log('OK');
  await browser.close();
})();
