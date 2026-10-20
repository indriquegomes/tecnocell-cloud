// Componente real e motor de pagamento real; somente fronteiras de rede são fixtures.
// Nenhuma sessão, pedido ou serviço de produção é acessado.
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const {chromium} = require('playwright')
const root=path.resolve(__dirname,'..')
function bundle(){
  const modules=[],ids=new Map()
  function add(file){
    if(ids.has(file)) return ids.get(file)
    const id=modules.length;ids.set(file,id);modules.push('')
    let src
    if(file==='@fixture/actions') src=`module.exports=new Proxy({}, {get:(_,name)=>async(...args)=>window.fixtureCall(name,args)})`
    else if(file==='@fixture/supabase') src=`exports.createClient=()=>({auth:{getSession:async()=>({data:{session:{user:{id:window.fixtureUser??'qa'},access_token:'fake'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})`
    else src=fs.readFileSync(file,'utf8')
    if(/\.tsx?$/.test(file))src=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
    src=src.replace(/require\(["']([^"']+)["']\)/g,(_,name)=>{
      let dest
      if(name==='@/lib/supabase/client') dest='@fixture/supabase'
      else if(name.endsWith('/actions')||name==='./actions') dest='@fixture/actions'
      else if(name.startsWith('@/'))dest=['.ts','.tsx','.js'].map(ext=>path.join(root,name.slice(2)+ext)).find(f=>fs.existsSync(f))
      else if(name.startsWith('.')&&['.ts','.tsx'].some(ext=>fs.existsSync(path.resolve(path.dirname(file),name+ext))))dest=['.ts','.tsx'].map(ext=>path.resolve(path.dirname(file),name+ext)).find(f=>fs.existsSync(f))
      else dest=require.resolve(name,{paths:[path.dirname(file)]})
      return `require(${add(dest)})`
    })
    modules[id]=`function(module,exports,require){${src}\n}`;return id
  }
  const component=add(path.join(root,'app/painel/pdv/PDVClient.tsx'))
  const react=add(require.resolve('react')),dom=add(require.resolve('react-dom/client'))
  return `const process={env:{NODE_ENV:'production'}};const modules=[${modules.join(',')}],cache={};function require(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,require);return m.exports}window.renderPDV=props=>{window.reactRoot??=require(${dom}).createRoot(document.getElementById('root'));window.reactRoot.render(require(${react}).createElement(require(${component}).PDVClient,props))};`
}
const pedido={id:'00000000-0000-4000-8000-000000000002',unidade:'Petrópolis',lojaId:'l1',pessoaId:'p1',cliente:'Cliente QA',pessoa:{id:'p1',nome:'Cliente QA',permite_fiado:true},permiteFiado:true,formaEntrega:'retirada',vendaId:null,
  depositos:[{id:'d1',nome:'PETRÓPOLIS LOJA',loja_id:'l1'}],seriesPorProduto:{},total:135,
  itens:[{id:'peca',nome:'Peça QA',codigo:'QA',quantidade:1,preco:135,serializado:false,estoquePorDeposito:{d1:4}}]}
const props={produtos:[],pessoas:[],formas:[{id:'fiado',nome:'Crédito Loja (Fiado)',tipo:'fiado',loja_id:null},{id:'dinheiro',nome:'Dinheiro',tipo:'dinheiro',loja_id:null}],depositos:pedido.depositos,
  lojas:[{id:'l1',nome:'Petrópolis',deposito_padrao_id:'d1'}],maquinas:[],tabelas:[],precosPorTabela:{},promosPorProduto:{peca:[{id:'promo',nome:'Promo QA',tipo:'valor_direto',preco_promocional:1}]},seriesPorProduto:{},pedidoEntrada:{pedidoId:pedido.id,unidade:pedido.unidade}}
