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
  window.fixture={unidades:[{unidade:'Petrópolis',lojaId:'l1',nome:'Petrópolis'}],unidade:{unidade:'Petrópolis',lojaId:'l1',nome:'Petrópolis'},pedidos:[{id:'qa',cliente:'Cliente QA',status:'pendente',pagamento:'pendente',criadoEm:'2026-10-20',itens:[{id:'item-qa',nome:'ACABAMENTO ANALÓGICO CONTROLE PLAYSTATION 2/3 (KIT COM 2)',quantidade:1,preco:47}],total:47,confirmado:false}],gerenciamentoHabilitado:true,pdvHabilitado:true,operacaoHabilitada:true,maisPedidos:false,proximoCursor:null};
  window.reads=0;window.events=[];
  window.fixtureCall=async(name,args)=>{
   if(name==='carregarPedidosApp'){window.reads++;if(window.delay)await new Promise(r=>window.finishRead=r);return structuredClone(window.fixture)}
   if(name==='registrarOperacaoPedidoApp'){window.events.push(args[3]);const p=window.fixture.pedidos[0];p.operacao??={versao:0,responsavelId:'qa',responsavel:'Operador QA',responsavelEm:null,solicitacoesImpressao:0,separadoEm:null,entregueEm:null,papelConfirmadoEm:null};p.operacao.versao++;if(args[3]==='separado')p.operacao.separadoEm='2026-10-20T15:00:00Z';return{ok:true}}
   return{};
  };
 });
 await page.addScriptTag({content:bundle()});await page.getByRole('heading',{name:'Pedidos do App'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Assumir atendimento',exact:true}).isVisible(),false,'controles secundários recolhidos');
 await page.getByRole('button',{name:'Abrir no PDV',exact:true}).waitFor();
 await page.getByText('Leva as peças e o cliente ao caixa para escolher o pagamento.').waitFor();
 await page.getByText('Mais opções',{exact:true}).click();
 await page.getByRole('button',{name:'Assumir atendimento',exact:true}).click();
 await page.getByText(/Responsável: Operador QA/).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.events),['assumir']);
 assert.equal(await page.getByRole('button',{name:'Entregue',exact:true}).count(),0,'mostra somente a próxima etapa física');
 await page.getByRole('button',{name:'Separado',exact:true}).click();
 await page.getByRole('button',{name:'Entregue',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Entregue',exact:true}).isDisabled(),true,'não entrega sem venda');
 assert.deepEqual(await page.evaluate(()=>window.events),['assumir','separado']);
 assert.equal(await page.getByRole('button',{name:'Registrar solicitação de impressão',exact:true}).isVisible(),true,'opções antigas preservadas');
 await page.getByText('Mais opções',{exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Registrar solicitação de impressão',exact:true}).isVisible(),false);
 await page.evaluate(()=>{window.fixture.pedidos[0].vendaId='venda-qa'});
 await page.getByRole('button',{name:'Atualizar pedidos',exact:true}).click();
 await page.getByRole('button',{name:'Ver venda',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Abrir no PDV',exact:true}).count(),0,'venda existente só permite consultar');
 assert.equal(await page.getByRole('button',{name:'Entregue',exact:true}).isDisabled(),false);
 assert.deepEqual(await page.evaluate(()=>window.events),['assumir','separado'],'atualizar e abrir opções não geram venda, entrega ou fiado');
 assert.equal(await page.getByRole('button',{name:'Ver venda',exact:true}).getAttribute('aria-describedby'),'pdv-qa');
 await page.screenshot({path:path.join(root,'docs/fila-enxuta-local-390-20261020.png'),fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:path.join(root,'docs/fila-enxuta-local-desktop-20261020.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 const leituras=await page.evaluate(()=>window.reads);
 await page.evaluate(()=>{window.delay=true});
 await page.clock.runFor(20001);assert.equal(await page.evaluate(()=>window.reads),leituras+1);
 await page.clock.runFor(45000);assert.equal(await page.evaluate(()=>window.reads),leituras+1,'sem leitura duplicada mesmo após timeout');
 await page.getByRole('alert').waitFor();
 await page.evaluate(()=>window.finishRead());
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
 await page.clock.runFor(40000);assert.equal(await page.evaluate(()=>window.reads),leituras+1,'aba oculta não consulta');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
