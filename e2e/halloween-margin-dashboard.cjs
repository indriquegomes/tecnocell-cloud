const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/painel/promocoes/halloween/HalloweenProfit.tsx'),'utf8')
const hooks=[],requests=[];let cursor=0,effects=[],out={}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,document:{hidden:false,addEventListener(){},removeEventListener(){}},require:n=>{
if(n==='react/jsx-runtime')return require(n)
if(n==='./StorePrizes')return {default:function StorePrizes(){}}
if(n==='@/lib/utils')return {formatBRL:n=>`R$ ${n}`}
if(n==='@/lib/supabase/client')return {createClient:()=>({rpc:(name,args)=>new Promise(resolve=>requests.push({name,args,resolve}))})}
if(n==='react')return {useState:x=>{const i=cursor++;if(!(i in hooks))hooks[i]=typeof x==='function'?x():x;return [hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v]},useRef:x=>{const i=cursor++;return hooks[i]??(hooks[i]={current:x})},useEffect:(fn,deps)=>{const i=cursor++;if(!hooks[i]||deps.some((d,k)=>d!==hooks[i][k])){hooks[i]=deps;effects.push(fn)}}}
throw Error(n)}})
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):!n||typeof n!=='object'?[]:[n,...nodes(n.props?.children)]
const render=()=>{cursor=0;return nodes(out.default())}
const text=n=>Array.isArray(n)?n.map(text).join(' '):n&&typeof n==='object'?text(n.props?.children):String(n??'')
const state={stores:[{id:'a',name:'Loja A',total:650,pending:1,unlocked_at:'2026-10-20T12:00:00Z',unlocked_margin:710},{id:'b',name:'Loja B',total:200,pending:0,unlocked_at:null,unlocked_margin:null},{id:'c',name:'Loja C',total:700,pending:1,unlocked_at:null,unlocked_margin:null}],products:[{product_id:'p',name:'Produto',store_id:'a',quantity:2,revenue:900,cost:null,margin:null}],sales:['pending','cancelled','refunded','provider-review'].map((status,i)=>({sale_id:String(i),number:i,store_id:'a',store_name:'Loja A',created_at:'2026-10-21T12:00:00Z',status,quantity:1,revenue:100,cost:null,margin:null,pending:true})),last_sync_at:null,sync_error:null}
;(async()=>{
let tree=render();assert.equal(tree.filter(n=>n.type==='textarea').length,0,'read-only dashboard must remove manual entry forms')
for(const effect of effects.splice(0))effect()
assert.equal(requests.length,1,'initial load once');assert.equal(requests[0].name,'halloween_margin_state')
requests[0].resolve({data:state,error:null});await new Promise(setImmediate)
tree=render();assert.match(text(tree),/Liberado permanentemente/);assert.match(text(tree),/Custo pendente/);assert.match(text(tree),/Meta atingida · resolva as pendências/);assert.match(text(tree),/500/);assert.match(text(tree),/Pagamento pendente/);assert.match(text(tree),/Cancelada/);assert.match(text(tree),/Devolvida/);assert.match(text(tree),/provider-review/);assert.ok(tree.filter(n=>n.type==='input').every(n=>n.props.type==='date'),'only date filter inputs remain')
const refresh=tree.find(n=>n.type==='button');refresh.props.onClick();assert.equal(requests.length,2)
tree.find(n=>n.type==='select').props.onChange({target:{value:'halloween-2026-test'}});render();for(const effect of effects.splice(0))effect()
assert.equal(requests.length,3);requests[2].resolve({data:{...state,sales:[],stores:[{...state.stores[1],name:'Teste atual'}]},error:null});await new Promise(setImmediate)
requests[1].resolve({data:state,error:null});await new Promise(setImmediate)
assert.match(text(render()),/Teste atual/);assert.doesNotMatch(text(render()),/Loja A/)
tree=render();tree.find(n=>n.type==='select'&&n.props.value==='').props.onChange({target:{value:'b'}});render();for(const effect of effects.splice(0))effect()
assert.equal(requests[3].args.p_store,'b')
tree=render();tree.find(n=>n.type==='input'&&n.props.type==='date').props.onChange({target:{value:'2026-10-21'}});render();for(const effect of effects.splice(0))effect()
assert.equal(requests[4].args.p_from,'2026-10-21')
requests[4].resolve({data:{...state,sales:[],stores:[{...state.stores[1],name:'Filtro atual'}],products:[]},error:null});await new Promise(setImmediate)
requests[3].resolve({data:state,error:null});await new Promise(setImmediate)
tree=render();assert.match(text(tree),/Filtro atual/);assert.doesNotMatch(text(tree),/Loja A/)
assert.ok(tree.some(n=>n.type==='option'&&n.props.value==='p'),'product choices survive a filtered empty report')
tree.find(n=>n.type==='button').props.onClick();requests[5].resolve({data:null,error:{code:'PGRST202',message:'missing'}});await new Promise(setImmediate)
assert.match(text(render()),/ainda não está disponível/)
assert.doesNotMatch(source,/setInterval|halloween_profit_/)
console.log('PASS margin dashboard: initial load, read-only forms, permanent per-store unlock, unknown cost, refresh and stale campaign response')
})().catch(e=>{console.error(e);process.exitCode=1})
