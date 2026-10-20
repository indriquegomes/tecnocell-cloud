-- TECNOCELL.CLAUD: aplicar somente após revisar a definição instalada dos RPCs.
-- O atendimento do App usa o PDV existente; pedido + unidade produz no máximo uma venda.
begin;

alter table public.pedidos_app_atendimentos
  add column encaminhado_em timestamptz,
  add column venda_id uuid unique references public.vendas(id);
alter table public.pedidos_app_atendimentos alter column confirmado_em drop not null;

create function public.encaminhar_pedido_app_pdv(p_pedido uuid, p_unidade text, p_operador uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pedido public.pedidos_app%rowtype;
begin
  perform public.validar_operador_pedido_app(p_operador, p_unidade);
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado'
    or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido indisponível nesta unidade.';
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' and not exists (
    select 1 from public.pedidos_app_atendimentos a
    where a.pedido_id=p_pedido and a.unidade=p_unidade and a.venda_id is not null
  ) then
    raise exception 'Pedido com pagamento anterior exige análise financeira.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem vínculo ativo e aprovado.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade,confirmado_em,encaminhado_em)
    values(p_pedido,p_unidade,null,now())
    on conflict(pedido_id,unidade) do update
      set encaminhado_em=coalesce(pedidos_app_atendimentos.encaminhado_em, excluded.encaminhado_em);
end;
$$;

