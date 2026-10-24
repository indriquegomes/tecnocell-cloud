// Lógica real do módulo público, DOM mínimo; nenhum WhatsApp ou serviço externo.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
class Element {
 constructor(){this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.open=false;this.attrs={};this.events={};this.style={setProperty(){}};const classes=new Set();this.classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle:(x,b)=>{b??=!classes.has(x);b?classes.add(x):classes.delete(x);return b}};}
 replaceChildren(...v){this.children=v;} append(...v){this.children.push(...v);} setAttribute(k,v){this.attrs[k]=v;} getAttribute(k){return this.attrs[k];}
 addEventListener(k,v){this.events[k]=v;} focus(){} after(n){this.afterNode=n;} showModal(){this.open=true;} close(){this.open=false;this.events.close?.();}
}
async function main(){
 const api=await import(pathToFileURL(path.resolve('docs/halloween-site-api-20261022.mjs')).href);
 const source=fs.readFileSync('docs/halloween-site-app-20261022.mjs','utf8').replace(/^import[^\n]+\n/gm,'');
 let passed=0;
 for(const [name,phone,expected] of [['Petrópolis','(21) 99999-0001','5521999990001'],['Teresópolis','+55 (21) 98888-0002','5521988880002']]){
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const document={getElementById:get,querySelector:get,querySelectorAll:()=>[],createElement:()=>new Element(),body:new Element(),addEventListener(){}};
  let clipboard='',failCopy=false,failRpc=false;const opened=[];
  const expires=new Date(Date.now()+172800000).toISOString();
  const ticket={status:'used',customer:'__QA__ Cliente',loja:'LOJA ERRADA DO PAINEL',campaign:{test_mode:false,active:true,products:[]},result:{status:'available',code:'TC-EXEMPLO-123',expires_at:expires,created_at:new Date().toISOString(),offer:{id:9,name:'Carregador MD-CAR271A',benefit_type:'percent',benefit_value:18,unlimited_units:true,loja:'SNAPSHOT ANTIGO'},pickup_store:{name,whatsapp:phone}}};
  const context={document,location:{hash:'#giro='+'a'.repeat(64),pathname:'/',reload(){}},navigator:{clipboard:{writeText:async text=>{if(failCopy)throw Error('bloqueado');clipboard=text;}}},window:{open:(...args)=>{opened.push(args);return {}; }},matchMedia:()=>({matches:true,addEventListener(){}}),addEventListener(){},URLSearchParams,Intl,Date,Math,createSoundscape:()=>({tone(){}}),productArt:()=>new Element(),rpc:async()=>{if(failRpc)throw Error('Sem conexão');return structuredClone(ticket);},campaignId:'qa',benefit:api.benefit,dateTime:api.dateTime,setInterval:()=>1,clearInterval(){},setTimeout:fn=>{queueMicrotask(fn);return 1;}};
  vm.runInNewContext(source,context);await new Promise(r=>setImmediate(r));
  const reload=async()=>{get('expiry').afterNode.onclick();await new Promise(r=>setImmediate(r));};
  assert.equal(get('share').textContent,`Enviar para ${name}`);
  assert.equal(typeof get('copy-receipt').onclick,'function','Botão copiar implementado');
  await get('copy-receipt').onclick();
  for(const text of ['__QA__ Cliente','Carregador MD-CAR271A','18%','TC-EXEMPLO-123',name,'Uso único','Sem acumular'])assert.ok(clipboard.includes(text),text);
  assert.doesNotMatch(clipboard,/aaaaaaa|#giro|SNAPSHOT ANTIGO|LOJA ERRADA|loja_id|purchase_ref/);
  assert.equal(get('copy-status').textContent,'Comprovante copiado!');
  await get('share').onclick();
  const url=new URL(opened.at(-1)[0]);assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/'+expected);assert.equal(url.searchParams.get('text'),clipboard);
  failCopy=true;await get('copy-receipt').onclick();assert.equal(get('receipt-content').hidden,false);assert.equal(get('receipt-content').textContent,clipboard);assert.match(get('copy-status').textContent,/selecione|selecionar/i);failCopy=false;
  for(const invalid of [null,'','123','(21) 11111-1111','https://wa.me/5521999990001','5521999990001?text=x']){
   ticket.result.pickup_store.whatsapp=invalid;await reload();
   assert.equal(get('share').hidden,true);const count=opened.length;await get('share').onclick();assert.equal(opened.length,count);assert.match(get('store-contact-note').textContent,/loja da compra/i);
  }
  ticket.result.pickup_store=null;await reload();assert.equal(get('share').hidden,true);
  await get('copy-receipt').onclick();assert.match(clipboard,/loja da compra/i);
  ticket.result.pickup_store={name,whatsapp:phone};
  for(const [state,label] of [['redeemed','RESGATADO'],['expired','VENCIDO'],['revoked','CANCELADO'],['replaced','CANCELADO']]){
   ticket.result.status=state;ticket.result.redeemed_at=new Date().toISOString();await reload();await get('copy-receipt').onclick();
   assert.ok(clipboard.includes(label));assert.equal(get('share').hidden,true);assert.doesNotMatch(clipboard,/DISPONÍVEL PARA RETIRADA/);
  }
  ticket.result.status='available';ticket.result.expires_at=new Date(Date.now()-1000).toISOString();await reload();await get('copy-receipt').onclick();assert.match(clipboard,/VENCIDO/);assert.equal(get('share').hidden,true);
  ticket.result.expires_at=expires;ticket.campaign.test_mode=true;ticket.result.offer={id:12,name:'iCharge8Pro',benefit_type:'percent',benefit_value:100};await reload();await get('copy-receipt').onclick();assert.match(clipboard,/TESTE — SEM VALOR DE RESGATE/);assert.match(clipboard,/uma unidade/i);assert.doesNotMatch(clipboard,/180|135/);
  // Estado muda no servidor entre exibir o resultado e o cliente tocar no botão.
  ticket.result.status='available';await reload();ticket.result.status='redeemed';const count=opened.length;await get('share').onclick();assert.equal(opened.length,count);assert.equal(get('share').hidden,true);
  failRpc=true;await get('copy-receipt').onclick();assert.equal(get('receipt-content').hidden,false);assert.match(get('copy-status').textContent,/confirmar|atualizar|conexão/i);
  passed++;
 }
 console.log(`PASS comprovante: ${passed} lojas, texto idêntico, cópia/fallback, telefone inválido/ausente, estados, homologação, atualização antes do envio e sem token.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
