begin;

alter table public.caixas add column aberto_por uuid references public.perfis(id);
alter table public.lojas add column pedidos_app_auto_credito boolean not null default false;

create table public.pedidos_app_credito_fila (
 pedido_id uuid not null references public.pedidos_app(id),
 unidade text not null references public.pedidos_app_unidades(unidade),
 caixa_id uuid references public.caixas(id),
 estado text not null default 'pendente' check(estado in('pendente','concluido','manual')),
 motivo text, automatico boolean not null default false, tentativas integer not null default 0,
 proxima_tentativa timestamptz not null default now(),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 primary key(pedido_id,unidade)
);
create index pedidos_app_credito_fila_pendentes on public.pedidos_app_credito_fila(proxima_tentativa) where estado='pendente';
alter table public.pedidos_app_credito_fila enable row level security;
revoke all on public.pedidos_app_credito_fila from public,anon,authenticated;
grant select on public.pedidos_app_credito_fila to service_role;

create function public.enfileirar_pedido_app_credito()
returns trigger language plpgsql security definer set search_path='' as $$
declare u record; cx uuid;
begin
 for u in select distinct m.unidade,m.loja_id from public.pedidos_app_unidades m
 join public.lojas l on l.id=m.loja_id and l.ativa is true and l.pedidos_app_auto_credito
 where new.itens @> jsonb_build_array(jsonb_build_object('loja',m.unidade)) loop
   select case when count(*)=1 then (array_agg(c.id))[1] end into cx
     from public.caixas c where c.loja_id=u.loja_id and c.status='aberto';
   insert into public.pedidos_app_credito_fila(pedido_id,unidade,caixa_id,estado,motivo)
   values(new.id,u.unidade,cx,case when cx is null then 'manual' else 'pendente' end,
     case when cx is null then 'Caixa fechado na chegada. Atenda no PDV.' end)
   on conflict do nothing;
 end loop;
 return new;
end;
$$;
revoke all on function public.enfileirar_pedido_app_credito() from public,anon,authenticated;
create trigger pedido_app_credito_novo after insert on public.pedidos_app
for each row execute function public.enfileirar_pedido_app_credito();

create function public.processar_pedidos_app_credito(p_limite integer default 5)
returns integer language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare q record; loja uuid; dep text; operador uuid; forma text; formas text[];
 total numeric; venda uuid; n integer:=0; resultado jsonb;
