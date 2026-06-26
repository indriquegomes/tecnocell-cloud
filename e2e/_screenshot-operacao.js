const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  await page.goto('http://localhost:3333/login');
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"], input[name="email"]', 'indrique@hotmail.com');
  await page.fill('input[type="password"], input[name="password"]', '21042008Fenix@#');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/painel**', { timeout: 10000 });
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:3333/painel/pdv/operacao');
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/operacao-tecnocell.png', fullPage: true });
  console.log('OK');
  await browser.close();
})();
