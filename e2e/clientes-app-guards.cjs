// Verificação isolada das actions reais, sem conexão ou escrita no Supabase.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app/painel/clientes-app/actions.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const user = '00000000-0000-4000-8000-000000000001';
function fixture(overrides = {}) {
  const cfg = { permission: true, pessoa: { id: 'p1', ativo: true, nao_vender: false }, duplicate: [], error: null, saved: { user_id: user }, ...overrides };
  const writes = []; const refresh = []; const permissions = [];
  const service = { from(table) {
    let updating = false, payload, duplicate = false; const query = {};
    for (const method of ['select','eq','neq','limit','ilike','is']) query[method] = () => query;
    query.neq = () => { duplicate = true; return query; };
    query.update = value => { updating = true; payload = value; return query; };
    const result = () => {
      if (updating) { writes.push(payload); return { data: cfg.saved, error: cfg.error }; }
      return { data: table === 'pessoas' ? cfg.pessoa : duplicate ? cfg.duplicate : (cfg.cadastro ?? { pessoa_id: null }), error: cfg.readError ?? null };
    };
    query.maybeSingle = async () => result();
    query.then = (resolve,reject) => Promise.resolve(result()).then(resolve,reject);
    return query;
  }};
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, process: { env: { CADASTROS_APP_GERENCIAMENTO_ENABLED: cfg.enabled === false ? 'false' : 'true' } }, require(name) {
    if (name === 'next/cache') return { revalidatePath: (...args) => refresh.push(args) };
    if (name === '@/lib/supabase/server') return { createServiceClient: async () => service, requirePermissao: async key => { permissions.push(key); if (!cfg.permission) throw Error('denied'); } };
    throw Error('Unexpected import '+name);
  }});
  return { actions: module.exports, writes, refresh, permissions };
}
test('sem permissão clientes não consulta nem grava', async () => {
  const f = fixture({ permission:false });
  assert.equal((await f.actions.alterarStatusCadastro(user,'aprovado','p1','token')).ok,false);
  await assert.rejects(f.actions.buscarPessoasParaVinculo('Marina','token'));
  await assert.rejects(f.actions.abrirComprovacao(user,'token'));
  assert.equal(f.writes.length,0); assert.ok(f.permissions.every(k=>k==='clientes'));
});
test('ambiente não liberado mantém todas as gravações bloqueadas',async()=>{const f=fixture({enabled:false});for(const s of ['pendente','aprovado','bloqueado'])assert.equal((await f.actions.alterarStatusCadastro(user,s,'p1','token')).ok,false);assert.equal(f.writes.length,0)});
for (const [name,options,pessoa] of [
  ['sem pessoa selecionada',{},null], ['pessoa inativa',{pessoa:{ativo:false}},'p1'],
  ['pessoa bloqueada para compras',{pessoa:{ativo:true,nao_vender:true}},'p1'],
  ['pessoa já vinculada',{duplicate:[{user_id:'outra'}]},'p1'],
  ['tentativa de trocar vínculo existente',{cadastro:{pessoa_id:'p2'}},'p1'],
  ['falha ao conferir identidade',{readError:{message:'falha'}},'p1'],
]) test(name+' impede aprovação',async()=>{const f=fixture(options);assert.equal((await f.actions.alterarStatusCadastro(user,'aprovado',pessoa,'token')).ok,false);assert.equal(f.writes.length,0)});
test('status e ID adulterados são recusados',async()=>{const f=fixture();assert.equal((await f.actions.alterarStatusCadastro('invalido','aprovado','p1','token')).ok,false);assert.equal((await f.actions.alterarStatusCadastro(user,'master','p1','token')).ok,false);assert.equal(f.writes.length,0)});
test('aprovação grava somente vínculo e status, e atualiza ficha',async()=>{const f=fixture();assert.equal((await f.actions.alterarStatusCadastro(user,'aprovado','p1','token')).ok,true);assert.deepEqual(JSON.parse(JSON.stringify(f.writes)),[{status:'aprovado',pessoa_id:'p1'}]);assert.ok(f.refresh.some(a=>a[0]==='/painel/clientes'));});
test('bloquear não troca pessoa nem altera financeiro',async()=>{const f=fixture();assert.equal((await f.actions.alterarStatusCadastro(user,'bloqueado','forjado','token')).ok,true);assert.deepEqual(JSON.parse(JSON.stringify(f.writes)),[{status:'bloqueado'}]);});
test('conflito único de vínculo retorna erro sem sucesso',async()=>{const f=fixture({error:{code:'23505'}});const r=await f.actions.alterarStatusCadastro(user,'aprovado','p1','token');assert.equal(r.ok,false);assert.match(r.message,/outra conta/);assert.equal(f.refresh.length,0)});
test('cadastro ausente e erro de escrita não são sucesso',async()=>{for(const o of [{saved:null},{error:{code:'500',message:'segredo'}}]){const f=fixture(o);const r=await f.actions.alterarStatusCadastro(user,'pendente',null,'token');assert.equal(r.ok,false);assert.ok(!r.message.includes('segredo'));assert.equal(f.refresh.length,0)}});
test('busca vazia e somente curingas não expõe lista de pessoas',async()=>{const f=fixture();assert.equal((await f.actions.buscarPessoasParaVinculo('%%%', 'token')).length,0);assert.equal((await f.actions.buscarPessoasParaVinculo('a','token')).length,0)});
