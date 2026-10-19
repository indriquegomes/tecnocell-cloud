const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const next = require('next/server');
const destino = '/painel/pedidos-app?pedido=00000000-0000-4000-8000-000000000001&unidade=Petr%C3%B3polis';
function carregar(file, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, URL, Headers, atob, process: { env: {} }, require: name => name === 'next/server' ? next : imports[name],
  });
  return module.exports;
}
test('operador sem sessão mantém pedido e unidade no retorno do login', async () => {
  const { proxy } = carregar('proxy.ts');
  const resposta = await proxy(new next.NextRequest('https://example.test' + destino));
  const url = new URL(resposta.headers.get('location'));
  assert.equal(url.pathname, '/login'); assert.equal(url.searchParams.get('next'), destino);
});
for (const falha of [false, true]) test(`login ${falha ? 'recusado mantém retorno para nova tentativa' : 'válido volta ao pedido exato'}`, async () => {
  const { POST } = carregar('app/api/auth/login/route.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { signInWithPassword: async () => ({ data: {}, error: falha ? Error('fixture') : null }) } }) },
    '@/lib/utils': { normalizarUsuario: x => x },
  });
  const resposta = await POST(new next.NextRequest('https://example.test/api/auth/login', { method: 'POST', body: new URLSearchParams({ usuario: 'fixture@example.test', password: 'fixture-only', next: destino }) }));
  const url = new URL(resposta.headers.get('location'));
  if (falha) { assert.equal(url.pathname, '/login'); assert.equal(url.searchParams.get('next'), destino); }
  else { assert.equal(url.pathname + url.search, destino); }
  assert.equal(resposta.status, 303);
});
