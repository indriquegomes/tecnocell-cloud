const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function fixture({falha=false, existente=false}={}) {
  const calls=[]
  const dados={id:'pedido',unidade:'Petrópolis',pessoaId:'p1',vendaId:existente?'v1':null,
    depositos:[{id:'d1'}],itens:[{id:'peca',nome:'Peça',quantidade:1,preco:135}]}
  const q={select(){return this},eq(){return this},in(){return this},maybeSingle:async()=>({data:{nome:'Operador',status:'concluida',total:135,numero:1,vendedor_nome:'Operador'}}),
    then(yes){return Promise.resolve({data:[{produto_id:'peca',quantidade:2}]}).then(yes)}}
  const imports={
    '@/lib/supabase/server':{requirePermissao:async()=>({id:'op'}),createServiceClient:async()=>({from:()=>q})},
    '../pedidos-app/actions':{carregarPedidoAppPDV:async()=>dados,finalizarPedidoAppPDV:async(...args)=>{calls.push(args);return falha?{erro:'incerto'}:{vendaId:'v1',vendaNumero:1,jaExistia:existente}}},
    '@/lib/log-atividade':{logAtividade:async()=>{}}, '@/lib/mercado-livre':{sincronizarEstoqueML:async()=>{}},
  }
  const module={exports:{}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/painel/pdv/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {module,exports:module.exports,console,require:name=>imports[name]??{}})
  const args=['token',[{produto_id:'peca',nome:'Peça',quantidade:1,preco_unitario:135}],
    [{forma_pagamento_id:'fiado',valor:135,taxa:0,maquina:'',parcelas:1,status:'pendente'}], 'p1',0,'','d1',[],0,0,'retirada',null,null,null,null,{pedidoId:'pedido',unidade:'Petrópolis'}]
  return {run:()=>module.exports.finalizarVenda(...args),calls,args}
}
test('finalizador oficial despacha pedido exclusivamente para a transação do App', async()=>{
  const f=fixture(); const r=await f.run(); assert.equal(r.vendaId,'v1'); assert.equal(f.calls.length,1)
  assert.equal(f.calls[0][0],'pedido'); assert.equal(r.total,135)
})
test('erro da transação do App não cai no finalizador genérico', async()=>{
  const f=fixture({falha:true}); assert.equal((await f.run()).erro,'incerto'); assert.equal(f.calls.length,1)
})
test('alteração comercial é recusada antes da transação', async()=>{
  for(const alterar of [a=>a[1][0].preco_unitario=1,a=>a[1][0].quantidade=2,a=>a[3]='outro',a=>a[4]=1,a=>a[8]=1,a=>a[6]='outra']){
    const f=fixture(); alterar(f.args); assert.ok((await f.run()).erro); assert.equal(f.calls.length,0)
  }
})

test('cancelamento oficial exige Devolução depois de quitação F9', async()=>{
  let rpc=0
  const rows={vendas:{data:'2026-10-20T12:00:00Z'},pagamentos_venda:[{valor:135,status:'pendente',formas_pagamento:{tipo:'fiado',nome:'Crédito Loja'}}],
    lancamentos:[{valor:135,valor_pago:135,historico_pagamentos:[{forma:'Pix',valor:135}]}]}
  const service={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:rows[table]}),then(yes){return Promise.resolve({data:rows[table]}).then(yes)}};return q},rpc:async()=>{rpc++;return {data:{}}}}
  const module={exports:{}}
  const imports={'@/lib/supabase/server':{requirePermissao:async()=>({id:'op'}),createServiceClient:async()=>service},'@/lib/fechamento':{travarSeMesFechado:async()=>null},'next/cache':{revalidatePath(){}}}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/painel/vendas/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {module,exports:module.exports,require:name=>imports[name]??{}})
  const r=await module.exports.cancelarVenda('v1','Teste')
  assert.equal(r.ok,false);assert.match(r.erro,/Devolução/);assert.equal(rpc,0)
})
