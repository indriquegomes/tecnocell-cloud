// UI real; servidor e autenticação fictícios. Sem contas ou dados reais.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function bundle(){
 const modules=[],ids=new Map();
 function add(file){
  if(ids.has(file))return ids.get(file);const id=modules.length;ids.set(file,id);modules.push('');
  let source=file==='@actions'?`module.exports=new Proxy({}, {get:(_,name)=>async(...args)=>window.fixtureCall(name,args)})`
   :file==='@auth'?`exports.createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'ficticio'}}})}})`
   :fs.readFileSync(file,'utf8');
  if(/\.tsx?$/.test(file))source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  source=source.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>{
   const dest=name==='./actions'?'@actions':name==='@/lib/supabase/client'?'@auth':name.startsWith('@/')?path.join(root,name.slice(2)+'.ts'):require.resolve(name,{paths:[path.dirname(file)]});
   return `require(${add(dest)})`;
  });modules[id]=`function(module,exports,require){${source}\n}`;return id;
 }
 const component=add(path.join(root,'app/painel/pedidos-app/PedidosAppClient.tsx')),react=add(require.resolve('react')),dom=add(require.resolve('react-dom/client'));
 return `const process={env:{NODE_ENV:'production'}};const modules=[${modules.join(',')}],cache={};function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports}require(${dom}).createRoot(document.getElementById('root')).render(require(${react}).createElement(require(${component}).PedidosAppClient,{dados:window.fixture}));`;
}
test('fila real: atualização visível, consulta sem sobreposição, assumir e marcos independentes',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.clock.install();
 const css=await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
 await page.addStyleTag({content:css.css});
 await page.evaluate(()=>{
  window.fixture={unidades:[{unidade:'Petrópolis',lojaId:'l1',nome:'Petrópolis'}],unidade:{unidade:'Petrópolis',lojaId:'l1',nome:'Petrópolis'},pedidos:[{id:'qa',cliente:'Cliente QA',status:'pendente',pagamento:'pendente',criadoEm:'2026-10-20',itens:[],total:47,confirmado:false}],gerenciamentoHabilitado:true,pdvHabilitado:true,operacaoHabilitada:true,maisPedidos:false,proximoCursor:null};
  window.reads=0;window.events=[];
  window.fixtureCall=async(name,args)=>{
   if(name==='carregarPedidosApp'){window.reads++;if(window.delay)await new Promise(r=>window.finishRead=r);return structuredClone(window.fixture)}
   if(name==='registrarOperacaoPedidoApp'){window.events.push(args[3]);window.fixture.pedidos[0].operacao={versao:1,responsavelId:'qa',responsavel:'Operador QA',responsavelEm:null,solicitacoesImpressao:0,separadoEm:null,entregueEm:null,papelConfirmadoEm:null};return{ok:true}}
   return{};
  };
 });
 await page.addScriptTag({content:bundle()});await page.getByRole('heading',{name:'Pedidos do App'}).waitFor();
 await page.getByRole('button',{name:'Assumir atendimento',exact:true}).click();
 await page.getByText(/Responsável: Operador QA/).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.events),['assumir']);
 assert.equal(await page.getByRole('button',{name:'Confirmar entrega ao cliente'}).isDisabled(),true);
 await page.evaluate(()=>{window.delay=true});
 await page.clock.runFor(20001);assert.equal(await page.evaluate(()=>window.reads),2);
 await page.clock.runFor(45000);assert.equal(await page.evaluate(()=>window.reads),2,'sem leitura duplicada mesmo após timeout');
 await page.getByRole('alert').waitFor();
 await page.evaluate(()=>window.finishRead());
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
 await page.clock.runFor(40000);assert.equal(await page.evaluate(()=>window.reads),2,'aba oculta não consulta');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(root,'docs/fila-operacional-local-390-20261020.png'),fullPage:true});
 }finally{await browser.close()}
});
