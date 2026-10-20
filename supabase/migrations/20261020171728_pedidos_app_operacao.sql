-- Camada operacional privada. Não altera venda, estoque, pagamento ou caixa.
begin;
create table public.pedidos_app_operacao (
 pedido_id uuid not null references public.pedidos_app(id),
 unidade text not null references public.pedidos_app_unidades(unidade),
 responsavel_id uuid, responsavel_em timestamptz,
 solicitacoes_impressao integer not null default 0 check(solicitacoes_impressao>=0),
 versao integer not null default 0 check(versao>=0),
 separado_em timestamptz, entregue_em timestamptz,
 papel_confirmado_em timestamptz,
 primary key(pedido_id,unidade)
);
create table public.pedidos_app_operacao_eventos (
 id bigint generated always as identity primary key,
 pedido_id uuid not null, unidade text not null, operador_id uuid not null,
 versao integer not null, criado_em timestamptz not null default now(),
 tipo text not null check(tipo in ('assumir','transferir','impressao_solicitada','papel_confirmado','separado','entregue')),
 unique(pedido_id,unidade,versao),
 foreign key(pedido_id,unidade) references public.pedidos_app_operacao(pedido_id,unidade)
);
alter table public.pedidos_app_operacao enable row level security;
alter table public.pedidos_app_operacao_eventos enable row level security;
revoke all on public.pedidos_app_operacao,public.pedidos_app_operacao_eventos from public,anon,authenticated;
grant select on public.pedidos_app_operacao,public.pedidos_app_operacao_eventos to service_role;

create function public.registrar_operacao_pedido_app(p_pedido uuid,p_unidade text,p_operador uuid,p_versao integer,p_tipo text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.pedidos_app_operacao%rowtype; v_venda uuid; v_status text;
begin
 perform public.validar_operador_pedido_app(p_operador,p_unidade);
 if p_tipo is null or p_tipo not in ('assumir','transferir','impressao_solicitada','papel_confirmado','separado','entregue') then
   raise exception 'Ação inválida.';
 end if;
 -- Mesmo lock usado na finalização: revalidar situação sem interferir no financeiro.
 select status into v_status from public.pedidos_app where id=p_pedido
   and itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade)) for update;
 if not found or v_status='cancelado' then raise exception 'Pedido indisponível.'; end if;
 select venda_id into v_venda from public.pedidos_app_atendimentos
   where pedido_id=p_pedido and unidade=p_unidade;
 insert into public.pedidos_app_operacao(pedido_id,unidade) values(p_pedido,p_unidade) on conflict do nothing;
 select * into v from public.pedidos_app_operacao where pedido_id=p_pedido and unidade=p_unidade for update;
 if p_versao is distinct from v.versao then raise exception 'Atendimento atualizado por outra pessoa. Atualize a lista.'; end if;
 if v.entregue_em is not null then raise exception 'Entrega já registrada.'; end if;
 if p_tipo='assumir' and v.responsavel_id is not null and v.responsavel_id<>p_operador then
   raise exception 'Pedido já tem responsável. Confira antes de transferir.';
 end if;
 if p_tipo not in ('assumir','transferir') and v.responsavel_id is distinct from p_operador then
   raise exception 'Somente o responsável pode registrar esta etapa.';
 end if;
 if p_tipo='papel_confirmado' and not exists(select 1 from public.pedidos_app_operacao_eventos
   where pedido_id=p_pedido and unidade=p_unidade and tipo='impressao_solicitada') then
   raise exception 'Registre primeiro a solicitação de impressão.';
 end if;
 if p_tipo='entregue' and (v_venda is null or public.pedido_app_venda_revertida(v_venda) or not exists(select 1 from public.vendas where id=v_venda and status='concluida')) then
   raise exception 'Entrega exige venda ativa vinculada.';
 end if;
 if p_tipo='entregue' and v.separado_em is null then raise exception 'Confirme a separação antes da entrega.'; end if;
 update public.pedidos_app_operacao set
   responsavel_id=case when p_tipo in ('assumir','transferir') then p_operador else responsavel_id end,
   responsavel_em=case when p_tipo in ('assumir','transferir') then now() else responsavel_em end,
   solicitacoes_impressao=solicitacoes_impressao+case when p_tipo='impressao_solicitada' then 1 else 0 end,
   separado_em=case when p_tipo='separado' then coalesce(separado_em,now()) else separado_em end,
   entregue_em=case when p_tipo='entregue' then now() else entregue_em end,
   papel_confirmado_em=case when p_tipo='papel_confirmado' then now() else papel_confirmado_em end,
   versao=versao+1 where pedido_id=p_pedido and unidade=p_unidade;
 insert into public.pedidos_app_operacao_eventos(pedido_id,unidade,operador_id,versao,tipo)
   values(p_pedido,p_unidade,p_operador,v.versao+1,p_tipo);
end;
$$;
revoke all on function public.registrar_operacao_pedido_app(uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.registrar_operacao_pedido_app(uuid,text,uuid,integer,text) to service_role;
commit;
