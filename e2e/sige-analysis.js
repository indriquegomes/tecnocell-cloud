const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let shotIdx = 0;
const shot = async (page, name) => {
  const file = path.join(OUT, `${String(shotIdx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('📸', name);
};

const log = (section, ...args) => console.log(`\n[${section}]`, ...args);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  log('LOGIN');
  await page.goto('https://app.sigecloud.com.br/Login.aspx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await page.fill('#txtEmail', 'indrique@hotmail.com');
  await page.fill('#txtPass', '21#04#2008@@');
  await shot(page, 'login');

  await page.click('#btnEntrar');
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForTimeout(2000);

  console.log('URL pós-login:', page.url());
  await shot(page, 'pos-login');

  if (page.url().includes('Login')) {
    const erro = await page.locator('.erro, .error, [class*=error], [class*=alerta]').first().textContent().catch(() => '?');
    console.log('Ainda na tela de login. Possível erro:', erro);
    await browser.close(); process.exit(1);
  }

  // ── HOME / DASHBOARD ───────────────────────────────────────────────────────
  log('HOME');
  await shot(page, 'home');
  const menuLinks = await page.locator('nav a, .menu a, .menuLateral a, #menu a, [class*=menu] a').allTextContents();
  console.log('Menu:', menuLinks.filter(t => t.trim()).slice(0, 50).join(' | '));

  // ── PDV ────────────────────────────────────────────────────────────────────
  log('PDV');
  await page.goto('https://app.sigecloud.com.br/pdv', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await shot(page, 'pdv-completo');
  console.log('URL PDV:', page.url());

  // Captura texto do PDV
  const pdvTexto = await page.locator('body').innerText();
  fs.writeFileSync(path.join(OUT, 'pdv-texto.txt'), pdvTexto);

  // Captura campos, botões e labels
  const campos = await page.locator('input, select, textarea, button, label, th').allTextContents();
  console.log('Elementos PDV:', campos.filter(t => t.trim()).slice(0, 60).join(' | '));

  // Atalhos de teclado no rodapé
  const atalhos = await page.locator('body').innerText();
  const linhasAtalhos = atalhos.split('\n').filter(l => l.match(/F[0-9]|Ctrl|Shift/));
  console.log('Atalhos encontrados:', linhasAtalhos.join(' | '));

  // Seções do PDV
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'pdv-topo');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await shot(page, 'pdv-meio');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(page, 'pdv-rodape');
  await page.evaluate(() => window.scrollTo(0, 0));

  // Pressiona atalhos e captura resultados (só leitura)
  for (const [key, nome] of [['F1','consultar-produtos'],['F3','busca-orcamento'],['F9','crediario'],['F12','consignada']]) {
    try {
      await page.keyboard.press(key);
      await page.waitForTimeout(1500);
      await shot(page, `pdv-${key}-${nome}`);
      const txt = await page.locator('body').innerText();
      const linhas = txt.split('\n').filter(l => l.trim()).slice(0, 20);
      console.log(`\n${key} (${nome}):`, linhas.join(' | '));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch(e) { console.log(`${key} falhou:`, e.message.split('\n')[0]) }
  }

  // ── MÓDULOS ────────────────────────────────────────────────────────────────
  const modulos = [
    ['Dashboard', '/dashboard'],
    ['Produtos', '/produtos'],
    ['Estoque', '/estoque'],
    ['Clientes', '/clientes'],
    ['Financeiro', '/financeiro'],
    ['Compras', '/compras'],
    ['Pedidos', '/pedidos'],
    ['Relatórios', '/relatorios'],
    ['Configurações', '/configuracoes'],
    ['OS', '/os'],
    ['Vendas', '/vendas'],
    ['Consignado', '/consignado'],
    ['Comissão', '/comissao'],
    ['Caixa', '/caixa'],
  ];

  log('MÓDULOS');
  for (const [nome, url] of modulos) {
    try {
      await page.goto(`https://app.sigecloud.com.br${url}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
      const finalUrl = page.url();
      if (finalUrl.includes('Login')) { console.log(`[${nome}] → sem acesso`); continue; }
      await shot(page, `modulo-${nome.toLowerCase().replace(/\s/g,'-')}`);
      const h = await page.locator('h1, h2, h3, .titulo, [class*=titulo], [class*=title]').allTextContents();
      const ths = await page.locator('th, [class*=coluna], [class*=header]').allTextContents();
      const btnsModulo = await page.locator('button, .btn, [class*=btn]').allTextContents();
      console.log(`[${nome}] ${finalUrl}`);
      console.log(`  Títulos: ${h.filter(t=>t.trim()).slice(0,5).join(' | ')}`);
      console.log(`  Colunas: ${ths.filter(t=>t.trim()).slice(0,10).join(' | ')}`);
      console.log(`  Botões: ${btnsModulo.filter(t=>t.trim()).slice(0,10).join(' | ')}`);
    } catch(e) { console.log(`[${nome}] ERRO: ${e.message.split('\n')[0]}`) }
  }

  // ── PDV: MAIS DETALHE ──────────────────────────────────────────────────────
  log('PDV DETALHE - área de pagamentos');
  await page.goto('https://app.sigecloud.com.br/pdv', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Salva HTML completo para análise
  const html = await page.content();
  fs.writeFileSync(path.join(OUT, 'pdv-full.html'), html);
  console.log('HTML completo salvo');

  // Área de formas de pagamento
  const formasPag = await page.locator('[class*=pagamento], [class*=payment], [class*=forma]').allTextContents();
  console.log('Área pagamento:', formasPag.filter(t=>t.trim()).slice(0,20));

  // Campos de produto/busca
  const inputs = await page.locator('input[type=text], input[type=search], input[placeholder]').all();
  for (const inp of inputs) {
    const ph = await inp.getAttribute('placeholder').catch(() => '');
    const id = await inp.getAttribute('id').catch(() => '');
    const nm = await inp.getAttribute('name').catch(() => '');
    console.log(`Input: id="${id}" name="${nm}" placeholder="${ph}"`);
  }

  await browser.close();
  console.log('\n✅ Análise concluída. Screenshots em:', OUT);
})().catch(e => {
  console.error('\n❌ ERRO:', e.message.slice(0,200));
  process.exit(1);
});
