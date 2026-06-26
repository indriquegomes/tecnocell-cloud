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

  // Reforço 1: Dinheiro, troco, R$150
  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(500);
  await page.selectOption('select[name="forma_pagamento"]', { label: /Dinheiro/i }).catch(() => {});
  await page.fill('input[name="motivo"]', 'Troco inicial');
  await page.fill('input[name="valor"]', '150');
  await page.click('button:has-text("Registrar Reforço")');
  await page.waitForTimeout(1500);
  console.log('Reforço 1 ok');

  // Reforço 2: PIX, R$300
  await page.fill('input[name="motivo"]', 'Reposição de caixa');
  await page.fill('input[name="valor"]', '300');
  await page.click('button:has-text("Registrar Reforço")');
  await page.waitForTimeout(1500);
  console.log('Reforço 2 ok');

  // Retirada 1: Dinheiro, pagamento fornecedor, R$80
  await page.click('button:has-text("Retirada")');
  await page.waitForTimeout(500);
  await page.fill('input[name="motivo"]', 'Pagamento fornecedor');
  await page.fill('input[name="valor"]', '80');
  await page.click('button:has-text("Registrar Retirada")');
  await page.waitForTimeout(1500);
  console.log('Retirada 1 ok');

  // Screenshot final
  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollBy(0, 300));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/registros-gerados.png', fullPage: false });
  console.log('OK');
  await browser.close();
})();
