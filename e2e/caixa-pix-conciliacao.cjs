const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
async function tela({fechado=false,parcial=false,outroTurno=false,falha=false}={}) {
 const hora='2026-10-20T12:00:00Z'
 const rows={lojas:[{id:'l',nome:'Petrópolis',ativa:true}],
  caixas:[{id:'cx',loja_id:'l',status:fechado?'fechado':'aberto',aberto_em:hora,fechado_em:fechado?'2026-10-20T20:00:00Z':null,valor_abertura:200}],
  formas_pagamento:[{id:'pix',nome:'PIX',tipo:'pix',ativo:true}],
  vendas:[{id:'v',numero:8414,total:135,created_at:hora,forma_pagamento_id:'pix',pessoa_id:'p',status:'concluida',caixa_id:outroTurno?'antigo':'cx'}],
  pagamentos_venda:[{venda_id:'v',forma_pagamento_id:'pix',valor:135,taxa:0,status:'pago'}],pessoas:[{id:'p',nome:'QA'}],
  devolucoes:[{id:'dev',venda_id:'v',valor_total:parcial?45:135,tipo_credito:'pix',status:'concluida',caixa_id:'cx',abate_fiado:0,
   reembolsos:[{tipo:'pix',valor:parcial?45:135}],created_at:'2026-10-20T12:01:00Z',depositos:{loja_id:'l'}}],
  itens_venda:[{venda_id:'v',produto_id:'a',quantidade:3}],itens_devolucao:[{devolucao_id:'dev',produto_id:'a',quantidade:parcial?1:3}],
  movimentos_caixa:[],lancamentos:[],comprovantes_pix:[]}
 const sb={from(table){let data=[...(rows[table]??[])];let erro=false
  const val=(r,k)=>k.split('.').reduce((v,p)=>v?.[p],r)
  const q={select(){return q},order(){return q},limit(n){data=data.slice(0,n);return q},range(){return q},
   eq(k,v){data=data.filter(r=>val(r,k)===v);return q},neq(k,v){data=data.filter(r=>val(r,k)!==v);return q},
   in(k,ids){data=data.filter(r=>ids.includes(r[k]));return q},gte(k,v){data=data.filter(r=>r[k]>=v);return q},lte(k,v){data=data.filter(r=>r[k]<=v);return q},
   gt(k,v){data=data.filter(r=>r[k]>v);return q},not(){return q},ilike(){return q},
   throwOnError(){erro=falha&&table==='devolucoes';return q},
   maybeSingle:async()=>({data:data[0]??null}),then(ok,nao){return (erro?Promise.reject(Error('Falha de leitura devoluções')):Promise.resolve({data})).then(ok,nao)}};return q}}
 const server={createServiceClient:async()=>sb,requireAuth:async()=>({email:'qa'}),
  fetchAll:async f=>(await f(0,999)).data,
  fetchAllIn:async(ids,f)=>ids.length?(await f(ids,0,999)).data:[]}
 const cache={}; const imports={'@/lib/supabase/server':server,
  '@/lib/lojas-usuario':{lojasDoUsuario:async()=>({ativa:{id:'l'},operaveis:[{id:'l'}]})},
  './OperacaoClient':{OperacaoClient:'OperacaoClient'},'react/jsx-runtime':{jsx:(type,props)=>({type,props})}}
 const carregar=(file)=>{if(cache[file])return cache[file];const module={exports:{}};
  const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
  vm.runInNewContext(src,{module,exports:module.exports,Date,Map,Set,console,require:n=>{
   if(imports[n])return imports[n]
   if(n.startsWith('@/'))return carregar(n.replace('@/', '')+'.ts')
   throw Error('Import inesperado '+n)
  }});return cache[file]=module.exports}
 return (await carregar('app/painel/pdv/operacao/page.tsx').default({searchParams:Promise.resolve(fechado?{fechado:'1',esperado:'200',contado:'200'}:{})})).props
}
test('caixa aberto: Pix integral devolvido zera líquido, some do alerta e preserva gaveta',async()=>{
 const p=await tela();assert.equal(p.porTipo.pix,0);assert.equal(p.totalVendas,0);assert.equal(p.estornosPix,135)
 assert.equal(p.pixPendentes.length,0);assert.equal(p.caixaAberto.valor_abertura,200);assert.equal(p.totalDevolucoes,0)
 assert.equal(p.vendasDetalhe[0].devolvida,true);assert.equal(p.vendasDetalhe[0].total,135)
})
test('relatório Z usa o mesmo estorno sem alterar conferência do dinheiro',async()=>{
 const p=await tela({fechado:true});assert.equal(p.zReport.porTipo.pix,0);assert.equal(p.zReport.totalVendas,0)
 assert.equal(p.zReport.estornosPix,135);assert.equal(p.zReport.valorEsperado,200)
})
test('parcial continua cobrando comprovante original e só abate reembolso efetivo',async()=>{
 const p=await tela({parcial:true});assert.equal(p.porTipo.pix,90);assert.equal(p.pixPendentes.length,1)
 assert.equal(p.pixPendentes[0].valor,135);assert.equal(p.vendasDetalhe[0].devolvida,false)
})
test('reembolso de venda antiga sai só no turno atual e não da gaveta',async()=>{
 const p=await tela({outroTurno:true});assert.equal(p.porTipo.pix,-135);assert.equal(p.totalVendas,-135)
 assert.equal(p.totalDevolucoes,0);assert.equal(p.caixaAberto.valor_abertura,200)
})
test('falha na leitura financeira impede mostrar fechamento sem estornos',async()=>{
 await assert.rejects(tela({falha:true}),/Falha de leitura/)
})
