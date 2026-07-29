const fs=require('fs')
const { chromium } = require('C:/Users/usuario/projetos/tecnocell-cloud/node_modules/playwright')
const PERFIL='C:/Users/usuario/AppData/Local/Temp/claude/c--Users-usuario-projetos-tecnocell-cloud/7df43105-50c7-405f-8272-3906157a1371/scratchpad/sige-profile'
const CAP=JSON.parse(fs.readFileSync('CAPTURA-ESTOQUE-FINAL.json','utf8'))
const BODY=JSON.parse(CAP.body)
;(async()=>{
  const ctx=await chromium.launchPersistentContext(PERFIL,{headless:true})
  const p=ctx.pages()[0]||await ctx.newPage()
  // pega um token fresco escutando uma chamada real
  let hdrs=null
  p.on('request', r=>{ if(/apiapp/.test(r.url()) && r.headers().authorization && !hdrs) hdrs=r.headers() })
  await p.goto('https://app.sigecloud.com.br/',{waitUntil:'domcontentloaded',timeout:60000})
  await p.waitForTimeout(9000)
  if (!hdrs) { console.log('nao peguei token'); await ctx.close(); return }
  const H={ authorization:hdrs.authorization, 'content-type':'application/json; charset=UTF-8', accept:'application/json, text/plain, */*', referer:'https://app.sigecloud.com.br/' }
  const LIM=1000; let skip=0; const linhas=[]
  for(;;){
    const r = await p.request.post('https://apiapp.sigecloud.com.br/v3/ReportEstoques/list-data?skip='+skip+'&limit='+LIM,{ headers:H, data:BODY, timeout:60000 }).catch(e=>null)
    if (!r) { console.log('erro de rede no skip '+skip); break }
    if (!r.ok()) { console.log('HTTP '+r.status()+' no skip '+skip); break }
    const j=await r.json()
    const arr=(j.Data&&(j.Data.Dados||j.Data.Itens))||j.Data||[]
    if (!Array.isArray(arr)||!arr.length) break
    linhas.push(...arr)
    console.log('  skip '+skip+' -> +'+arr.length+' (total '+linhas.length+')')
    if (arr.length<LIM) break
    skip+=LIM
    if (skip>60000) break
  }
  await ctx.close()
  if (!linhas.length) { console.log('nada'); return }
  fs.writeFileSync('sige-estoque-HOJE.json', JSON.stringify(linhas))
  console.log('\n✅ ESTOQUE DO SIGE PUXADO: ' + linhas.length + ' linhas -> sige-estoque-HOJE.json')
  console.log('\nCAMPOS: ' + Object.keys(linhas[0]).join(', '))
  console.log('\nexemplo: ' + JSON.stringify(linhas[0]).slice(0,300))
})().catch(e=>console.error('ERRO: '+e.message))
