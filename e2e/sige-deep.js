const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/usuario/projetos/tecnocell-cloud/sige-deep';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let idx = 0;
const shot = async (page, name) => {
  const file = path.join(OUT, `${String(idx++).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('📸', name);
};

const r = {};
const pdvUrl = 'https://app.sigecloud.com.br/pdv';

async function textoBody(page, n = 30) {
  return (await page.locator('body').innerText()).split('\n').filter(l => l.trim()).slice(0, n);
}
async function getInputs(page) {
  const els = await page.locator('input:visible, select:visible, textarea:visible').all();
  return Promise.all(els.map(async el => ({
    id: await el.getAttribute('id').catch(() => ''),
    placeholder: await el.getAttribute('placeholder').catch(() => ''),
    type: await el.getAttribute('type').catch(() => ''),
  })));
}
async function getBotoes(page) {
  return (await page.locator('button:visible, .btn-flat:visible a').allTextContents()).map(t => t.trim()).filter(Boolean);
}
async function abrirPDV(page) {
  await page.goto(pdvUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
}
async function addProduto(page) {
  await page.click('#txtNomeProduto');
  await page.keyboard.type('Pel', { delay: 100 });
  await page.waitForTimeout(3000);
  const sugs = await page.locator('.autocomplete-suggestion').all();
  const textos = await Promise.all(sugs.map(s => s.innerText().catch(() => '')));
  const i = textos.findIndex(t => t.trim() && !t.includes('Cadastrar'));
  if (i >= 0) {
    await sugs[i].click({ force: true, timeout: 5000 }).catch(async () => {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });
    await page.waitForTimeout(1500);
    return textos[i];
  }
  return null;
}
async function addCliente(page) {
  await page.click('#txtNomeCliente').catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.type('Vitor', { delay: 100 });
  await page.waitForTimeout(2000);
  const sugs = await page.locator('.autocomplete-suggestion').all();
  const textos = await Promise.all(sugs.map(s => s.innerText().catch(() => '')));
  const i = textos.findIndex(t => t.trim() && !t.includes('Cadastrar'));
  if (i >= 0) {
    await sugs[i].click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    return textos[i];
  }
  return null;
}
async function closeModal(page) {
  // Tenta múltiplas formas de fechar
  const closers = [
    '#botaoFecharBuscaOrcamento',
    '.divBotaoFechar a',
    '[ng-click*="fechar"]',
    '.modal-header .close',
    'button.close',
    '[data-dismiss=modal]',
  ];
  for (const sel of closers) {
    if (await page.locator(sel).count() > 0) {
      await page.locator(sel).first().click({ force: true, timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
      return;
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  // LOGIN
  await page.goto('https://app.sigecloud.com.br/Login.aspx', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.fill('#txtEmail', 'indrique@hotmail.com');
  await page.fill('#txtPass', '21#04#2008@@');
  await page.click('#btnEntrar');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  console.log('✅ Login');

  // ═══ BLOCO 1: F1, F2, F3 ════════════════════════════════════════════════
  await abrirPDV(page);
  await shot(page, '00-pdv-inicial');

  // Selects do header
  r.selects_header = [];
  for (const sel of await page.locator('select:visible').all()) {
    const id = await sel.getAttribute('id').catch(() => '');
    const opts = (await sel.locator('option').allTextContents()).filter(o => o.trim());
    r.selects_header.push({ id, opcoes: opts });
    console.log(`Select #${id}:`, opts.join(' | '));
  }

  // Adiciona produto + cliente
  const nomeProd = await addProduto(page);
  console.log('Produto:', nomeProd);
  const nomeCliente = await addCliente(page);
  console.log('Cliente:', nomeCliente);
  await shot(page, '01-pdv-produto-cliente');

  // ── F1 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F1 CONSULTAR PRODUTOS ===');
  await page.keyboard.press('F1');
  await page.waitForTimeout(2500);
  await shot(page, '02-f1');
  r.F1 = {
    descricao: 'Consultar Produtos — abre modal com campo busca e botão "Buscar Item"',
    texto: await textoBody(page, 20),
    inputs: await getInputs(page),
    botoes: await getBotoes(page),
  };
  console.log('  F1 inputs:', r.F1.inputs.map(i=>`${i.id}|${i.placeholder}`).join(' | '));
  console.log('  F1 botões:', r.F1.botoes.join(' | '));

  // Busca no F1
  const f1In = page.locator('.modalBlue input:visible, .modal input:visible').first();
  if (await f1In.count() > 0) {
    await f1In.type('Capinha', { delay: 80 });
    await page.waitForTimeout(2000);
    await shot(page, '03-f1-busca-capinha');
    const f1Btns2 = await getBotoes(page);
    r.F1.busca_capinha = { texto: await textoBody(page, 20), botoes: f1Btns2 };
    console.log('  F1 após busca:', f1Btns2.join(' | '));
    // Clica em "Buscar Item"
    const buscarItemBtn = page.locator('button:has-text("Buscar"), [class*=btn]:has-text("Buscar"), .btn-flat:has-text("Buscar")').first();
    if (await buscarItemBtn.count() > 0) {
      await buscarItemBtn.click({ force: true });
      await page.waitForTimeout(2500);
      await shot(page, '04-f1-resultado-busca');
      r.F1.resultado_busca = {
        texto: await textoBody(page, 30),
        colunas: (await page.locator('th:visible').allTextContents()).filter(t=>t.trim()),
        botoes: await getBotoes(page),
      };
      console.log('  F1 resultado colunas:', r.F1.resultado_busca.colunas.join(' | '));
      console.log('  F1 resultado botões:', r.F1.resultado_busca.botoes.join(' | '));
    }
  }
  await closeModal(page);
  await page.waitForTimeout(500);

  // ── F2 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F2 NOVA BUSCA ===');
  const f2Antes = await page.locator('#txtNomeProduto').inputValue().catch(() => '');
  await page.keyboard.press('F2');
  await page.waitForTimeout(800);
  const f2Depois = await page.locator('#txtNomeProduto').inputValue().catch(() => '');
  const f2Foco = await page.evaluate(() => document.activeElement?.id || '');
  await shot(page, '05-f2');
  r.F2 = { descricao: 'Nova Busca — limpa e foca o campo de produto', antes: f2Antes, depois: f2Depois, foco: f2Foco };
  console.log(`  F2: "${f2Antes}" → "${f2Depois}" | foco: ${f2Foco}`);

  // ── F3 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F3 BUSCA ORÇAMENTO ===');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('F3');
  await page.waitForTimeout(2500);
  await shot(page, '06-f3');
  r.F3 = {
    descricao: 'Busca orçamentos e pedidos — input de número com autocomplete, botão "Selecionar" carrega itens no carrinho',
    modal_id: 'modalBlueBuscaOrcamento',
    input_id: 'selectOrcamento',
    inputs: await getInputs(page),
    botoes: await getBotoes(page),
    texto: await textoBody(page, 15),
  };
  console.log('  F3 inputs:', r.F3.inputs.map(i=>`${i.id}`).join(' | '));
  console.log('  F3 botões:', r.F3.botoes.join(' | '));

  // Foca o input e verifica autocomplete de orçamentos
  await page.click('#selectOrcamento').catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '07-f3-autocomplete-vazio');
  const f3Sug = await page.locator('.autocomplete-suggestion').allTextContents().catch(() => []);
  r.F3.autocomplete_orçamentos = f3Sug.filter(t=>t.trim()).slice(0, 10);
  console.log('  F3 orçamentos disponíveis:', f3Sug.length > 0 ? f3Sug.slice(0,5) : 'nenhum');

  // Fecha modal corretamente
  await page.click('#botaoFecharBuscaOrcamento').catch(async () => {
    await page.locator('.divBotaoFechar a').first().click({ force: true }).catch(() => {});
  });
  await page.waitForTimeout(700);
  await shot(page, '08-f3-fechado');
  console.log('  F3 fechado');

  // ═══ BLOCO 2: F4, F8, F9, F12 ════════════════════════════════════════════
  console.log('\n=== RECARREGANDO PDV para bloco 2 ===');
  await abrirPDV(page);
  const p2 = await addProduto(page);
  const c2 = await addCliente(page);
  console.log('Produto:', p2, '| Cliente:', c2);
  await shot(page, '09-pdv-bloco2');

  // ── F4 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F4 MUDAR QUANTIDADE ===');
  await page.keyboard.press('F4');
  await page.waitForTimeout(1500);
  await shot(page, '10-f4');
  const f4Foco = await page.evaluate(() => {
    const el = document.activeElement;
    return { id: el?.id, class: el?.className?.slice(0, 60), tag: el?.tagName };
  });
  const f4Modal = await page.locator('.modalBlue:visible, dialog:visible').count();
  r.F4 = {
    descricao: 'Mudar Quantidade — foca no input de quantidade do item no carrinho, pronto para digitar',
    modal_aberto: f4Modal > 0,
    elemento_focado: f4Foco,
    texto: await textoBody(page, 10),
  };
  console.log('  F4 foco:', JSON.stringify(f4Foco));
  console.log('  F4 modal:', f4Modal > 0);
  if (f4Modal > 0) await closeModal(page);
  await page.waitForTimeout(500);

  // ── F8 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F8 FINALIZAR VENDA ===');
  await page.keyboard.press('F8');
  await page.waitForTimeout(4000);
  await shot(page, '11-f8');
  const f8Texto = await textoBody(page, 60);
  const f8Botoes = await getBotoes(page);
  const f8Inputs = await getInputs(page);
  r.F8 = {
    descricao: 'Finalizar Venda — tela completa de pagamento, shows wizard com formas de pagamento',
    texto: f8Texto,
    inputs: f8Inputs,
    botoes: f8Botoes,
  };
  console.log('  F8 botões:', f8Botoes.join(' | '));
  console.log('  F8 texto (primeiros):', f8Texto.slice(0, 10).join(' | '));
  fs.writeFileSync(path.join(OUT, 'f8.html'), await page.content());

  // Identifica seção de pagamento ativa
  const f8URL = page.url();
  console.log('  URL após F8:', f8URL);

  // Captura formas de pagamento como ícones/imagens
  const f8Imgs = await Promise.all((await page.locator('img:visible').all()).map(i => i.getAttribute('alt').catch(() => '')));
  r.F8.icones = f8Imgs.filter(Boolean);
  const f8Classes = await page.locator('[class*=pagamento]:visible, [class*=payment]:visible, [id*=pagamento]:visible').all();
  const f8ClassesTexto = await Promise.all(f8Classes.map(async el => ({
    id: await el.getAttribute('id').catch(()=>''),
    class: (await el.getAttribute('class').catch(()=>'')).slice(0, 50),
    texto: (await el.innerText().catch(()=>'')).slice(0, 100),
  })));
  r.F8.elements_pagamento = f8ClassesTexto;
  console.log('  F8 elementos pagamento:', f8ClassesTexto.map(e=>e.texto).filter(Boolean).join(' | '));

  // Tenta clicar Dinheiro
  const dinhBtn = page.locator('button:has-text("Dinheiro"), a:has-text("Dinheiro")').first();
  if (await dinhBtn.count() > 0) {
    await dinhBtn.click({ force: true }); await page.waitForTimeout(2000);
    await shot(page, '12-f8-dinheiro');
    r.F8.dinheiro = { texto: await textoBody(page, 15), inputs: await getInputs(page) };
    console.log('  Dinheiro inputs:', r.F8.dinheiro.inputs.map(i=>`${i.id}|${i.placeholder}`).join(' | '));
  }
  // Tenta clicar PIX
  const pixBtn = page.locator('button:has-text("Pix"), button:has-text("PIX"), a:has-text("Pix")').first();
  if (await pixBtn.count() > 0) {
    await pixBtn.click({ force: true }); await page.waitForTimeout(3000);
    await shot(page, '13-f8-pix');
    r.F8.pix = {
      texto: await textoBody(page, 20),
      inputs: await getInputs(page),
      botoes: await getBotoes(page),
    };
    console.log('  PIX botões:', r.F8.pix.botoes.join(' | '));
    console.log('  PIX texto:', r.F8.pix.texto.filter(l=>l.toLowerCase().includes('pix')||l.includes('QR')||l.includes('chave')).join(' | '));
  }
  await shot(page, '14-f8-final');
  // Volta sem comprar
  await page.keyboard.press('F11');
  await page.waitForTimeout(2000);

  // ── F9 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F9 CREDIÁRIO ===');
  await page.keyboard.press('F9');
  await page.waitForTimeout(3000);
  await shot(page, '15-f9');
  fs.writeFileSync(path.join(OUT, 'f9.html'), await page.content());
  r.F9 = {
    descricao: 'Crediário — lista de contas a receber pendentes, checkbox para selecionar e dar baixa',
    texto: await textoBody(page, 40),
    inputs: await getInputs(page),
    botoes: await getBotoes(page),
    colunas_th: (await page.locator('th:visible').allTextContents()).filter(t=>t.trim()),
  };
  console.log('  F9 colunas:', r.F9.colunas_th.join(' | '));
  console.log('  F9 inputs:', r.F9.inputs.map(i=>`${i.id}|${i.placeholder}`).join(' | '));
  console.log('  F9 botões:', r.F9.botoes.join(' | '));
  // Linhas da tabela (primeiras)
  const f9Rows = await page.locator('tbody tr').count().catch(() => 0);
  console.log('  F9 linhas na tabela:', f9Rows);
  if (f9Rows > 0) {
    const f9Row1 = await page.locator('tbody tr:first-child td').allTextContents().catch(() => []);
    r.F9.primeira_linha = f9Row1.filter(t=>t.trim());
    console.log('  F9 primeira linha:', r.F9.primeira_linha.join(' | '));
    // Marca checkbox
    const f9Chk = page.locator('tbody tr:first-child input[type=checkbox]');
    if (await f9Chk.count() > 0) {
      await f9Chk.check({ force: true });
      await page.waitForTimeout(500);
      await shot(page, '16-f9-selecionado');
      r.F9.botoes_pos_check = await getBotoes(page);
      console.log('  F9 botões após checkbox:', r.F9.botoes_pos_check.join(' | '));
    }
  }
  await closeModal(page);
  await page.waitForTimeout(500);

  // ── F12 ──────────────────────────────────────────────────────────────────
  console.log('\n=== F12 SAÍDA CONSIGNADA ===');
  await page.keyboard.press('F12');
  await page.waitForTimeout(3000);
  await shot(page, '17-f12');
  fs.writeFileSync(path.join(OUT, 'f12.html'), await page.content());
  r.F12 = {
    descricao: 'Menu Saída Consignada',
    texto: await textoBody(page, 30),
    inputs: await getInputs(page),
    botoes: await getBotoes(page),
  };
  console.log('  F12 texto:', r.F12.texto.slice(0, 8).join(' | '));
  console.log('  F12 botões:', r.F12.botoes.join(' | '));
  // Verifica se é um submenu (várias opções)
  const f12Opts = await page.locator('[ng-click*=saida], [ng-click*=consign], [onclick*=saida], [onclick*=consign]').allTextContents().catch(() => []);
  r.F12.opcoes_ng = f12Opts;
  console.log('  F12 opções ng-click:', f12Opts.join(' | '));
  await shot(page, '18-f12-detalhe');
  await closeModal(page);
  await page.waitForTimeout(500);

  // ── CTRL+F11 ──────────────────────────────────────────────────────────────
  console.log('\n=== CTRL+F11 CONSULTAR VENDAS ===');
  await page.keyboard.press('Control+F11');
  await page.waitForTimeout(3000);
  await shot(page, '19-ctrlf11');
  r.CtrlF11 = {
    descricao: 'Consultar Vendas Faturadas — histórico de vendas, pode visualizar/reimprimir',
    texto: await textoBody(page, 30),
    inputs: await getInputs(page),
    botoes: await getBotoes(page),
    colunas_th: (await page.locator('th:visible').allTextContents()).filter(t=>t.trim()),
  };
  console.log('  Ctrl+F11 colunas:', r.CtrlF11.colunas_th.join(' | '));
  const cf11PrimLinha = await page.locator('tbody tr:first-child td').allTextContents().catch(() => []);
  r.CtrlF11.primeira_linha = cf11PrimLinha.filter(t=>t.trim());
  console.log('  Ctrl+F11 primeira venda:', r.CtrlF11.primeira_linha.join(' | '));

  // Clica na venda para ver detalhes
  if (cf11PrimLinha.length > 0) {
    await page.locator('tbody tr:first-child').click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, '20-ctrlf11-detalhe');
    r.CtrlF11.detalhe = {
      texto: await textoBody(page, 25),
      botoes: await getBotoes(page),
      inputs: await getInputs(page),
    };
    console.log('  Detalhe venda botões:', r.CtrlF11.detalhe.botoes.join(' | '));
  }
  await closeModal(page);
  await page.waitForTimeout(500);

  // ── CTRL+SHIFT ──────────────────────────────────────────────────────────
  console.log('\n=== CTRL+SHIFT DESAGRUPAR ===');
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await page.waitForTimeout(1500);
  await shot(page, '21-ctrl-shift');
  r.CtrlShift = { descricao: 'Desagrupar Produtos — divide itens iguais em linhas separadas', texto: await textoBody(page, 10) };

  await shot(page, '22-estado-final');
  await browser.close();

  fs.writeFileSync(path.join(OUT, 'analise.json'), JSON.stringify(r, null, 2));
  console.log('\n✅ CONCLUÍDO');
  console.log('  JSON:', path.join(OUT, 'analise.json'));
})().catch(e => {
  console.error('\n❌ ERRO:', e.message.slice(0, 600));
  process.exit(1);
});
