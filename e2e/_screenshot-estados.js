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

  // Estado: fechado=1 com caixa fechado no banco
  await page.goto('http://localhost:3333/painel/pdv/operacao?fechado=1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/estado-fechado-banner.png' });

  // Estado: aberto=1 com caixa aberto no banco
  await page.goto('http://localhost:3333/painel/pdv/operacao?aberto=1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/estado-aberto-banner.png' });

  console.log('OK');
  await browser.close();
})();
