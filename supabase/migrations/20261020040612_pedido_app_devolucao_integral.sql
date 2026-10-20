-- Apenas sincronização do pedido. Estoque, reembolso e dívida pertencem ao PDV.
begin;

create function public.pedido_app_venda_revertida(p_venda uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists(select 1 from public.vendas v where v.id=p_venda and v.status='cancelada')
    or (exists(select 1 from public.itens_venda i where i.venda_id=p_venda)
      and not exists (
        select 1 from public.itens_venda i where i.venda_id=p_venda
        group by i.produto_id having sum(i.quantidade) > coalesce((
          select sum(d.quantidade) from public.itens_devolucao d
          join public.devolucoes h on h.id=d.devolucao_id
          where h.venda_id=p_venda and h.status='concluida' and d.produto_id=i.produto_id
        ),0)
      ));
$$;

create function public.sincronizar_estado_pedido_app(p_pedido uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_revertido boolean; v_completo boolean; v_pendente boolean; v_tem_reversao boolean;
begin
  perform 1 from public.pedidos_app where id=p_pedido for update;
  if not found then return; end if;
  select
    not exists(select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido
      and a.venda_id is not null and not public.pedido_app_venda_revertida(a.venda_id)),
    exists(select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido
      and a.venda_id is not null and public.pedido_app_venda_revertida(a.venda_id))
    into v_revertido,v_tem_reversao;
  if not v_tem_reversao then return; end if;
  select not exists (
    select 1 from public.pedidos_app p, jsonb_array_elements(p.itens) i
    where p.id=p_pedido and not exists (
      select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p.id
        and a.unidade=i->>'loja' and a.venda_id is not null
    )
  ) into v_completo;
  select exists (
    select 1 from public.pedidos_app_atendimentos a join public.lancamentos l on l.venda_id=a.venda_id
    where a.pedido_id=p_pedido and not public.pedido_app_venda_revertida(a.venda_id)
      and l.tipo='receber' and l.status='pendente'
  ) into v_pendente;
  update public.pedidos_app set
    status=case when v_revertido and v_completo then 'cancelado' else 'pendente' end,
    status_pagamento=case when v_revertido or not v_completo or v_pendente then 'pendente' else 'pago' end
    where id=p_pedido;
end;
$$;

create function public.atualizar_devolucao_pedido_app()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido uuid;
begin
  select a.pedido_id into v_pedido from public.devolucoes d
    join public.pedidos_app_atendimentos a on a.venda_id=d.venda_id
    where d.id=new.devolucao_id;
  if v_pedido is not null then perform public.sincronizar_estado_pedido_app(v_pedido); end if;
  return new;
end;
$$;

-- Diferido até COMMIT: observa todos os itens e o financeiro concluído pelo RPC.
create constraint trigger devolucao_integral_pedido_app
after insert or update on public.itens_devolucao deferrable initially deferred
for each row execute function public.atualizar_devolucao_pedido_app();

-- Os gatilhos existentes continuam responsáveis pelo caso sem devoluções.
create function public.reconferir_reversao_pedido_app()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pedido uuid;
begin
  if tg_table_name='vendas' then
    select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.id;
  else
    select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.venda_id;
  end if;
  if v_pedido is not null then perform public.sincronizar_estado_pedido_app(v_pedido); end if;
  return new;
end;
$$;
create constraint trigger reconferir_reversao_pedido_app_venda after update on public.vendas
  deferrable initially deferred for each row execute function public.reconferir_reversao_pedido_app();
create constraint trigger reconferir_reversao_pedido_app_f9 after update on public.lancamentos
  deferrable initially deferred for each row execute function public.reconferir_reversao_pedido_app();

revoke all on function public.pedido_app_venda_revertida(uuid) from public,anon,authenticated;
revoke all on function public.sincronizar_estado_pedido_app(uuid) from public,anon,authenticated;
revoke all on function public.atualizar_devolucao_pedido_app() from public,anon,authenticated;
revoke all on function public.reconferir_reversao_pedido_app() from public,anon,authenticated;
commit;
