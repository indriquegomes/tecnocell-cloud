const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function carregar(file,imports,env={}){
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {module,exports:module.exports,process:{env},Buffer,Request,Response,Error,console,require:n=>{assert.ok(n in imports,n);return imports[n]}});
 return module.exports;
}
test('cron privado: autenticação obrigatória, flag, RPC única limitada e erro sem dados internos',async()=>{
 for(const [secret,authorization,flag,status,calls] of [
  ['', '', 'true',401,0],['segredo-qa','','true',401,0],['segredo-qa','Bearer errado','true',401,0],
  ['segredo-qa','Bearer segredo-qa','false',200,0],['segredo-qa','Bearer segredo-qa','true',200,1]
 ]){
  let n=0;
  const route=carregar('app/api/pedidos-app/credito/route.ts',{'node:crypto':require('node:crypto'),'@/lib/supabase/server':{createServiceClient:async()=>({rpc:async(name,args)=>{n++;assert.equal(name,'processar_pedidos_app_credito');assert.equal(args.p_limite,5);return{data:1}}})}},
   {CRON_SECRET:secret,PEDIDOS_APP_AUTO_CREDITO_ENABLED:flag});
  const r=await route.GET(new Request('https://qa.invalid/api/pedidos-app/credito',{headers:{authorization}}));
  assert.equal(r.status,status);assert.equal(n,calls);
 }
 const route=carregar('app/api/pedidos-app/credito/route.ts',{'node:crypto':require('node:crypto'),'@/lib/supabase/server':{createServiceClient:async()=>({rpc:async()=>({error:{message:'segredo interno'}})})}},{CRON_SECRET:'qa',PEDIDOS_APP_AUTO_CREDITO_ENABLED:'true'});
 const r=await route.GET(new Request('https://qa.invalid',{headers:{authorization:'Bearer qa'}}));
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/segredo interno/);
});
test('abertura do caixa grava operador autenticado, nunca o recebido pelo formulário',async()=>{
 let inserted;
 const q={select(){return this},eq(){return this},limit(){return this},maybeSingle:async()=>({data:null}),insert:async(row)=>{inserted=row;return{error:null}}};
 const actions=carregar('app/painel/pdv/operacao/actions.ts',{
  '@/lib/supabase/server':{requirePermissao:async()=>({id:'operador-real'}),createServiceClient:async()=>({from:()=>q}),podeAcessarLoja:async()=>true},
  '@/lib/log-atividade':{logAtividade:async()=>{}},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('NEXT_REDIRECT')}}
 });
 const form=new FormData();form.set('access_token','token-ficticio');form.set('loja_id','loja-qa');form.set('valor_abertura','0');form.set('aberto_por','outro-operador');
 await assert.rejects(actions.abrirCaixa(null,form),/NEXT_REDIRECT/);
 assert.equal(inserted.aberto_por,'operador-real');assert.equal(inserted.loja_id,'loja-qa');
});
