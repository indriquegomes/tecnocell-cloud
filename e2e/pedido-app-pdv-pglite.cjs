// Integração local: funções SQL reais lidas das migrations, sem Supabase remoto.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const migrations = path.join(__dirname,'../supabase/migrations')
const ler = nome => fs.readFileSync(path.join(migrations,nome),'utf8')
function funcao(arquivo,nome) {
  const sql=ler(arquivo)
  const inicio=sql.search(new RegExp(`create(?: or replace)? function public\\.${nome}\\(`,'i'))
  assert.ok(inicio>=0,`definição real de ${nome}`)
  const corpo=sql.slice(inicio)
  const tag=corpo.match(/as\s+(\$[a-z_]*\$)/i)[1]
  return corpo.slice(0,corpo.indexOf(tag,corpo.indexOf(tag)+tag.length)+tag.length)+';'
}
async function fixture(){
 const db=new PGlite()
 try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create sequence venda_numero_seq start 101;
 create table pessoas(id text primary key,nome text,ativo boolean,nao_vender boolean,permite_fiado boolean);
 create table cargos(id uuid primary key,ativo boolean,is_master boolean,permissoes text[]);
 create table perfis(id uuid primary key,nome text,ativo boolean,is_master boolean default false,permissoes text[] default '{}',cargo_id uuid,lojas_permitidas uuid[]);
 create table cadastros_clientes(user_id uuid,pessoa_id text,status text);
 create table pedidos_app(id uuid primary key,user_id uuid,pessoa_id text,status text,status_pagamento text,itens jsonb);
 create table lojas(id uuid primary key,ativa boolean);
 create table contas(id uuid primary key,ativa boolean default true);
 create table forma_conta_loja(forma_id text,loja_id uuid,conta_id uuid);
 create table pedidos_app_unidades(unidade text primary key,loja_id uuid);
 create table vendas(id uuid primary key default gen_random_uuid(),numero integer,total numeric,caixa_id uuid,status text,
   desconto numeric,forma_pagamento_id text,pessoa_id text,observacoes text,deposito_id text,vendedor_id uuid,vendedor_nome text,tipo_entrega text,endereco_entrega text);
 create table itens_venda(venda_id uuid,produto_id text,quantidade numeric,preco_unitario numeric,desconto_item numeric,total_item numeric);
 create table pedidos_app_atendimentos(pedido_id uuid references pedidos_app(id),unidade text references pedidos_app_unidades(unidade),confirmado_em timestamptz not null default now(),primary key(pedido_id,unidade));
 create table depositos(id text primary key,nome text,loja_id uuid,ativo boolean);
 create table caixas(id uuid primary key,loja_id uuid,status text,aberto_em timestamptz default now());
 create table produtos(id text primary key,ativo boolean,preco_custo numeric,preco_minimo numeric,controla_serie boolean,permite_estoque_negativo boolean default false);
 create table estoque(id uuid default gen_random_uuid(),produto_id text,deposito_id text,quantidade numeric,updated_at timestamptz,primary key(produto_id,deposito_id));
 create table formas_pagamento(id text primary key,ativo boolean,loja_id uuid,tipo text,maquina_id text,conta_destino_id uuid);
 create table maquinas_cartao(id text primary key,nome text,ativo boolean,taxa_debito numeric,taxas_credito jsonb,max_parcelas integer);
 create table pagamentos_venda(venda_id uuid,forma_pagamento_id text,status text,valor numeric,taxa numeric,maquina text,parcelas int);
 create table lancamentos(id text primary key default gen_random_uuid()::text,venda_id uuid,tipo text,status text,descricao text,valor numeric,valor_pago numeric default 0,
   data_competencia date,data_vencimento date,data_pagamento date,updated_at timestamptz,created_at timestamptz default now(),pessoa_nome text,loja_id uuid,conta_id uuid,forma_pagamento text,historico_pagamentos jsonb);
 create table numeros_serie(produto_id text,deposito_id text,serie text,status text,venda_id text,updated_at timestamptz);
 create table creditos_clientes(pessoa_id text,pessoa_nome text,valor numeric,tipo text,descricao text,venda_id text,loja_id uuid,devolucao_id uuid);
 create table devolucoes(id uuid primary key,venda_id uuid,deposito_id text,pessoa_nome text,vendedor_nome text,motivo text,valor_total numeric,tipo_credito text,status text,created_at timestamptz default now());
 create table itens_devolucao(devolucao_id uuid,produto_id text,nome text,quantidade numeric,preco_unitario numeric,total_item numeric,status_produto text);
 create table recebimentos_lote_operacoes(id uuid primary key,pedido jsonb,resultado jsonb);
 create table movimentos_caixa(caixa_id uuid,tipo text,motivo text,forma_pagamento text,valor numeric);
 insert into pessoas values('p1','Cliente QA',true,false,true);
 insert into perfis(id,nome,ativo,permissoes) values('${uuid(11)}','Operador QA',true,array['pdv']);
 insert into cadastros_clientes values('${uuid(1)}','p1','aprovado');
 insert into lojas values('${uuid(21)}',true),('${uuid(22)}',true);
 insert into pedidos_app_unidades values('Petrópolis','${uuid(21)}'),('Outra','${uuid(22)}');
 insert into depositos values('d1','PETRÓPOLIS LOJA','${uuid(21)}',true),('d-outra','Outra','${uuid(22)}',true);
 insert into caixas(id,loja_id,status) values('${uuid(31)}','${uuid(21)}','aberto');
 insert into produtos(id,ativo,preco_custo,preco_minimo,controla_serie) values('peca',true,4,5,false);
 insert into estoque(produto_id,deposito_id,quantidade) values('peca','d1',10),('peca','d-outra',10);
 insert into formas_pagamento(id,ativo,loja_id,tipo,maquina_id) values('pix',true,null,'pix',null),('fiado',true,null,'fiado',null),('credito',true,null,'cartao_credito','maq1');
 insert into maquinas_cartao values('maq1','Máquina QA',true,1,'[2,3]',2);
 `)
 // Todas as funções de negócio abaixo são extraídas sem alterar seus corpos.
 await db.exec(funcao('20261017140435_pedidos_app_atendimento_sem_financeiro.sql','validar_operador_pedido_app'))
 await db.exec(funcao('2026-09-19_finalizar-devolucao-recebimento-atomico.sql','finalizar_venda'))
 await db.exec(funcao('2026-09-06_pdv_desconto_item_recebimento_lote.sql','finalizar_venda_com_desconto_item'))
 await db.exec(funcao('2026-09-19_fiado-loja-e-recebimento-atomico.sql','definir_loja_lancamento'))
 await db.exec('create trigger trg_definir_loja_lancamento before insert or update on lancamentos for each row execute function definir_loja_lancamento()')
 await db.exec(funcao('2026-09-21_recebimento-lote-nome-cliente.sql','receber_lancamentos_lote'))
 await db.exec(funcao('2026-08-24-fix-cancelar-venda-devolucao-parcial.sql','cancelar_venda'))
 await db.exec(funcao('2026-09-19_lancamento-devolucao-perda-loja.sql','registrar_devolucao'))
 await db.exec(ler('20261019_pedido_app_pdv_atomico.sql'))
 await db.exec(ler(fs.readdirSync(migrations).find(f=>f.endsWith('_pedido_app_devolucao_integral.sql'))))
 await db.exec(ler('20261020123000_conciliacao_pix_devolucoes.sql'))
 async function novo(n,qtd=1,preco=12.5){
  await db.query('insert into pedidos_app values($1,$2,$3,$4,$5,$6::jsonb)',[uuid(n),uuid(1),'p1','pendente','pendente',JSON.stringify([{id:'peca',nome:'Peça QA',loja:'Petrópolis',quantidade:qtd,preco}])])
 }
 const pagar=(tipo='pix',valor=12.5)=>JSON.stringify([{forma_pagamento_id:tipo,valor,taxa:0,maquina:'',parcelas:1,status:tipo==='fiado'?'pendente':'pago'}])
 async function vender(n,pg=pagar(),dep='d1'){
  return (await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb) as r',[uuid(n),'Petrópolis',uuid(11),dep,pg,'[]'])).rows[0].r
 }
 async function devolver(venda,qtd,tipo='pix',reembolsos=null){
  return (await db.query('select registrar_devolucao($1,$2,$3,$4,$5,$6,$7,$8::jsonb,false,$9::jsonb,$10::jsonb) as r',
    [venda,'d1','p1','Cliente QA','Operador QA','Teste local',tipo,JSON.stringify([{produto_id:'peca',nome:'Peça QA',quantidade:qtd,status_produto:'ok'}]),'[]',reembolsos?JSON.stringify(reembolsos):null])).rows[0].r
 }
 const estado=async n=>(await db.query('select status,status_pagamento from pedidos_app where id=$1',[uuid(n)])).rows[0]
 const saldo=async()=>Number((await db.query("select quantidade from estoque where produto_id='peca' and deposito_id='d1'")).rows[0].quantidade)
 return {db,novo,vender,pagar,devolver,estado,saldo}
 } catch (e) { await db.close(); throw e }
}

test('Crédito automático real: operador da abertura, dívida única, flags e bloqueios sem efeitos parciais',async()=>{
 const f=await fixture();try{
  await f.db.exec(`alter table lojas add column deposito_padrao_id text;
    update lojas set deposito_padrao_id='d1' where id='${uuid(21)}';`);
  await f.novo(800); // Histórico não pode ser processado.
  await f.db.exec(ler('20261020200000_pedidos_app_credito_automatico.sql'));
  const processar=async()=>Number((await f.db.query('select processar_pedidos_app_credito(5) n')).rows[0].n);
  const fila=async n=>(await f.db.query('select estado,motivo from pedidos_app_credito_fila where pedido_id=$1',[uuid(n)])).rows[0];
  await f.novo(801);
  assert.equal(await fila(800),undefined);assert.equal(await fila(801),undefined);
  await f.db.exec(`update lojas set pedidos_app_auto_credito=true where id='${uuid(21)}'`);
  await f.novo(802);assert.equal(await processar(),0);
  assert.match((await fila(802)).motivo,/funcionário/,'caixa antigo não recebe operador inventado');
  await f.db.exec(`update caixas set aberto_por='${uuid(11)}' where id='${uuid(31)}'`);
  await f.novo(803);assert.equal(await processar(),1);assert.equal(await processar(),0);
  assert.equal(await f.saldo(),9);
  const v=(await f.db.query('select id,vendedor_id,caixa_id from vendas')).rows[0];
  assert.equal(v.vendedor_id,uuid(11));assert.equal(v.caixa_id,uuid(31));
  assert.equal((await f.db.query("select count(*)::int n from lancamentos where venda_id=$1 and tipo='receber' and status='pendente'",[v.id])).rows[0].n,1);
  assert.equal((await f.estado(803)).status_pagamento,'pendente');
  await f.db.exec(`update pessoas set permite_fiado=false`);
  await f.novo(804);assert.equal(await processar(),0);assert.match((await fila(804)).motivo,/Crédito Loja/);
  await f.db.exec(`update pessoas set permite_fiado=true; update produtos set controla_serie=true`);
  await f.novo(805);assert.equal(await processar(),0);assert.match((await fila(805)).motivo,/IMEI/);
  await f.db.exec(`update produtos set controla_serie=false; update estoque set quantidade=0 where deposito_id='d1'`);
  await f.novo(806);assert.equal(await processar(),0);assert.equal((await fila(806)).estado,'manual');
  await f.db.exec(`update estoque set quantidade=9 where deposito_id='d1'`);
  await f.novo(807);
  await f.db.exec(`update caixas set status='fechado'; insert into caixas(id,loja_id,status,aberto_por) values('${uuid(32)}','${uuid(21)}','aberto','${uuid(11)}')`);
  assert.equal(await processar(),0);assert.match((await fila(807)).motivo,/Caixa fechado/);
  assert.equal((await fila(804)).estado,'manual','não retenta bloqueio comercial após liberar fiado');
  assert.equal(await f.saldo(),9);
  assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,1);
  await f.db.query('select cancelar_venda($1,$2)',[v.id,'Teste de cancelamento automático']);
  assert.equal(await f.saldo(),10);assert.equal(await processar(),0,'cancelamento não cria nova venda');
  assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,1);
  await f.db.exec(`update caixas set status='fechado'`);
  await f.novo(808);assert.equal((await fila(808)).estado,'manual');assert.match((await fila(808)).motivo,/Caixa fechado/);
  await f.db.exec('set role authenticated');
  await assert.rejects(f.db.query('select processar_pedidos_app_credito(5)'),/permission denied/);
  await assert.rejects(f.db.query('select * from pedidos_app_credito_fila'),/permission denied/);
 }finally{await f.db.close()}
});

test('Crédito automático real: rollback, limite de tentativas e venda manual usam o mesmo vínculo',async()=>{
 const f=await fixture();try{
  await f.db.exec(`alter table lojas add column deposito_padrao_id text;
    update lojas set deposito_padrao_id='d1' where id='${uuid(21)}';`);
  await f.db.exec(ler('20261020200000_pedidos_app_credito_automatico.sql'));
  await f.db.exec(`update lojas set pedidos_app_auto_credito=true where id='${uuid(21)}';
    update caixas set aberto_por='${uuid(11)}';
    create function interromper_auto() returns trigger language plpgsql as $$begin raise exception using errcode='40P01',message='Falha transitória fictícia'; end$$;
    create trigger interromper_auto before update of caixa_id on vendas for each row execute function interromper_auto();`);
  await f.novo(820);
  for(let i=1;i<=3;i++){
   await f.db.query('select processar_pedidos_app_credito(5)');
   const q=(await f.db.query('select estado,tentativas from pedidos_app_credito_fila')).rows[0];
   assert.equal(q.tentativas,i);assert.equal(q.estado,i===3?'manual':'pendente');
   assert.equal(await f.saldo(),10);assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,0);
   assert.equal((await f.db.query('select count(*)::int n from lancamentos')).rows[0].n,0,'rollback não deixa dívida parcial');
   await f.db.exec('update pedidos_app_credito_fila set proxima_tentativa=now()');
  }
  await f.db.exec('drop trigger interromper_auto on vendas');
  await f.novo(821);const v=await f.vender(821,f.pagar('fiado'));
  await f.db.query('select processar_pedidos_app_credito(5)');
  assert.equal(await f.saldo(),9);assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,1);
  assert.equal((await f.db.query('select automatico from pedidos_app_credito_fila where pedido_id=$1',[uuid(821)])).rows[0].automatico,false,'venda manual não recebe selo automático');
  await f.db.query('select cancelar_venda($1,$2)',[v.venda_id,'Teste local']);
  await f.db.query('select processar_pedidos_app_credito(5)');assert.equal(await f.saldo(),10);
  await f.novo(822);await f.db.exec('update lojas set pedidos_app_auto_credito=false');
  await f.db.query('select processar_pedidos_app_credito(5)');assert.equal(await f.saldo(),10);
  assert.equal((await f.db.query('select estado from pedidos_app_credito_fila where pedido_id=$1',[uuid(822)])).rows[0].estado,'manual');
 }finally{await f.db.close()}
});

test('Crédito automático real: pedido de duas unidades usa depósito, caixa e vendedor próprios',async()=>{
 const f=await fixture();try{
  await f.db.exec(`alter table lojas add column deposito_padrao_id text;
    update lojas set deposito_padrao_id=case when id='${uuid(21)}' then 'd1' else 'd-outra' end;`);
  await f.db.exec(ler('20261020200000_pedidos_app_credito_automatico.sql'));
  await f.db.exec(`update lojas set pedidos_app_auto_credito=true;
    update perfis set lojas_permitidas=array['${uuid(21)}'::uuid] where id='${uuid(11)}';
    insert into perfis(id,nome,ativo,permissoes,lojas_permitidas) values('${uuid(12)}','Operador outra loja',true,array['pdv'],array['${uuid(22)}'::uuid]);
    update caixas set aberto_por='${uuid(11)}';
    insert into caixas(id,loja_id,status,aberto_por) values('${uuid(32)}','${uuid(22)}','aberto','${uuid(12)}');`);
  await f.db.query('insert into pedidos_app values($1,$2,$3,$4,$5,$6::jsonb)',[uuid(830),uuid(1),'p1','pendente','pendente',JSON.stringify(['Petrópolis','Outra'].map(loja=>({id:'peca',nome:'Peça QA',loja,quantidade:1,preco:12.5})))]);
  assert.equal((await f.db.query('select processar_pedidos_app_credito(5) n')).rows[0].n,2);
  const vendas=(await f.db.query('select deposito_id,vendedor_id,caixa_id from vendas order by deposito_id')).rows;
  assert.deepEqual(vendas,[{deposito_id:'d-outra',vendedor_id:uuid(12),caixa_id:uuid(32)},{deposito_id:'d1',vendedor_id:uuid(11),caixa_id:uuid(31)}]);
  assert.equal((await f.db.query('select count(*)::int n from lancamentos where status=$1',['pendente'])).rows[0].n,2);
  assert.equal((await f.estado(830)).status_pagamento,'pendente');
 }finally{await f.db.close()}
});

test('SQL real: finalização, idempotência e rollback de vínculo',async()=>{
 const f=await fixture();try{
  await f.novo(41)
  await assert.rejects(f.vender(41,f.pagar(),'d-outra'),/Depósito/)
  const [v1,v2]=await Promise.all([f.vender(41),f.vender(41)])
  assert.equal(v1.venda_id,v2.venda_id);assert.equal(v2.ja_existia,true)
  assert.equal(await f.saldo(),9)
  assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,1)
  assert.equal((await f.db.query('select caixa_id from vendas')).rows[0].caixa_id,uuid(31))
  assert.equal((await f.estado(41)).status_pagamento,'pago')
  await assert.rejects(f.db.query('select cancelar_pedido_app($1,$2)',[uuid(41),uuid(11)]),/venda/)
  await f.novo(42)
  await f.db.exec(`create function falhar_caixa() returns trigger language plpgsql as $$begin raise exception 'Falha vínculo'; end$$;
    create trigger falhar before update of caixa_id on vendas for each row execute function falhar_caixa();`)
  await assert.rejects(f.vender(42),/Falha vínculo/)
  assert.equal(await f.saldo(),9);assert.equal((await f.estado(42)).status,'pendente')
  assert.equal((await f.db.query('select count(*)::int n from vendas')).rows[0].n,1)
 }finally{await f.db.close()}
})

test('SQL real: fiado, F9 parcial/integral, devolução parcial/integral e reembolso',async()=>{
 const f=await fixture();try{
  await f.novo(41,2)
  const v=await f.vender(41,f.pagar('fiado',25));assert.equal(await f.saldo(),8)
  assert.equal((await f.estado(41)).status_pagamento,'pendente')
  const lanc=(await f.db.query('select id,loja_id from lancamentos')).rows[0]
  assert.equal(lanc.loja_id,uuid(21))
  const receber=async(valor,op)=>f.db.query('select receber_lancamentos_lote($1::jsonb,$2,$3,$4,$5)',[JSON.stringify([{id:lanc.id,valor}]),'Pix',null,uuid(21),uuid(op)])
  await receber(10,61);assert.equal((await f.estado(41)).status_pagamento,'pendente')
  await receber(15,62);await receber(15,62)
  assert.equal((await f.estado(41)).status_pagamento,'pago')
  assert.equal(Number((await f.db.query('select sum(valor) n from movimentos_caixa')).rows[0].n),25)
  const parcial=await f.devolver(v.venda_id,1)
  assert.equal(Number(parcial.reembolso),12.5);assert.equal(await f.saldo(),9)
  assert.equal((await f.estado(41)).status,'confirmado')
  await f.devolver(v.venda_id,1)
  assert.equal(await f.saldo(),10)
  assert.deepEqual(await f.estado(41),{status:'cancelado',status_pagamento:'pendente'})
  assert.equal(Number((await f.db.query("select sum(valor) n from lancamentos where tipo='pagar'")).rows[0].n),25)
  await assert.rejects(f.devolver(v.venda_id,1),/foram vendidas/)
  assert.equal(await f.saldo(),10)
  await assert.rejects(f.vender(41),/indisponível/)
 }finally{await f.db.close()}
})

test('SQL real: cancelamento de fiado pendente restaura estoque uma vez',async()=>{
 const f=await fixture();try{
  await f.novo(41);const v=await f.vender(41,f.pagar('fiado'))
  await f.db.query('select cancelar_venda($1,$2)',[v.venda_id,'Teste local'])
  await f.db.query('select cancelar_venda($1,$2)',[v.venda_id,'Repetição'])
  assert.equal(await f.saldo(),10)
  assert.deepEqual(await f.estado(41),{status:'cancelado',status_pagamento:'pendente'})
  assert.equal((await f.db.query('select count(*)::int n from lancamentos')).rows[0].n,0)
 }finally{await f.db.close()}
})

test('SQL real: caixa fechado, estoque, cadastro e taxas inválidas não criam venda',async()=>{
 const f=await fixture();try{
  await f.novo(41)
  await f.db.exec("update caixas set status='fechado'");await assert.rejects(f.vender(41),/Caixa/)
  await f.db.exec("update caixas set status='aberto'; update estoque set quantidade=0 where deposito_id='d1'")
  await assert.rejects(f.vender(41),/Estoque/)
  await f.db.exec("update estoque set quantidade=10; update pessoas set ativo=false")
  await assert.rejects(f.vender(41),/Cadastro/)
  await f.db.exec('update pessoas set ativo=true')
  const cartao=taxa=>JSON.stringify([{forma_pagamento_id:'credito',valor:12.5,taxa,maquina:'Máquina QA',parcelas:1,status:'pago'}])
  await assert.rejects(f.vender(41,cartao(9)),/Taxa/)
  const v=await f.vender(41,cartao(.25));assert.equal(Number(v.total),12.75)
 }finally{await f.db.close()}
})

test('SQL real: várias unidades preservam atendimento ativo e só encerram após todas as reversões',async()=>{
 const f=await fixture();try{
  await f.novo(41)
  await f.db.query("update pedidos_app set itens=itens || $1::jsonb where id=$2",[JSON.stringify([{id:'peca',nome:'Peça QA',loja:'Outra',quantidade:1,preco:12.5}]),uuid(41)])
  const p=await f.vender(41)
  assert.equal((await f.estado(41)).status,'pendente')
  await f.devolver(p.venda_id,1)
  assert.equal((await f.estado(41)).status,'pendente','unidade ainda não atendida impede encerrar pedido')
  await f.db.query("insert into caixas(id,loja_id,status) values($1,$2,'aberto')",[uuid(32),uuid(22)])
  const outra=(await f.db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb) r',[uuid(41),'Outra',uuid(11),'d-outra',f.pagar('fiado'),'[]'])).rows[0].r
  assert.equal((await f.estado(41)).status,'pendente')
  assert.equal((await f.estado(41)).status_pagamento,'pendente')
  const lanc=(await f.db.query("select id from lancamentos where venda_id=$1",[outra.venda_id])).rows[0].id
  await f.db.query('select receber_lancamentos_lote($1::jsonb,$2,$3,$4,$5)',[JSON.stringify([{id:lanc,valor:12.5}]),'Pix',null,uuid(22),uuid(62)])
  assert.deepEqual(await f.estado(41),{status:'pendente',status_pagamento:'pago'})
  // O RPC de devolução mantém a venda; os gatilhos não podem contar a unidade já devolvida como ativa.
  await f.db.query('select registrar_devolucao($1,$2,$3,$4,$5,$6,$7,$8::jsonb,false)',[outra.venda_id,'d-outra','p1','QA','QA','Teste','pix',JSON.stringify([{produto_id:'peca',nome:'Peça QA',quantidade:1,status_produto:'ok'}])])
  assert.deepEqual(await f.estado(41),{status:'cancelado',status_pagamento:'pendente'})
  assert.equal(await f.saldo(),10)
 }finally{await f.db.close()}
})


test('Pix real: rota por loja herdada no reembolso, sem duplicar entrada automática', async()=>{
 const f=await fixture()
 try {
  await f.db.exec(`insert into contas(id) values('${uuid(81)}'),('${uuid(82)}');
   update formas_pagamento set conta_destino_id='${uuid(82)}' where id='pix';
   insert into forma_conta_loja values('pix','${uuid(21)}','${uuid(81)}');`)
  await f.novo(81);const v=await f.vender(81)
  const entrada=(await f.db.query('select conta_id from lancamentos where venda_id=$1',[v.venda_id])).rows[0]
  assert.equal(entrada.conta_id,null,'entrada já é contabilizada por pagamentos_venda')
  await f.devolver(v.venda_id,1)
  const saida=(await f.db.query("select conta_id,devolucao_id,valor from lancamentos where tipo='pagar'")).rows[0]
  assert.equal(saida.conta_id,uuid(81));assert.equal(Number(saida.valor),12.5)
  const d=(await f.db.query('select caixa_id,abate_fiado,reembolsos from devolucoes where id=$1',[saida.devolucao_id])).rows[0]
  assert.equal(d.caixa_id,uuid(31));assert.equal(Number(d.abate_fiado),0)
  assert.equal(d.reembolsos[0].tipo,'pix');assert.equal(d.reembolsos[0].conta_id,uuid(81))
 }finally{await f.db.close()}
})

test('Pix real: ausência de rota não inventa conta; falha do reembolso reverte todos os efeitos',async()=>{
 const f=await fixture()
 try {
  await f.novo(82);const v=await f.vender(82)
  await f.db.exec(`insert into contas(id,ativa) values('${uuid(83)}',false);update formas_pagamento set conta_destino_id='${uuid(83)}' where id='pix'`)
  await assert.rejects(f.devolver(v.venda_id,1),/inativa/)
  assert.equal(await f.saldo(),9)
  assert.equal((await f.db.query('select count(*) n from devolucoes')).rows[0].n,0)
  await f.db.exec('update formas_pagamento set conta_destino_id=null')
  await f.devolver(v.venda_id,1)
  assert.equal((await f.db.query("select conta_id from lancamentos where tipo='pagar'")).rows[0].conta_id,null)
  assert.equal(await f.saldo(),10)
 }finally{await f.db.close()}
})


test('Pix real: sem rota local usa destino da forma; múltiplas contas não são escolhidas ao acaso',async()=>{
 const f=await fixture()
 try {
  await f.db.exec(`insert into contas(id) values('${uuid(84)}'),('${uuid(85)}');
   update formas_pagamento set conta_destino_id='${uuid(84)}' where id='pix';
   insert into formas_pagamento(id,ativo,tipo,conta_destino_id) values('pix2',true,'pix','${uuid(85)}')`)
  await f.novo(84);const v=await f.vender(84)
  assert.equal((await f.db.query('select conta_pix_da_venda($1) c',[v.venda_id])).rows[0].c,uuid(84))
  await f.db.query("insert into pagamentos_venda(venda_id,forma_pagamento_id,status,valor) values($1,'pix2','pago',1)",[v.venda_id])
  await assert.rejects(f.db.query('select conta_pix_da_venda($1)',[v.venda_id]),/contas diferentes/)
 }finally{await f.db.close()}
})

test('Pix real: devolução após F9 herda conta explícita e registra só o reembolso',async()=>{
 const f=await fixture()
 try {
  await f.db.exec(`insert into contas(id) values('${uuid(86)}')`)
  await f.novo(86);const v=await f.vender(86,f.pagar('fiado'))
  const id=(await f.db.query('select id from lancamentos where venda_id=$1',[v.venda_id])).rows[0].id
  await f.db.query('select receber_lancamentos_lote($1::jsonb,$2,$3,$4,$5)',[JSON.stringify([{id,valor:12.5}]),'Pix',uuid(86),uuid(21),uuid(87)])
  await f.devolver(v.venda_id,1)
  const r=(await f.db.query("select conta_id,valor from lancamentos where tipo='pagar'")).rows[0]
  assert.equal(r.conta_id,uuid(86));assert.equal(Number(r.valor),12.5)
  assert.equal((await f.db.query("select jsonb_array_length(reembolsos) n from devolucoes")).rows[0].n,1)
 }finally{await f.db.close()}
})
