const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
function fixture(contaReembolso=null){
 const rows={formas_pagamento:[{id:'pix',tipo:'pix',conta_destino_id:'a'}],
  forma_conta_loja:[{forma_id:'pix',loja_id:'loja-b',conta_id:'b'}],
  pagamentos_venda:[{venda_id:'v',forma_pagamento_id:'pix',valor:135,status:'pago'}],
  vendas:[{id:'v',deposito_id:'dep',status:'concluida'}],depositos:[{id:'dep',loja_id:'loja-b'}],
  lancamentos:[{tipo:'receber',status:'pago',valor:135,conta_id:null,venda_id:'v',descricao:'Venda #1'},
   {tipo:'pagar',status:'pago',valor:135,conta_id:contaReembolso,loja_id:'loja-b',forma_pagamento:'pix',descricao:'Devolução — QA'}],
  transferencias:[],movimentos_caixa:[]}
 const sb={from(table){let data=[...(rows[table]??[])]; const q={select(){return q},range(){return q},
  eq(k,v){data=data.filter(r=>r[k]===v);return q},is(k,v){data=data.filter(r=>r[k]===v);return q},
  not(k,op,v){data=data.filter(r=>r[k]!==v);return q},in(k,v){data=data.filter(r=>v.includes(r[k]));return q},
  ilike(){return q},then(resolve){return Promise.resolve({data}).then(resolve)}};return q}}
 const module={exports:{}}
 const src=ts.transpileModule(fs.readFileSync('lib/saldos-contas.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 vm.runInNewContext(src,{module,exports:module.exports,require:()=>({fetchAll:async f=>(await f(0,999)).data})})
 return ()=>module.exports.calcularSaldosContas(sb,[{id:'a',tipo:'banco',saldo_inicial:0},{id:'b',tipo:'banco',saldo_inicial:0}])
}
test('saldo legado: reembolso Pix usa rota da loja, sem descontar da outra unidade',async()=>{
 const saldo=await fixture()();assert.equal(saldo.a,0);assert.equal(saldo.b,0)
})
test('saldo: conta explícita do reembolso desconta uma vez; entrada automática não duplica',async()=>{
 const saldo=await fixture('b')();assert.equal(saldo.a,0);assert.equal(saldo.b,0)
})
