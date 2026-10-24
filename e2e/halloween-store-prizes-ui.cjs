const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const file=path.join(__dirname,'../app/painel/promocoes/halloween/StorePrizes.tsx');assert.ok(fs.existsSync(file),'internal per-store stock component exists')
const hooks=[],calls=[],out={};let cursor=0,effects=[]
vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,{exports:out,document:{hidden:false,addEventListener(){},removeEventListener(){}},require:n=>{
if(n==='react/jsx-runtime')return require(n)
if(n==='@/lib/supabase/client')return {createClient:()=>({rpc:(name,args)=>new Promise(resolve=>calls.push({name,args,resolve}))})}
if(n==='react')return {useState:x=>{const i=cursor++;if(!(i in hooks))hooks[i]=typeof x==='function'?x():x;return [hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v]},useRef:x=>{const i=cursor++;return hooks[i]??(hooks[i]={current:x})},useEffect:(fn,deps)=>{const i=cursor++;if(!hooks[i]||deps.some((d,k)=>d!==hooks[i][k])){hooks[i]=deps;effects.push(fn)}}}
throw Error(n)}})
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):!n||typeof n!=='object'?[]:[n,...nodes(n.props?.children)]
const render=campaign=>{cursor=0;return nodes(out.default({campaign}))}
const tick=()=>new Promise(setImmediate),flush=()=>effects.splice(0).forEach(fn=>fn())
const prize={store_id:'tere',store_name:'Teresópolis',slot:12,code:'05090',name:'Kit Yaxun YX-6028',quantity:0,remaining:0,enabled:false}
;(async()=>{
let tree=render('halloween-2026');flush();assert.equal(calls[0].name,'halloween_store_prizes_state')
calls[0].resolve({data:[prize],error:null});await tick();tree=render('halloween-2026')
assert.equal(tree.find(n=>n.type==='input'&&n.props.type==='number').props.value,'0')
const save=()=>render('halloween-2026').filter(n=>n.type==='button').at(-1)
assert.equal(save().props.disabled,true);save().props.onClick();assert.equal(calls.length,1,'no configure without physical stock confirmation')
tree.find(n=>n.type==='input'&&n.props.type==='number').props.onChange({target:{value:'2'}});tree=render('halloween-2026');tree.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}})
save().props.onClick();assert.equal(calls[1].name,'halloween_configure_store_prize');assert.deepEqual(JSON.parse(JSON.stringify(calls[1].args)),{p_campaign:'halloween-2026',p_store:'tere',p_slot:12,p_quantity:2,p_confirm:true})
render('halloween-2026-test');flush();calls[2].resolve({data:[{...prize,name:'Campanha atual'}],error:null});await tick()
calls[1].resolve({data:null,error:null});await tick();assert.equal(calls.length,3,'old save cannot reload the new campaign')
tree=render('halloween-2026-test');assert.ok(tree.some(n=>n.type==='strong'&&n.props.children==='Campanha atual'))
render('halloween-2026');flush();render('halloween-2026-test');flush()
calls[4].resolve({data:[{...prize,name:'Leitura atual'}],error:null});await tick();calls[3].resolve({data:[prize],error:null});await tick()
tree=render('halloween-2026-test');assert.ok(tree.some(n=>n.type==='strong'&&n.props.children==='Leitura atual'),'stale state response discarded')
tree.find(n=>n.type==='button').props.onClick();calls[5].resolve({data:null,error:{code:'PGRST202',message:'missing'}});await tick()
tree=render('halloween-2026-test');assert.ok(tree.some(n=>n.props?.role==='alert'&&n.props.children.includes('ainda não está instalado')))
console.log('PASS internal store prizes: zero defaults, explicit confirmation, exact store/slot RPC args and stale save isolation')
})().catch(e=>{console.error(e);process.exitCode=1})
