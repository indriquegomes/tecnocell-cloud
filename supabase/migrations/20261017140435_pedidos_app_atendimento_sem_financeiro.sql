-- Primeiro ciclo: atendimento de retirada. Sem venda, pagamento ou estoque.
-- Revisar e executar somente após o preflight do projeto correto.
begin;

create table public.pedidos_app_unidades (
  unidade text primary key check (length(trim(unidade)) > 0),
  loja_id uuid not null unique references public.lojas(id)
);
create table public.pedidos_app_atendimentos (
  pedido_id uuid not null references public.pedidos_app(id),
  unidade text not null references public.pedidos_app_unidades(unidade),
  confirmado_em timestamptz not null default now(),
  primary key (pedido_id, unidade)
);
alter table public.pedidos_app_unidades enable row level security;
alter table public.pedidos_app_atendimentos enable row level security;
revoke all on public.pedidos_app_unidades, public.pedidos_app_atendimentos from public, anon, authenticated;
grant select, insert, update, delete on public.pedidos_app_unidades, public.pedidos_app_atendimentos to service_role;

create function public.validar_operador_pedido_app(p_operador uuid, p_unidade text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lojas uuid[];
  v_loja uuid;
  v_master boolean;
  v_permissoes text[];
begin
  select p.lojas_permitidas,
    case when c.id is not null then coalesce(c.is_master,false) else coalesce(p.is_master,false) end,
    coalesce(p.permissoes,'{}'::text[]) || coalesce(c.permissoes,'{}'::text[])
  into v_lojas,v_master,v_permissoes
  from public.perfis p
  left join public.cargos c on c.id=p.cargo_id and c.ativo is not false
  where p.id=p_operador and p.ativo is true;
  if not found or (not v_master and not ('pdv'=any(v_permissoes))) then
    raise exception 'Operador não autorizado.';
  end if;
  select u.loja_id into v_loja from public.pedidos_app_unidades u
    join public.lojas l on l.id=u.loja_id and l.ativa is true where u.unidade=p_unidade;
  if not found or (coalesce(cardinality(v_lojas),0)>0 and not (v_loja=any(v_lojas))) then
    raise exception 'Unidade não autorizada.';
  end if;
end;
$$;

create function public.confirmar_pedido_app_unidade(p_pedido uuid, p_unidade text, p_operador uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pedido public.pedidos_app%rowtype;
begin
  perform public.validar_operador_pedido_app(p_operador,p_unidade);
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado' or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido não disponível nesta unidade.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem aprovação válida.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade) values(p_pedido,p_unidade)
    on conflict(pedido_id,unidade) do nothing;
  if not exists (
    select 1 from jsonb_array_elements(v_pedido.itens) i
    where not exists (select 1 from public.pedidos_app_atendimentos a
      where a.pedido_id=p_pedido and a.unidade=i->>'loja')
  ) then
    update public.pedidos_app set status='confirmado' where id=p_pedido;
  end if;
end;
$$;

create function public.cancelar_pedido_app(p_pedido uuid, p_operador uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pedido public.pedidos_app%rowtype; v_unidade text;
begin
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if jsonb_array_length(v_pedido.itens)=0 then raise exception 'Pedido sem unidade.'; end if;
  for v_unidade in select distinct i->>'loja' from jsonb_array_elements(v_pedido.itens) i loop
    perform public.validar_operador_pedido_app(p_operador,v_unidade);
  end loop;
  if v_pedido.status_pagamento is distinct from 'pendente' then
    raise exception 'Pedido com pagamento exige análise financeira separada.';
  end if;
  update public.pedidos_app set status='cancelado' where id=p_pedido and status<>'cancelado';
end;
$$;

revoke all on function public.validar_operador_pedido_app(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.confirmar_pedido_app_unidade(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.cancelar_pedido_app(uuid,uuid) from public, anon, authenticated;
grant execute on function public.confirmar_pedido_app_unidade(uuid,text,uuid) to service_role;
grant execute on function public.cancelar_pedido_app(uuid,uuid) to service_role;
commit;
