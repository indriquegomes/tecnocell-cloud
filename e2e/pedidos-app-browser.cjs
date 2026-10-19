// Componente real em Chromium, ações fictícias; nenhuma conexão externa.
const fs = require('node:fs');
const http = require('node:http');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('playwright');
if (process.env.TMPDIR !== '/scratch') throw Error('Use o runner isolado.');
const dir='/scratch/browser'; fs.mkdirSync(dir);
const compile=(source)=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2017,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
let component=fs.readFileSync('/app/app/painel/pedidos-app/PedidosAppClient.tsx','utf8')
  .replace("'@/lib/supabase/client'","'./auth'").replace("'@/lib/utils'","'./utils'");
fs.writeFileSync(dir+'/component.js',compile(component));
fs.writeFileSync(dir+'/utils.js',compile(fs.readFileSync('/app/lib/utils.ts','utf8')));
fs.writeFileSync(dir+'/auth.js',"exports.createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}})");
fs.writeFileSync(dir+'/actions.js',`
exports.carregarPedidosApp=async()=>{ if(window.failRefresh)throw Error('Falha fictícia'); return window.fixture; };
exports.confirmarPedidoApp=async()=>{window.confirmations++;await new Promise(r=>setTimeout(r,250));return {ok:true};};
exports.cancelarPedidoApp=async()=>({ok:true});
`);
fs.writeFileSync(dir+'/entry.js',`const React=require('react');const {createRoot}=require('react-dom/client');const {PedidosAppClient}=require('./component');createRoot(document.getElementById('app')).render(React.createElement(PedidosAppClient,{dados:window.fixture}));`);
const packed=require('next/dist/compiled/webpack/webpack');
async function main(){
  await new Promise((resolve,reject)=>packed.webpack({mode:'development',devtool:false,entry:dir+'/entry.js',output:{path:dir,filename:'bundle.js'},resolve:{modules:['/app/node_modules']},optimization:{minimize:false}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
  const postcss=require('postcss');
  const css=await postcss([require('@tailwindcss/postcss')({base:'/app'})]).process(fs.readFileSync('/app/app/globals.css','utf8')+'\n@source "/app/app/painel/pedidos-app";',{from:'/app/app/globals.css'});
  const fixture={unidades:[{unidade:'Unidade A',lojaId:'fixture',nome:'Loja de teste'}],unidade:{unidade:'Unidade A',lojaId:'fixture',nome:'Loja de teste'},gerenciamentoHabilitado:true,maisPedidos:false,proximoCursor:null,pedidos:[{id:'00000000-0000-4000-8000-000000000001',cliente:'Cliente de teste',status:'pendente',pagamento:'pendente',criadoEm:'2026-10-17T12:00:00Z',itens:[{id:'p1',nome:'Peça de teste',loja:'Unidade A',quantidade:2,preco:12.5}],total:25,confirmado:false}]};
  const server=http.createServer((req,res)=>{
    if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(fs.readFileSync(dir+'/bundle.js'));}
    if(req.url==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');return res.end(css.css);}
    const dados=JSON.parse(JSON.stringify(fixture));
    if(req.url==='/empty')dados.pedidos=[];
    if(req.url==='/readonly')dados.gerenciamentoHabilitado=false;
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="app" style="padding:16px"></main><script>window.fixture='+JSON.stringify(dados)+';window.confirmations=0;window.failRefresh=false;</script><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try {
    browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[]; page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message)});
    page.on('requestfailed',r=>console.error('Request failed:',r.url(),r.failure()?.errorText));
    const origin='http://127.0.0.1:'+server.address().port;
    await page.goto(origin);await page.getByRole('heading',{name:'Pedidos do App'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sem overflow horizontal em 390px');
    await page.getByRole('button',{name:'Ver pedido',exact:true}).click();await page.getByRole('list',{name:'Peças do pedido'}).waitFor();
    await page.evaluate(()=>window.failRefresh=true);
    await page.getByRole('button',{name:'Atualizar pedidos',exact:true}).click();await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('list',{name:'Peças do pedido'}).count(),1,'falha preserva detalhe');
    const confirmar=page.getByRole('button',{name:'Aceitar pedido',exact:true});
    await confirmar.click();await page.getByRole('status').waitFor();
    assert.equal(await page.evaluate(()=>window.confirmations),1);
    await page.getByLabel('Mostrar pedidos').selectOption('todos');
    assert.equal(await confirmar.isDisabled(),true,'confirmação registrada não habilita repetir ao falhar atualização');
    await page.goto(origin+'/readonly');await page.getByRole('heading',{name:'Pedidos do App'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Aceitar pedido'}).isDisabled(),true);
    await page.goto(origin+'/empty');await page.getByText('Nenhum pedido neste filtro.',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);console.log('PASS Chromium390: detalhe, erro/nova tentativa, confirmação, somente consulta, vazio e largura. Backend fictício.');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