create function public.finalizar_pedido_app_pdv(
  p_pedido uuid, p_unidade text, p_operador uuid, p_deposito text,
  p_pagamentos jsonb, p_series jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_app%rowtype;
  v_loja uuid;
  v_caixa uuid;
  v_venda uuid;
  v_resultado jsonb;
  v_itens jsonb;
  v_nome text;
  v_total numeric;
  v_item jsonb;
  v_qtd numeric;
  v_master boolean;
  v_permissoes text[];
begin
  perform public.validar_operador_pedido_app(p_operador,p_unidade);
  -- Mesmo lock do cancelamento: duas abas e uma resposta perdida retornam a venda original.
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado'
    or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido indisponível nesta unidade.';
  end if;
  select venda_id into v_venda from public.pedidos_app_atendimentos
    where pedido_id=p_pedido and unidade=p_unidade;
  if v_venda is not null then
    select jsonb_build_object('venda_id',v.id,'venda_numero',v.numero,'total',v.total,'ja_existia',true)
      into v_resultado from public.vendas v where v.id=v_venda;
    if v_resultado is null then raise exception 'Vínculo da venda inconsistente.'; end if;
    return v_resultado;
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' then
    raise exception 'Pedido com pagamento anterior exige análise financeira.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem vínculo ativo e aprovado.'; end if;
  select u.loja_id into v_loja from public.pedidos_app_unidades u where u.unidade=p_unidade;
  perform 1 from public.depositos d where d.id=p_deposito and d.loja_id=v_loja and d.ativo is true;
  if not found then raise exception 'Depósito não pertence à unidade.'; end if;
  select c.id into v_caixa from public.caixas c where c.loja_id=v_loja and c.status='aberto'
    order by c.id limit 1 for update;
  if v_caixa is null then raise exception 'Caixa da unidade fechado.'; end if;
  select p.nome into v_nome from public.perfis p where p.id=p_operador and p.ativo is true;
  if v_nome is null then raise exception 'Operador inativo.'; end if;
  select case when c.id is not null then coalesce(c.is_master,false) else coalesce(p.is_master,false) end,
    coalesce(p.permissoes,'{}'::text[]) || coalesce(c.permissoes,'{}'::text[])
    into v_master,v_permissoes from public.perfis p
    left join public.cargos c on c.id=p.cargo_id and c.ativo is not false
    where p.id=p_operador;

  if jsonb_typeof(v_pedido.itens) <> 'array' or jsonb_typeof(p_pagamentos) <> 'array'
    or jsonb_array_length(p_pagamentos)=0 then raise exception 'Itens ou pagamentos inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade and (
        nullif(i->>'id','') is null or (i->>'quantidade')::numeric <> trunc((i->>'quantidade')::numeric)
        or (i->>'quantidade')::numeric not between 1 and 100
        or (i->>'preco')::numeric <= 0)) then raise exception 'Item inválido no pedido.'; end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade group by i->>'id' having count(*)>1) then
    raise exception 'Peça duplicada no pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      left join public.produtos p on p.id=i->>'id'
      where i->>'loja'=p_unidade and (p.id is null or p.ativo is not true
        or (not v_master and (i->>'preco')::numeric <= coalesce(p.preco_custo,0))
        or (not v_master and not ('venda_abaixo_minimo'=any(v_permissoes))
          and coalesce(p.preco_minimo,0)>0 and (i->>'preco')::numeric < p.preco_minimo))) then
    raise exception 'Peça inativa ou preço abaixo do piso/custo. Revise o pedido.';
  end if;
  select jsonb_agg(jsonb_build_object('produto_id',i->>'id','nome',i->>'nome',
      'quantidade',(i->>'quantidade')::numeric,'preco_unitario',(i->>'preco')::numeric,'desconto_item',0)),
    sum((i->>'quantidade')::numeric * (i->>'preco')::numeric)
    into v_itens,v_total from jsonb_array_elements(v_pedido.itens) i where i->>'loja'=p_unidade;
  if v_itens is null or v_total <= 0 then raise exception 'Pedido sem peças nesta unidade.'; end if;
  if jsonb_typeof(coalesce(p_series,'[]'::jsonb)) <> 'array' then raise exception 'IMEIs inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
      left join public.produtos p on p.id=s->>'produto_id'
      where nullif(s->>'serie','') is null or p.controla_serie is not true
        or not exists (select 1 from jsonb_array_elements(v_pedido.itens) i
          where i->>'loja'=p_unidade and i->>'id'=s->>'produto_id'))
    or exists (select 1 from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
      group by s->>'produto_id',s->>'serie' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      join public.produtos p on p.id=i->>'id' and p.controla_serie is true
      where i->>'loja'=p_unidade and
        (select count(*) from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
          where s->>'produto_id'=i->>'id') <> (i->>'quantidade')::numeric) then
    raise exception 'IMEIs não correspondem às peças do pedido.';
  end if;
  -- O PDV genérico permite estoque negativo em serviços; pedido do App exige saldo real.
  for v_item in select i from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade order by i->>'id' loop
    select e.quantidade into v_qtd from public.estoque e
      where e.produto_id=v_item->>'id' and e.deposito_id=p_deposito for update;
    if not found or v_qtd < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente no depósito para %.',v_item->>'nome';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      left join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      where f.id is null or f.ativo is not true or f.tipo is null or (f.loja_id is not null and f.loja_id<>v_loja)
        or (pag->>'status') is null or (pag->>'status') not in ('pago','pendente')
        or (f.tipo='fiado') <> (pag->>'status'='pendente')
        or f.tipo='vale_credito'
        or (pag->>'valor')::numeric <= 0
        or (pag->>'valor')::numeric <> round((pag->>'valor')::numeric,2)
        or (pag->>'taxa')::numeric < 0
        or (pag->>'taxa')::numeric <> round((pag->>'taxa')::numeric,2)
        or (pag->>'parcelas')::int not between 1 and 24
        or (f.tipo not in ('cartao_credito','cartao_debito') and
          (coalesce(pag->>'maquina','')<>'' or (pag->>'taxa')::numeric<>0 or (pag->>'parcelas')::int<>1))) then
    raise exception 'Forma de pagamento indisponível nesta loja.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      left join public.maquinas_cartao m on m.nome=pag->>'maquina' and m.ativo is true
      where f.tipo in ('cartao_credito','cartao_debito') and
        (m.id is null or (f.maquina_id is not null and f.maquina_id<>m.id)
          or (pag->>'parcelas')::int > m.max_parcelas
          or (f.tipo='cartao_debito' and (pag->>'parcelas')::int<>1)
          or (f.tipo='cartao_credito' and m.taxas_credito->>((pag->>'parcelas')::int-1) is null)
          or (pag->>'taxa')::numeric <> round((pag->>'valor')::numeric *
            (case when f.tipo='cartao_debito' then m.taxa_debito
              else (m.taxas_credito->>((pag->>'parcelas')::int-1))::numeric end) / 100,2))) then
    raise exception 'Taxa, máquina ou parcelas do cartão inválidas.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      where f.tipo='fiado') then
    perform 1 from public.pessoas p where p.id=v_pedido.pessoa_id and p.permite_fiado is true;
    if not found then raise exception 'Cliente sem fiado liberado.'; end if;
  end if;

  -- A chamada, a amarração ao caixa e o vínculo pertencem à mesma transação PostgreSQL.
  v_resultado := public.finalizar_venda_com_desconto_item(
    v_itens,p_pagamentos,v_pedido.pessoa_id,0,
    'Origem: Aplicativo · Pedido ' || p_pedido::text,
    p_deposito,coalesce(p_series,'[]'::jsonb),p_operador,v_nome,0,'retirada',null);
  v_venda := (v_resultado->>'venda_id')::uuid;
  if v_venda is null then raise exception 'PDV não retornou venda.'; end if;
  update public.vendas set caixa_id=v_caixa where id=v_venda;
  if not found then raise exception 'Venda não localizada para vínculo ao caixa.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade,encaminhado_em,confirmado_em,venda_id)
    values(p_pedido,p_unidade,now(),now(),v_venda)
    on conflict(pedido_id,unidade) do update
      set confirmado_em=now(),venda_id=excluded.venda_id;
  if not exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where not exists (select 1 from public.pedidos_app_atendimentos a
        where a.pedido_id=p_pedido and a.unidade=i->>'loja' and a.venda_id is not null)) then
    update public.pedidos_app set status='confirmado',
      status_pagamento=case when not exists (
        select 1 from public.pedidos_app_atendimentos a
        join public.pagamentos_venda pv on pv.venda_id=a.venda_id
        where a.pedido_id=p_pedido and pv.status='pendente'
      ) then 'pago' else 'pendente' end
      where id=p_pedido;
  end if;
  return v_resultado || jsonb_build_object('ja_existia',false);
