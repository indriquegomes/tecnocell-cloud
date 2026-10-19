const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const path = require('node:path');
const id = '00000000-0000-4000-8000-000000000001';
function pagina(dados, erro) {
  const calls = [];
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../app/painel/pedidos-app/imprimir/page.tsx'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, URLSearchParams, require(name) {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '../actions') return { carregarPedidosApp: async (...args) => { calls.push(args); if (erro) throw Error('segredo'); return dados; } };
    if (name === '@/lib/utils') return { formatBRL: n => `R$ ${n.toFixed(2)}`, formatDate: () => '19/10/2026' };
    if (name === './BotaoImprimir') return { BotaoImprimir: () => React.createElement('button', {}, 'Imprimir / reimprimir') };
    throw Error(name);
  } });
  return { render: async (params = { pedido: id, unidade: 'Unidade A' }) => renderToStaticMarkup(await module.exports.default({ searchParams: Promise.resolve(params) })), calls };
}
const pedido = { id, cliente: '<script>cliente</script>', criadoEm: '2026-10-19', confirmado: true, status: 'confirmado', pagamento: 'pendente', total: 25, itens: [{ id: 'p1', quantidade: 2, nome: 'Peça <teste>', preco: 12.5 }] };
test('ficha 80mm mostra código inteiro, cliente escapado e pagamento real sem gravar', async () => {
  const p = pagina({ unidade: { nome: 'Unidade A' }, pedidos: [pedido] });
  const html = await p.render();
  assert.match(html, /80mm 200mm/); assert.match(html, /72mm/);
  assert.ok(html.includes(id)); assert.match(html, /Pagamento pendente/);
  assert.match(html, /não é comprovante de pagamento/);
  assert.match(html, /&lt;script&gt;cliente&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(p.calls.length, 1); assert.deepEqual(p.calls[0], ['Unidade A', undefined, undefined, id]);
});
test('ficha recusa erro de autorização, cancelado, não aceito e link incompleto', async () => {
  for (const value of [{ ...pedido, confirmado: false }, { ...pedido, status: 'cancelado' }]) {
    assert.match(await pagina({ pedidos: [value] }).render(), /Ficha indisponível/);
  }
  assert.match(await pagina(null, true).render(), /Ficha indisponível/);
  const p = pagina(null); assert.match(await p.render({ pedido: id }), /Ficha indisponível/); assert.equal(p.calls.length, 0);
});

test('imprimir e fechar diálogo ajusta papel e limpa estilo, sem gravar estado', () => {
  const module = { exports: {} }; let impressos = 0, removidos = 0, css = '';
  const source = fs.readFileSync(path.join(__dirname, '../app/painel/pedidos-app/imprimir/BotaoImprimir.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    module, exports: module.exports, require: name => require(name),
    document: { getElementById: () => ({ scrollHeight: 960 }), createElement: () => ({ textContent: '', remove() { removidos++; } }), head: { appendChild(style) { css = style.textContent; } } },
    window: { print() { impressos++; } },
  });
  const botao = module.exports.BotaoImprimir();
  botao.props.onClick(); botao.props.onClick();
  assert.match(css, /size: 80mm 266mm/);
  assert.equal(impressos, 2); assert.equal(removidos, 2);
});