test('PDV oficial importa pedido, protege carrinho e usa finalizador e cupom nativos',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PDV browser:',e.message)})
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}))
  await page.addInitScript(()=>{window.print=()=>{}})
  await page.goto('http://pdv.test')
  await page.evaluate(({pedido,props})=>{
    window.fixturePedido=pedido;window.fixtureProps=props;window.calls=[]
    window.fetch=async url=>({ok:true,json:async()=>String(url).includes('caixa-aberto')?{aberto:true}:String(url).includes('clientes')?{clientes:[]}:[]})
    window.fixtureCall=async(name,args)=>{
      window.calls.push({name,args})
      if(name==='carregarPedidoAppPDV')return window.fixturePedido
      if(name==='buscarSaldoCredito')return window.adiarSaldo ? new Promise(resolve=>window.resolverSaldo=resolve) : {saldo:0}
      if(name==='buscarFiadoCliente')return {permite_fiado:true,limite:1000,disponivel:1000,devendo:0}
      if(name==='finalizarVenda')return {vendaId:'v-qa',vendaNumero:1,total:135,vendedorNome:'QA',estoqueAtualizado:{peca:3}}
      if(name==='buscarCupomVenda')return {numero:1,itens:[{codigo:'QA',nome:'Peça QA',quantidade:1,preco_unitario:135}],pagamentos:[{forma_nome:'Crédito Loja (Fiado)',valor:135,taxa:0,parcelas:1,status:'pendente'}],cliente:'Cliente QA',deposito:'PETRÓPOLIS LOJA',loja:'Petrópolis',desconto:0,horario:'20/10/2026',pedidoApp:{pedidoId:window.fixturePedido.id,unidade:'Petrópolis'}}
      if(name==='buscarItensTabela')return []
      return []
    }
  },{pedido,props})
  await page.addScriptTag({content:bundle()})
  await page.evaluate(()=>window.renderPDV(window.fixtureProps))
  await page.getByTestId('pedido-app-vinculo').waitFor({timeout:7000})
  console.log('PDV: pedido importado')
  assert.equal(errors.length,0,errors.join('\n'))
  assert.equal(await page.getByLabel('Preço ou desconto: Peça QA').isDisabled(),true)
  assert.equal(await page.getByLabel('Loja do PDV').isDisabled(),true)
  assert.equal(await page.getByLabel('Quantidade: Peça QA').inputValue(),'1')
  assert.match(await page.locator('body').innerText(),/135,00/)
  await page.getByRole('button',{name:/Pagamento|Ir para pagamento|Pagar/i}).first().click()
  await page.getByRole('button',{name:/Crédito Loja/}).first().click()
  await page.getByRole('button',{name:/Finalizar|Concluir/}).first().click()
  await page.getByRole('button',{name:/Confirmar/}).last().click()
  await page.getByRole('button',{name:'Nova Venda',exact:true}).waitFor()
  const call=await page.evaluate(()=>window.calls.find(c=>c.name==='finalizarVenda'))
  assert.equal(call.args[1][0].preco_unitario,135)
  assert.equal(call.args[2][0].status,'pendente')
  assert.deepEqual(call.args[15],props.pedidoEntrada)
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).carrinho.length),0)
  const cupom=await page.locator('iframe').first().evaluate(el=>el.contentDocument.body.innerText)
  assert.match(cupom,/Origem: Aplicativo/);assert.match(cupom,new RegExp(pedido.id))

  // Rascunho de balcão existente: a entrada do pedido pede confirmação antes de substituir.
  await page.evaluate(()=>{
    const r=JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa'))
    r.carrinho=[{produto_id:'balcao',nome:'Atendimento de balcão QA',codigo:'B',quantidade:2,preco_unitario:50,desconto_tipo:'final',desconto_valor:null,estoque_disponivel:5,promoSel:''}]
    r.produtos=[{id:'balcao',nome:'Atendimento de balcão QA',preco:50,codigo:'B',estoquePorDeposito:{d1:5}}]
    r.observacoes='Preservar balcão';r.pedidoApp=null;r.tipoEntrega='retirada';r.etapa='venda'
    window.draftBalcao=r
    window.remontar=(draft,options={})=>{
      window.reactRoot.unmount();window.reactRoot=null
      if(draft)sessionStorage.setItem('pdv_rascunho_v1:qa',JSON.stringify(draft))
      window.renderPDV({...window.fixtureProps,...options})
    }
    window.remontar(r)
  })
  await page.getByRole('dialog',{name:'Substituir atendimento atual'}).waitFor()
  await page.getByRole('button',{name:'Manter atendimento atual',exact:true}).click()
  assert.match(await page.locator('body').innerText(),/Atendimento de balcão QA/)
  assert.equal(await page.getByTestId('pedido-app-vinculo').count(),0)
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).observacoes),'Preservar balcão')
  await page.evaluate(()=>window.remontar(window.draftBalcao))
  await page.getByRole('button',{name:'Substituir pelo pedido',exact:true}).click()
  await page.getByTestId('pedido-app-vinculo').waitFor()
  assert.equal(await page.getByText('Atendimento de balcão QA',{exact:true}).count(),0)
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Desvincular e limpar',exact:true}).click()
  assert.equal(await page.getByTestId('pedido-app-vinculo').count(),0)
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).carrinho.length),0)
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).pessoaId),'')

  // Outro operador não herda o carrinho da chave anterior.
  await page.evaluate(()=>{window.fixtureUser='qa2';window.remontar(window.draftBalcao,{pedidoEntrada:null})})
  await page.getByRole('button',{name:/Adicione produtos pra vender/}).waitFor()
  assert.equal(await page.getByText('Atendimento de balcão QA',{exact:true}).count(),0)

  // Venda existente abre somente consulta/reimpressão, preservando o balcão.
  await page.evaluate(()=>{window.fixtureUser='qa';window.fixturePedido={...window.fixturePedido,vendaId:'v-qa'};window.remontar(window.draftBalcao)})
  await page.getByRole('button',{name:'Reimprimir pedido',exact:true}).waitFor()
  await page.evaluate(()=>window.open=()=>null)
  await page.getByRole('button',{name:'Reimprimir pedido',exact:true}).click()
  assert.match(await page.locator('body').innerText(),/Atendimento de balcão QA/)
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='finalizarVenda').length),1)

  // Seleção de IMEI conserva a quantidade contratada e impede escolher séries extras.
  await page.evaluate(()=>{
    window.fixturePedido={...window.fixturePedido,vendaId:null,seriesPorProduto:{peca:{d1:['123456','654321']}},itens:window.fixturePedido.itens.map(i=>({...i,serializado:true}))}
    const limpo={...window.draftBalcao,carrinho:[],produtos:[],observacoes:''}
    window.remontar(limpo)
  })
  await page.getByRole('button',{name:'123456',exact:true}).click()
  await page.getByRole('button',{name:'654321',exact:true}).click()
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).carrinho[0].quantidade),1)
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).carrinho[0].series.length),1)
  // Mesma hidratação com dinheiro/troco, Pix e cartão parcelado no motor existente.
  await page.evaluate(()=>{
    window.fixturePedido={...window.fixturePedido,itens:window.fixturePedido.itens.map(i=>({...i,serializado:false}))}
    window.fixtureProps.formas.push({id:'pix',nome:'PIX',tipo:'pix',loja_id:null},{id:'credito',nome:'Cartão de Crédito',tipo:'cartao_credito',loja_id:null,maquina_id:'maq'})
    window.fixtureProps.maquinas=[{id:'maq',nome:'Máquina QA',taxa_debito:1,taxas_credito:[2,3],max_parcelas:2}]
    window.remontar({...window.draftBalcao,carrinho:[],produtos:[],observacoes:''})
  })
  const concluir=async()=>{
    await page.getByRole('button',{name:/Finalizar|Concluir/}).first().click()
    try { await page.getByRole('button',{name:/Confirmar/}).last().click() }
    catch(e) { console.error((await page.locator('body').innerText()).slice(-5500)); throw e }
    await page.getByRole('button',{name:'Nova Venda',exact:true}).waitFor()
    return page.evaluate(()=>window.calls.filter(c=>c.name==='finalizarVenda').at(-1).args[2])
  }
  const reiniciar=async()=>{
    await page.evaluate(()=>window.remontar({...window.draftBalcao,carrinho:[],produtos:[],observacoes:''}))
    await page.getByTestId('pedido-app-vinculo').waitFor()
    await page.getByRole('button',{name:/Ir para pagamento/}).click()
  }
  await page.getByRole('button',{name:/Ir para pagamento/}).click()
  await page.getByRole('button',{name:/Dinheiro/}).first().click()
  await page.locator('input[inputmode="numeric"]').first().fill('15000')
  await page.waitForFunction(()=>Number(JSON.parse(sessionStorage.getItem('pdv_rascunho_v1:qa')).pagamentos[0].valor)===150)
  const dinheiro=await concluir()
  assert.equal(dinheiro[0].valor,135);assert.equal(dinheiro[0].forma_pagamento_id,'dinheiro')
  await reiniciar()
  await page.getByRole('button',{name:/PIX/}).first().click()
  assert.equal((await concluir())[0].forma_pagamento_id,'pix')
  await reiniciar()
  await page.getByRole('button',{name:/Cartão de Crédito/}).first().click()
  await page.getByRole('button',{name:'2x',exact:true}).click()
  const cartao=await concluir()
  assert.equal(cartao[0].taxa,4.05);assert.equal(cartao[0].parcelas,2);assert.equal(cartao[0].maquina,'Máquina QA')
  await page.evaluate(()=>{window.adiarSaldo=true;window.fixtureProps.formas.push({id:'vale',nome:'Vale Crédito',tipo:'vale_credito'});window.remontar({...window.draftBalcao,carrinho:[],produtos:[],observacoes:''})})
  await page.getByTestId('pedido-app-vinculo').waitFor()
  await page.waitForFunction(()=>!!window.resolverSaldo)
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Desvincular e limpar',exact:true}).click()
  await page.evaluate(async()=>{window.resolverSaldo({saldo:999});await new Promise(resolve=>setTimeout(resolve,0))})
  assert.equal(await page.getByText(/Saldo em conta:/).count(),0,'resposta antiga não pode restaurar saldo de cliente desvinculado')
  await page.getByPlaceholder('Buscar produto por nome ou código...  (F2)').fill('Peça QA')
  await page.getByPlaceholder('Buscar produto por nome ou código...  (F2)').press('Enter')
  await page.getByRole('button',{name:/Ir para pagamento/}).click()
  assert.equal(await page.getByRole('button',{name:/Vale Crédito/}).count(),0,'novo balcão não pode usar saldo do cliente anterior')
  assert.equal(errors.length,0,errors.join('\n'))
 }finally{await browser.close()}
})