end;
$$;

create or replace function public.cancelar_pedido_app(p_pedido uuid,p_operador uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pedido public.pedidos_app%rowtype; v_unidade text;
begin
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if jsonb_array_length(v_pedido.itens)=0 then raise exception 'Pedido sem unidade.'; end if;
  for v_unidade in select distinct i->>'loja' from jsonb_array_elements(v_pedido.itens) i loop
    perform public.validar_operador_pedido_app(p_operador,v_unidade);
  end loop;
  if exists (select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido and a.venda_id is not null) then
    raise exception 'Pedido com venda: use cancelamento/devolução do PDV.';
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' then
    raise exception 'Pedido com pagamento exige análise financeira separada.';
  end if;
  update public.pedidos_app set status='cancelado' where id=p_pedido and status<>'cancelado';
end;
$$;

-- O F9 quita lançamentos depois da venda; recalcular o status que o App lê.
create function public.atualizar_pagamento_pedido_app()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido uuid;
begin
  if new.venda_id is null or new.status is not distinct from old.status then return new; end if;
  select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a
    where a.venda_id=new.venda_id;
  if v_pedido is null then return new; end if;
  update public.pedidos_app p set status_pagamento=case when
    not exists (select 1 from jsonb_array_elements(p.itens) i where not exists (
      select 1 from public.pedidos_app_atendimentos a join public.vendas v on v.id=a.venda_id
      where a.pedido_id=p.id and a.unidade=i->>'loja' and v.status='concluida'))
    and not exists (select 1 from public.pedidos_app_atendimentos a
      join public.lancamentos l on l.venda_id=a.venda_id
      where a.pedido_id=p.id and l.tipo='receber' and l.status='pendente')
    then 'pago' else 'pendente' end
    where p.id=v_pedido and p.status<>'cancelado';
  return new;
end;
$$;
create trigger pagamento_pedido_app_f9 after update of status on public.lancamentos
  for each row execute function public.atualizar_pagamento_pedido_app();

-- O cancelamento do PDV apaga os lançamentos e muda a venda; não é o cancelamento simples do pedido.
create function public.atualizar_cancelamento_venda_pedido_app()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido uuid;
begin
  if new.status<>'cancelada' or old.status is not distinct from new.status then return new; end if;
  select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.id;
  if v_pedido is null then return new; end if;
  update public.pedidos_app p set status=case when exists (
      select 1 from public.pedidos_app_atendimentos a join public.vendas v on v.id=a.venda_id
      where a.pedido_id=p.id and v.status='concluida') then 'pendente' else 'cancelado' end,
    status_pagamento='pendente' where p.id=v_pedido;
  return new;
end;
$$;
create trigger cancelamento_venda_pedido_app after update of status on public.vendas
  for each row execute function public.atualizar_cancelamento_venda_pedido_app();

revoke all on function public.encaminhar_pedido_app_pdv(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finalizar_pedido_app_pdv(uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.encaminhar_pedido_app_pdv(uuid,text,uuid) to service_role;
grant execute on function public.finalizar_pedido_app_pdv(uuid,text,uuid,text,jsonb,jsonb) to service_role;
revoke all on function public.atualizar_pagamento_pedido_app() from public,anon,authenticated;
revoke all on function public.atualizar_cancelamento_venda_pedido_app() from public,anon,authenticated;
commit;
