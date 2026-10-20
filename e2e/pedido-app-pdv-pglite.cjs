// Teste isolado da migration financeira, com tabelas e venda fictícias em memória.
// Requer @electric-sql/pglite apenas no ambiente de teste; não conecta ao Supabase.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require('@electric-sql/pglite')

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('pedido do App vira uma venda atômica por unidade', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table pessoas(id text primary key,nome text,ativo boolean,nao_vender boolean,permite_fiado boolean);
      create table cargos(id uuid primary key,ativo boolean,is_master boolean,permissoes text[]);
      create table perfis(id uuid primary key,nome text,ativo boolean,is_master boolean default false,permissoes text[] default '{}',cargo_id uuid);
      create table cadastros_clientes(user_id uuid,pessoa_id text,status text);
      create table pedidos_app(id uuid primary key,user_id uuid,pessoa_id text,status text,status_pagamento text,itens jsonb);
      create table lojas(id uuid primary key,ativa boolean);
      create table pedidos_app_unidades(unidade text primary key,loja_id uuid);
      create table vendas(id uuid primary key default gen_random_uuid(),numero integer,total numeric,caixa_id uuid,status text);
      create table pedidos_app_atendimentos(pedido_id uuid references pedidos_app(id),unidade text references pedidos_app_unidades(unidade),confirmado_em timestamptz not null default now(),primary key(pedido_id,unidade));
      create table depositos(id text primary key,loja_id uuid,ativo boolean);
      create table caixas(id uuid primary key,loja_id uuid,status text);
      create table produtos(id text primary key,ativo boolean,preco_custo numeric,preco_minimo numeric,controla_serie boolean);
      create table estoque(produto_id text,deposito_id text,quantidade numeric,primary key(produto_id,deposito_id));
      create table formas_pagamento(id text primary key,ativo boolean,loja_id uuid,tipo text,maquina_id text);
      create table maquinas_cartao(id text primary key,nome text,ativo boolean,taxa_debito numeric,taxas_credito jsonb,max_parcelas integer);
      create table pagamentos_venda(venda_id uuid,forma_pagamento_id text,status text);
      create table lancamentos(id uuid primary key default gen_random_uuid(),venda_id uuid,tipo text,status text);
      create function validar_operador_pedido_app(p_operador uuid,p_unidade text) returns void language plpgsql as $$begin
        if p_operador <> '${uuid(11)}' or p_unidade <> 'Petrópolis' then raise exception 'Sem permissão'; end if;
      end$$;
      create function finalizar_venda_com_desconto_item(
        p_itens jsonb,p_pagamentos jsonb,p_pessoa_id text,p_desconto numeric,p_observacoes text,
        p_deposito_id text,p_series jsonb,p_vendedor_id uuid,p_vendedor_nome text,p_credito_valor numeric,
        p_tipo_entrega text,p_endereco_entrega text
      ) returns jsonb language plpgsql set search_path=public as $$declare v_id uuid; begin
        insert into vendas(numero,total,status) values(101,12.50,'concluida') returning id into v_id;
        insert into pagamentos_venda select v_id,p->>'forma_pagamento_id',p->>'status' from jsonb_array_elements(p_pagamentos) p;
        update estoque set quantidade=quantidade-1 where produto_id='peca' and deposito_id=p_deposito_id;
        return jsonb_build_object('venda_id',v_id,'venda_numero',101,'total',12.50);
      end$$;
      insert into pessoas values('p1','Cliente',true,false,true);
      insert into perfis(id,nome,ativo) values('${uuid(11)}','Operador',true);
      insert into cadastros_clientes values('${uuid(1)}','p1','aprovado');
      insert into lojas values('${uuid(21)}',true);
      insert into pedidos_app_unidades values('Petrópolis','${uuid(21)}');
      insert into depositos values('d1','${uuid(21)}',true),('d-outra','${uuid(22)}',true);
      insert into caixas values('${uuid(31)}','${uuid(21)}','aberto');
      insert into produtos values('peca',true,4,5,false);
      insert into estoque values('peca','d1',2),('peca','d-outra',2);
      insert into formas_pagamento values('pix',true,null,'pix',null),('fiado',true,null,'fiado',null),
        ('credito',true,null,'cartao_credito','maq1');
      insert into maquinas_cartao values('maq1','Máquina teste',true,1,'[2,3]',2);
      insert into pedidos_app values('${uuid(41)}','${uuid(1)}','p1','pendente','pendente','[{"id":"peca","nome":"Peça","loja":"Petrópolis","quantidade":1,"preco":12.50}]');
    `)
    const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261019_pedido_app_pdv_atomico.sql'),'utf8')
    await db.exec(sql)
    const args = [uuid(41),'Petrópolis',uuid(11),'d1',JSON.stringify([{forma_pagamento_id:'pix',valor:12.5,taxa:0,maquina:'',parcelas:1,status:'pago'}]),'[]']
    await db.query('select encaminhar_pedido_app_pdv($1,$2,$3)',args.slice(0,3))
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[uuid(41),'Petrópolis',uuid(11),'d-outra',args[4],'[]']),/depósito/i)
    let r = await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb) as x',args)
    assert.equal(r.rows[0].x.ja_existia,false)
    const sale = r.rows[0].x.venda_id
    r = await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb) as x',args)
    assert.equal(r.rows[0].x.ja_existia,true)
    assert.equal(r.rows[0].x.venda_id,sale)
    assert.equal((await db.query('select count(*)::int n from vendas')).rows[0].n,1)
    assert.equal(Number((await db.query("select quantidade from estoque where produto_id='peca' and deposito_id='d1'")).rows[0].quantidade),1)
    assert.equal((await db.query('select caixa_id from vendas where id=$1',[sale])).rows[0].caixa_id,uuid(31))
    assert.equal((await db.query('select status,status_pagamento from pedidos_app where id=$1',[uuid(41)])).rows[0].status,'confirmado')
    await db.query('select encaminhar_pedido_app_pdv($1,$2,$3)',args.slice(0,3))
    await db.query("insert into lancamentos(venda_id,tipo,status) values($1,'receber','pendente')",[sale])
    await db.query("update pedidos_app set status_pagamento='pendente' where id=$1",[uuid(41)])
    await db.query("update lancamentos set status='pago' where venda_id=$1",[sale])
    assert.equal((await db.query('select status_pagamento from pedidos_app where id=$1',[uuid(41)])).rows[0].status_pagamento,'pago')
    await assert.rejects(db.query('select cancelar_pedido_app($1,$2)',[uuid(41),uuid(11)]),/venda/i)
    await db.query("update vendas set status='cancelada' where id=$1",[sale])
    const cancelado = (await db.query('select status,status_pagamento from pedidos_app where id=$1',[uuid(41)])).rows[0]
    assert.equal(cancelado.status,'cancelado'); assert.equal(cancelado.status_pagamento,'pendente')
    await db.exec(`
      insert into pedidos_app values('${uuid(42)}','${uuid(1)}','p1','pendente','pendente',
        '[{"id":"peca","nome":"Peça","loja":"Petrópolis","quantidade":1,"preco":12.50}]');
      create function falhar_vinculo_caixa() returns trigger language plpgsql as $$begin
        raise exception 'Falha simulada no vínculo ao caixa';
      end$$;
      create trigger testar_rollback before update of caixa_id on vendas
        for each row execute function falhar_vinculo_caixa();
    `)
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [uuid(42),'Petrópolis',uuid(11),'d1',args[4],'[]']),/Falha simulada/)
    assert.equal((await db.query('select count(*)::int n from vendas')).rows[0].n,1)
    assert.equal(Number((await db.query("select quantidade from estoque where produto_id='peca' and deposito_id='d1'")).rows[0].quantidade),1)
    assert.equal((await db.query('select status from pedidos_app where id=$1',[uuid(42)])).rows[0].status,'pendente')
    await db.exec('drop trigger testar_rollback on vendas; update estoque set quantidade=0 where produto_id=\'peca\' and deposito_id=\'d1\';')
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [uuid(42),'Petrópolis',uuid(11),'d1',args[4],'[]']),/Estoque insuficiente/)
    await db.exec("update estoque set quantidade=1 where produto_id='peca' and deposito_id='d1'; update pessoas set ativo=false where id='p1';")
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [uuid(42),'Petrópolis',uuid(11),'d1',args[4],'[]']),/Cadastro sem vínculo ativo/)
    assert.equal((await db.query('select count(*)::int n from vendas')).rows[0].n,1)
    await db.exec(`
      update pessoas set ativo=true where id='p1';
      insert into pedidos_app values('${uuid(43)}','${uuid(1)}','p1','pendente','pendente',
        '[{"id":"peca","nome":"Peça","loja":"Petrópolis","quantidade":1,"preco":4}]');
    `)
    const abaixo = [uuid(43),'Petrópolis',uuid(11),'d1',
      JSON.stringify([{forma_pagamento_id:'pix',valor:4,taxa:0,maquina:'',parcelas:1,status:'pago'}]),'[]']
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',abaixo),/piso\/custo/)
    await db.exec(`update perfis set permissoes=array['venda_abaixo_minimo'] where id='${uuid(11)}'`)
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',abaixo),/piso\/custo/)
    await db.exec(`update perfis set is_master=true where id='${uuid(11)}'`)
    const autorizado = await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb) as x',abaixo)
    assert.equal(autorizado.rows[0].x.ja_existia,false)
    await db.exec(`insert into pedidos_app values('${uuid(44)}','${uuid(1)}','p1','pendente','pendente',
      '[{"id":"peca","nome":"Peça","loja":"Petrópolis","quantidade":1,"preco":12.50}]');
      update estoque set quantidade=1 where produto_id='peca' and deposito_id='d1';`)
    const cartao = [uuid(44),'Petrópolis',uuid(11),'d1',JSON.stringify([{
      forma_pagamento_id:'credito',valor:12.5,taxa:0.25,maquina:'Máquina teste',parcelas:1,status:'pago',
    }]),'[]']
    await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',cartao)
    await db.exec("update estoque set quantidade=1 where produto_id='peca' and deposito_id='d1'")
    await db.exec(`insert into pedidos_app values('${uuid(45)}','${uuid(1)}','p1','pendente','pendente',
      '[{"id":"peca","nome":"Peça","loja":"Petrópolis","quantidade":1,"preco":12.50}]');`)
    const taxaFalsa = [uuid(45),'Petrópolis',uuid(11),'d1',JSON.stringify([{
      forma_pagamento_id:'credito',valor:12.5,taxa:9.99,maquina:'Máquina teste',parcelas:1,status:'pago',
    }]),'[]']
    await assert.rejects(db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',taxaFalsa),/Taxa/)
    const fiado = [uuid(45),'Petrópolis',uuid(11),'d1',JSON.stringify([{
      forma_pagamento_id:'fiado',valor:12.5,taxa:0,maquina:'',parcelas:1,status:'pendente',
    }]),'[]']
    await db.query('select finalizar_pedido_app_pdv($1,$2,$3,$4,$5::jsonb,$6::jsonb)',fiado)
    const estadoFiado = (await db.query('select status,status_pagamento from pedidos_app where id=$1',[uuid(45)])).rows[0]
    assert.equal(estadoFiado.status,'confirmado'); assert.equal(estadoFiado.status_pagamento,'pendente')
  } finally { await db.close() }
})