begin
 for q in select * from public.pedidos_app_credito_fila
   where estado='pendente' and proxima_tentativa<=now()
   order by criado_em,pedido_id,unidade limit greatest(1,least(coalesce(p_limite,5),5))
   for update skip locked loop
   begin
     -- A trava do pedido é a mesma da venda manual/cancelamento.
     perform 1 from public.pedidos_app where id=q.pedido_id for update;
     select venda_id into venda from public.pedidos_app_atendimentos where pedido_id=q.pedido_id and unidade=q.unidade;
     if venda is not null then
       update public.pedidos_app_credito_fila set estado='concluido',motivo=null,atualizado_em=now() where pedido_id=q.pedido_id and unidade=q.unidade;
       continue;
     end if;
     select l.id,l.deposito_padrao_id into loja,dep from public.lojas l
       join public.pedidos_app_unidades u on u.loja_id=l.id
       where u.unidade=q.unidade and l.ativa is true and l.pedidos_app_auto_credito;
     if not found then raise exception using errcode='P0001',message='Automação desativada nesta loja. Atenda no PDV.'; end if;
     select c.aberto_por into operador from public.caixas c
       where c.id=q.caixa_id and c.loja_id=loja and c.status='aberto' for update;
     if not found or operador is null then raise exception using errcode='P0001',message='Caixa fechado ou abertura sem funcionário identificado. Atenda no PDV.'; end if;
     if (select count(*) from public.caixas where loja_id=loja and status='aberto')<>1 then
       raise exception using errcode='P0001',message='Configuração de caixas ambígua. Atenda no PDV.';
     end if;
     perform public.validar_operador_pedido_app(operador,q.unidade);
     if not exists(select 1 from public.depositos d where d.id=dep and d.loja_id=loja and d.ativo is true) then
       raise exception using errcode='P0001',message='Confira o depósito padrão da loja no PDV.';
     end if;
     if not exists(select 1 from public.pedidos_app p join public.pessoas c on c.id=p.pessoa_id
       where p.id=q.pedido_id and p.status<>'cancelado' and c.permite_fiado is true) then
       raise exception using errcode='P0001',message='Pedido cancelado ou cliente sem Crédito Loja autorizado. Atenda no PDV.';
     end if;
     if exists(select 1 from public.pedidos_app p cross join lateral jsonb_array_elements(p.itens) i
       join public.produtos pr on pr.id=i->>'id' where p.id=q.pedido_id and i->>'loja'=q.unidade and pr.controla_serie is true) then
       raise exception using errcode='P0001',message='Escolha os IMEIs no PDV antes de vender.';
     end if;
     select array_agg(f.id) into formas from public.formas_pagamento f
       where f.ativo is true and f.tipo='fiado' and f.loja_id=loja;
     if coalesce(cardinality(formas),0)=0 then
       select array_agg(f.id) into formas from public.formas_pagamento f where f.ativo is true and f.tipo='fiado' and f.loja_id is null;
     end if;
     if coalesce(cardinality(formas),0)<>1 then raise exception using errcode='P0001',message='Confira a forma Crédito Loja da unidade no PDV.'; end if;
     forma:=formas[1];
     select sum((i->>'quantidade')::numeric*(i->>'preco')::numeric) into total
       from public.pedidos_app p cross join lateral jsonb_array_elements(p.itens) i where p.id=q.pedido_id and i->>'loja'=q.unidade;
     resultado:=public.finalizar_pedido_app_pdv(q.pedido_id,q.unidade,operador,dep,
       jsonb_build_array(jsonb_build_object('forma_pagamento_id',forma,'valor',total,'taxa',0,'maquina','','parcelas',1,'status','pendente')),'[]'::jsonb);
     if resultado->>'venda_id' is null then raise exception 'Finalizador não confirmou a venda.'; end if;
     update public.pedidos_app_credito_fila set estado='concluido',automatico=not coalesce((resultado->>'ja_existia')::boolean,false),motivo=null,tentativas=tentativas+1,atualizado_em=now()
       where pedido_id=q.pedido_id and unidade=q.unidade;
     n:=n+1;
   exception
     when sqlstate '40001' or sqlstate '40P01' or sqlstate '55P03' or sqlstate '57014' then
       update public.pedidos_app_credito_fila set tentativas=tentativas+1,
         estado=case when tentativas+1>=3 then 'manual' else 'pendente' end,
         motivo='Processamento interrompido. Confira o pedido no PDV.',proxima_tentativa=now()+interval '2 minutes',atualizado_em=now()
         where pedido_id=q.pedido_id and unidade=q.unidade;
     when others then
       -- Não expor erros internos nem repetir automaticamente bloqueios comerciais.
       update public.pedidos_app_credito_fila set estado='manual',tentativas=tentativas+1,
         motivo=case when sqlstate='P0001' and sqlerrm in(
           'Automação desativada nesta loja. Atenda no PDV.',
           'Caixa fechado ou abertura sem funcionário identificado. Atenda no PDV.',
           'Confira o depósito padrão da loja no PDV.',
           'Pedido cancelado ou cliente sem Crédito Loja autorizado. Atenda no PDV.',
           'Escolha os IMEIs no PDV antes de vender.',
           'Confira a forma Crédito Loja da unidade no PDV.') then sqlerrm else 'Revisão necessária no PDV: confira cadastro, estoque e condições da venda.' end,
         atualizado_em=now() where pedido_id=q.pedido_id and unidade=q.unidade;
   end;
 end loop;
 return n;
end;
$$;
revoke all on function public.processar_pedidos_app_credito(integer) from public,anon,authenticated;
grant execute on function public.processar_pedidos_app_credito(integer) to service_role;
commit;
