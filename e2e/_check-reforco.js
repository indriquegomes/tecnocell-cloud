const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
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

  await page.click('button:has-text("Reforçar Caixa")');
  await page.waitForTimeout(600);

  const caixaId = await page.locator('input[name="caixa_id"]').inputValue().catch(() => 'N/A');
  console.log('caixa_id no form:', caixaId);

  await page.fill('input[name="motivo"]', 'Teste reforço');
  await page.fill('input[name="valor"]', '100');
  await page.click('button:has-text("Registrar Reforço")');
  await page.waitForTimeout(2500);

  const feedback = await page.locator('p.text-sm.font-medium').textContent().catch(() => null);
  console.log('Feedback:', feedback);

  const saldo = await page.locator('text=Saldo em Caixa').locator('..').locator('p.text-xs').textContent().catch(() => null);
  console.log('Saldo card:', saldo);

  await page.screenshot({ path: 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots/reforco-feedback.png' });
  await browser.close();
})();
