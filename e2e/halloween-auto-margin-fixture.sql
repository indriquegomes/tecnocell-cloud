alter table public.vendas add column desconto numeric default 0;
create table public.produtos(id text primary key,nome text,codigo text,ativo boolean default true,preco numeric,preco_custo numeric);
create table public.tabelas_preco(id uuid primary key,ativa boolean,usa_preco_custo boolean);
create table public.itens_tabela_preco(tabela_id uuid,produto_id text,quantidade_minima integer,preco numeric);
create table public.itens_venda(id uuid primary key default gen_random_uuid(),venda_id uuid,produto_id text,quantidade numeric,preco_unitario numeric,desconto_item numeric,total_item numeric);
create table public.devolucoes(id uuid primary key default gen_random_uuid(),venda_id uuid,status text,valor_total numeric);
create table public.itens_devolucao(devolucao_id uuid,produto_id text,quantidade numeric);
create function public.finalizar_venda_com_desconto_item(p_itens jsonb,p_pagamentos jsonb,p_pessoa_id text,p_desconto numeric,p_observacoes text,p_deposito_id text,p_series jsonb,p_vendedor_id uuid,p_vendedor_nome text,p_credito_valor numeric,p_tipo_entrega text,p_endereco_entrega text)returns jsonb language plpgsql as $$declare sid uuid:=gen_random_uuid();begin
insert into public.vendas(id,numero,total,status,created_at,deposito_id,desconto)select sid,999,sum((x->>'quantidade')::numeric*((x->>'preco_unitario')::numeric-coalesce((x->>'desconto_item')::numeric,0)))-p_desconto+coalesce((select sum(coalesce((z->>'taxa')::numeric,0))from jsonb_array_elements(p_pagamentos)z),0),'concluida',clock_timestamp(),p_deposito_id,p_desconto from jsonb_array_elements(p_itens)x;
insert into public.itens_venda(venda_id,produto_id,quantidade,preco_unitario,desconto_item,total_item)select sid,x->>'produto_id',(x->>'quantidade')::numeric,(x->>'preco_unitario')::numeric,coalesce((x->>'desconto_item')::numeric,0),(x->>'quantidade')::numeric*((x->>'preco_unitario')::numeric-coalesce((x->>'desconto_item')::numeric,0))from jsonb_array_elements(p_itens)x;
insert into public.pagamentos_venda(venda_id,valor,taxa,status)select sid,(x->>'valor')::numeric,coalesce((x->>'taxa')::numeric,0),'pago'from jsonb_array_elements(p_pagamentos)x;
insert into public.lancamentos(venda_id,tipo,status,valor,valor_pago)select sid,'receber','pago',total,total from public.vendas where id=sid;
return jsonb_build_object('venda_id',sid);end $$;

alter table public.depositos add column nome text;
alter table public.devolucoes add column deposito_id text,add column pessoa_nome text,add column vendedor_nome text,add column motivo text,add column tipo_credito text,add column caixa_id uuid,add column abate_fiado numeric,add column reembolsos jsonb;
alter table public.itens_devolucao add column nome text,add column preco_unitario numeric,add column total_item numeric,add column status_produto text;
alter table public.lancamentos add column updated_at timestamptz;
create table public.estoque(id uuid default gen_random_uuid(),produto_id text,deposito_id text,quantidade numeric,updated_at timestamptz);
create table public.caixas(id uuid,loja_id uuid,status text,aberto_em timestamptz);
