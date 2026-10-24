// Module-level browser logic with a minimal DOM; no browser, service or real sale.
const fs = require('node:fs')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const path = require('node:path')
class Element {
 constructor(){this.textContent='';this.children=[];this.hidden=false;this.disabled=false;this.open=false;this.attrs={};this.events={};const classes=new Set();this.classList={add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),contains:v=>classes.has(v),toggle:(v,b)=>{b??=!classes.has(v);b?classes.add(v):classes.delete(v);return b}};this.style={setProperty(){}}}
 replaceChildren(...items){this.children=items} append(...items){this.children.push(...items)}
 setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}
 addEventListener(k,v){this.events[k]=v}focus(){}after(node){this.afterNode=node}
 showModal(){this.open=true}close(){this.open=false;this.events.close?.()}
}
;(async()=>{
 const api = await import(pathToFileURL(path.resolve('docs/halloween-site-api-20261022.mjs')).href)
 let source=fs.readFileSync('docs/halloween-site-app-20261022.mjs','utf8')
 if(process.argv.includes('--baseline')){const zip=await require('jszip').loadAsync(fs.readFileSync('docs/halloween-site-20261022.zip'));source=await zip.file('app.js').async('string')}
 const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)}
 const document={getElementById:get,createElement:()=>new Element(),querySelector:get,querySelectorAll:()=>[],body:new Element(),addEventListener(){},hidden:false}
 const products=[15,20,20,15,20,15,18,15,18,18,10,100,100].map((value,i)=>({id:i+1,name:'Modelo '+(i+1),benefit_type:'percent',benefit_value:value,unlimited:i<11,chance_base:i<11?9:0.5,available:true}))
 const campaign={active:true,test_mode:true,participation_open:true,can_spin:true,products}
 const expires=new Date(Date.now()+172800000).toISOString()
 let ticket={status:'available',customer:'QA',expires_at:expires,campaign,result:null},lost=true,draws=0
 async function rpc(name){if(name==='ticket')return structuredClone(ticket);if(name==='spin'){
  if(!ticket.result){draws++;ticket.result={status:'available',code:'TC-TESTE-'+draws,created_at:new Date().toISOString(),expires_at:expires,offer:{...products[draws-1],unlimited_units:true,loja:'Loja QA'},pickup_store:{name:'Loja QA',whatsapp:null}};ticket.status='used'}
  if(lost){lost=false;throw Error('Conexão interrompida depois de salvar')}
  return structuredClone(ticket.result)
 }throw Error('Unexpected RPC: '+name)}
 const context={document,location:{hash:'#giro='+'a'.repeat(64),pathname:'/',reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},URLSearchParams,Intl,Date,Math,createSoundscape:()=>({tone(){}}),productArt:()=>new Element(),rpc,campaignId:'qa',benefit:api.benefit,dateTime:api.dateTime,setInterval:()=>1,clearInterval(){},setTimeout:fn=>{queueMicrotask(fn);return 1}}
 vm.runInNewContext(source.replace(/^import[^\n]+\n/gm,''),context)
 const flush=()=>new Promise(resolve=>setImmediate(resolve));await flush()
 assert.equal(get('spin').disabled,false,'giro disponível')
 assert.equal(get('wheel').children.length,13,'roleta mantém posições decorativas')
 assert.ok(get('wheel').children.every(node=>node.textContent==='✦'),'nenhum modelo é antecipado na roda')
 assert.equal(elements.has('prize-list'),false,'catálogo público não é preenchido antes do sorteio')
 const publicHtml=fs.readFileSync('docs/halloween-site-index-20261022.html','utf8')
 assert.doesNotMatch(publicHtml,/iCharge|Sunshine|YX-6028|YX-A34|prize-list|>Os prêmios</i,'HTML público preserva surpresa')
 await get('spin').onclick();assert.match(get('status').textContent,/Conexão/);assert.equal(get('spin').disabled,false,'falha permite recuperar o mesmo sorteio')
 await get('spin').onclick();assert.equal(draws,1,'retry não sorteia novamente');assert.match(get('reward-title').textContent,/15% de desconto/)
 assert.match(get('reward-note').textContent,/quantas unidades quiser/,'vale explica as unidades do mesmo modelo')
 assert.match(get('reward-note').textContent,/Retirada somente em Loja QA/)
 ticket={...ticket,status:'available',result:null,replacement:true};get('result').close()
 assert.ok(get('expiry').afterNode,'recuperação explícita disponível')
 await get('expiry').afterNode.onclick();await flush()
 assert.equal(get('spin').disabled,false,'giro devolvido disponível no mesmo link');assert.equal(get('view-result').hidden,true,'resultado antigo não fica reutilizável');assert.equal(document.body.classList.contains('revealed'),false)
 assert.match(get('status').textContent,/novas 48 horas/)
 await get('spin').onclick();assert.equal(draws,2);assert.match(get('reward-title').textContent,/20% de desconto/)
 ticket.result.offer={id:12,name:'Legado',benefit_type:'price',benefit_value:18000}; await get('expiry').afterNode.onclick();await flush();get('receipt').onclick();assert.doesNotMatch(get('receipt-content').textContent,/Prêmio grátis/,'preço histórico não vira grátis');
 console.log('PASS interface: resposta perdida recupera mesmo vale, regras por modelo/unidades/loja e giro devolvido limpa resultado antigo no mesmo link')
})().catch(e=>{console.error(e.message);process.exitCode=1})
