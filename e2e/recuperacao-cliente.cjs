// Testes isolados: nenhum e-mail enviado ou senha real alterada.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync('lib/recuperacao-cliente.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
function fixture(failure = false) {
  const calls = []
  let options
  const auth = Object.fromEntries(['verifyOtp', 'setSession'].map(method => [method, async value => {
    calls.push([method, value]); return failure ? { error: Error('expired'), data: {} } : { error: null, data: { session: { user: { id: 'test' } } } }
  }]))
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, URL, URLSearchParams, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test' } }, require: () => ({ createClient: (_url, _key, settings) => { options = settings; return { auth } } }) })
  const client = module.exports.criarRecuperacaoCliente()
  return { options, calls, rules: module.exports.regrasSenhaCliente, validate: url => module.exports.validarLinkRecuperacao(client, url) }
}
test('recuperação não persiste sessão nem detecta cookies/URL automaticamente', () => {
  const { options } = fixture()
  assert.equal(options.auth.persistSession, false)
  assert.equal(options.auth.autoRefreshToken, false)
  assert.equal(options.auth.detectSessionInUrl, false)
  assert.equal(options.auth.storageKey, 'tecnocell-cliente-recuperacao')
})
test('aceita link recovery com tokens no fragmento', async () => {
  const f = fixture()
  await f.validate('https://example.invalid/cliente/redefinir-senha#type=recovery&access_token=test&refresh_token=test-refresh')
  assert.equal(f.calls[0][0], 'setSession')
  assert.equal(f.calls[0][1].refresh_token, 'test-refresh')
})
test('aceita token_hash somente com tipo recovery', async () => {
  const f = fixture()
  await f.validate('https://example.invalid/cliente/redefinir-senha?token_hash=test&type=recovery')
  assert.equal(f.calls[0][0], 'verifyOtp')
  assert.equal(f.calls[0][1].type, 'recovery')
})
for (const suffix of ['', '#type=signup&access_token=test&refresh_token=test', '#type=recovery&access_token=test', '?token_hash=test&type=invite', '#error=access_denied', '?code=unsupported']) {
  test(`recusa link inválido: ${suffix || 'sem token'}`, async () => {
    const f = fixture()
    await assert.rejects(f.validate('https://example.invalid/cliente/redefinir-senha' + suffix), /LINK_INVALIDO/)
    assert.equal(f.calls.length, 0)
  })
}
test('link expirado não habilita redefinição', async () => {
  await assert.rejects(fixture(true).validate('https://example.invalid/?token_hash=expired&type=recovery'), /LINK_INVALIDO/)
})
test('regras seguem cadastro Android sem exigir símbolo especial', () => {
  const { rules } = fixture()
  for (const senha of ['', 'Abc123', 'abcdefgh1', 'ABCDEFGH1', 'Abcdefgh']) assert.equal(rules(senha).every(r => r.ok), false)
  assert.equal(rules('Abcdefg1').every(r => r.ok), true)
  assert.equal(rules('Abcdefg1!').every(r => r.ok), true)
})
