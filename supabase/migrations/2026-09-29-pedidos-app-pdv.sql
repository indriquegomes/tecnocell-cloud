-- PREPARADO LOCALMENTE. Conferir schema e testar antes de autorizar aplicação.
-- Requer pedidos_app/cadastros_clientes, cargos e RPC de desconto/entrega do PDV.
begin;

-- Associação explícita; não inferir unidade pelo nome nem preencher ids automaticamente.
create table public.pedidos_app_unidades (
  unidade text primary key,
  loja_id uuid not null unique references public.lojas(id)
);
create table public.pedidos_app_atendimentos (
  pedido_id uuid not null references public.pedidos_app(id),
  unidade text not null references public.pedidos_app_unidades(unidade),
  confirmado_em timestamptz,
  venda_id uuid unique references public.vendas(id),
  resultado jsonb,
  primary key (pedido_id, unidade),
  check ((venda_id is null) = (resultado is null))
);
alter table public.pedidos_app_unidades enable row level security;
alter table public.pedidos_app_atendimentos enable row level security;
revoke all on public.pedidos_app_unidades, public.pedidos_app_atendimentos from public, anon, authenticated;
grant all on public.pedidos_app_unidades, public.pedidos_app_atendimentos to service_role;

create function public.validar_operador_pedido_app(p_operador uuid, p_unidade text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_perfil public.perfis%rowtype;
  v_cargo public.cargos%rowtype;
  v_loja uuid;
  v_permissoes text[];
  v_master boolean;
begin
  select * into v_perfil from public.perfis where id = p_operador for share;
  if not found or v_perfil.ativo is false then raise exception 'Operador não autorizado.'; end if;
  v_permissoes := v_perfil.permissoes;
  v_master := coalesce(v_perfil.is_master, false);
  if v_perfil.cargo_id is not null then
    select * into v_cargo from public.cargos where id = v_perfil.cargo_id for share;
    if found and v_cargo.ativo is not false then
      v_permissoes := v_cargo.permissoes;
      v_master := coalesce(v_cargo.is_master, false);
    end if;
  end if;
  if not v_master and not coalesce('pdv' = any(v_permissoes), false) then
    raise exception 'Operador sem permissão de PDV.';
  end if;
  select u.loja_id into v_loja from public.pedidos_app_unidades u
    join public.lojas l on l.id = u.loja_id and l.ativa = true
    where u.unidade = p_unidade for share of u, l;
  if not found then raise exception 'Unidade do app não configurada ou inativa.'; end if;
  if coalesce(cardinality(v_perfil.lojas_permitidas), 0) > 0
    and not (v_loja = any(v_perfil.lojas_permitidas)) then
    raise exception 'Operador sem acesso a esta unidade.';
  end if;
  return v_loja;
end;
$$;

create function public.atualizar_status_pedido_app(p_pedido uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pedido public.pedidos_app%rowtype; v_todas_confirmadas boolean; v_todas_faturadas boolean; v_pago boolean; v_canceladas boolean;
begin
  select * into v_pedido from public.pedidos_app where id = p_pedido for update;
  if not found or v_pedido.status = 'cancelado' then return; end if;
  select bool_and(a.confirmado_em is not null), bool_and(a.venda_id is not null)
    into v_todas_confirmadas, v_todas_faturadas
    from (select distinct i->>'loja' unidade from jsonb_array_elements(v_pedido.itens) i) u
    left join public.pedidos_app_atendimentos a on a.pedido_id = p_pedido and a.unidade = u.unidade;
  -- Fiado é quitado pelo recebimento real em lancamentos, não pela imagem de Pix.
  select not exists (
    select 1 from public.pedidos_app_atendimentos a join public.vendas v on v.id = a.venda_id
    where a.pedido_id = p_pedido and (
      v.status is distinct from 'concluida'
      or exists (select 1 from public.lancamentos l where l.venda_id = v.id
        and l.tipo = 'receber' and l.status = 'pendente')
      or coalesce((select sum(pg.valor) from public.pagamentos_venda pg where pg.venda_id = v.id
        and pg.status in ('pago', 'vale')), 0)
        + coalesce((select sum(l.valor) from public.lancamentos l where l.venda_id = v.id
          and l.tipo = 'receber' and l.status = 'pago'), 0) < v.total
      or exists (select 1 from public.pagamentos_venda pg where pg.venda_id = v.id
        and pg.status = 'pendente' and not exists (
          select 1 from public.lancamentos l where l.venda_id = v.id and l.tipo = 'receber' and l.status = 'pago'))
    )) into v_pago;
  select bool_and(v.status in ('cancelada', 'cancelado')) into v_canceladas
    from public.pedidos_app_atendimentos a join public.vendas v on v.id = a.venda_id
    where a.pedido_id = p_pedido;
  update public.pedidos_app set
    status = case when v_todas_faturadas and v_canceladas then 'cancelado'
      when coalesce(v_todas_confirmadas, false) then 'confirmado' else 'pendente' end,
    status_pagamento = case when v_todas_faturadas and v_canceladas then 'cancelado'
      when coalesce(v_todas_faturadas, false) and v_pago then 'pago' else 'pendente' end
    where id = p_pedido;
end;
$$;

create function public.cancelar_pedido_app(p_pedido uuid, p_operador uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pedido public.pedidos_app%rowtype; v_unidade text;
begin
  select * into v_pedido from public.pedidos_app where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  -- Cancelamento do pedido inteiro exige acesso a todas as unidades envolvidas.
  for v_unidade in select distinct i->>'loja' from jsonb_array_elements(v_pedido.itens) i loop
    perform public.validar_operador_pedido_app(p_operador, v_unidade);
  end loop;
  if exists (select 1 from public.pedidos_app_atendimentos where pedido_id = p_pedido and venda_id is not null) then
    raise exception 'Pedido já possui venda. Use o procedimento de cancelamento/devolução do PDV.';
  end if;
  update public.pedidos_app set status = 'cancelado', status_pagamento = 'cancelado' where id = p_pedido;
end;
$$;

create function public.confirmar_pedido_app_unidade(p_pedido uuid, p_unidade text, p_operador uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pedido public.pedidos_app%rowtype;
begin
  perform public.validar_operador_pedido_app(p_operador, p_unidade);
  select * into v_pedido from public.pedidos_app where id = p_pedido for update;
  if not found or v_pedido.status = 'cancelado' then raise exception 'Pedido não disponível.'; end if;
  if not exists (select 1 from jsonb_array_elements(v_pedido.itens) i where i->>'loja' = p_unidade) then
    raise exception 'Pedido não pertence a esta unidade.';
  end if;
  if not exists (select 1 from public.cadastros_clientes c join public.pessoas p on p.id = c.pessoa_id
    where c.user_id = v_pedido.user_id and c.pessoa_id = v_pedido.pessoa_id and c.status = 'aprovado' and p.ativo = true) then
    raise exception 'Cadastro não aprovado ou vínculo alterado.';
  end if;
  insert into public.pedidos_app_atendimentos(pedido_id, unidade, confirmado_em)
    values (p_pedido, p_unidade, now()) on conflict (pedido_id, unidade) do nothing;
  perform public.atualizar_status_pedido_app(p_pedido);
end;
$$;

create function public.finalizar_pedido_app_unidade(
  p_pedido uuid, p_unidade text, p_operador uuid, p_itens jsonb, p_pagamentos jsonb,
  p_pessoa_id text, p_deposito_id text, p_caixa_id uuid, p_vendedor_nome text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pedido public.pedidos_app%rowtype;
  v_atendimento public.pedidos_app_atendimentos%rowtype;
  v_loja uuid;
  v_itens jsonb;
  v_resultado jsonb;
begin
  v_loja := public.validar_operador_pedido_app(p_operador, p_unidade);
  -- ponytail: serializa unidades do mesmo pedido; limite de 50 itens do criar_pedido_app.
  -- Se esse teto crescer, dividir a trava por unidade com preservação do agregado.
  select * into v_pedido from public.pedidos_app where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select * into v_atendimento from public.pedidos_app_atendimentos
    where pedido_id = p_pedido and unidade = p_unidade for update;
  if not found or v_atendimento.confirmado_em is null then raise exception 'Confirme a disponibilidade antes da venda.'; end if;
  -- Mesmo com resposta perdida, nunca chama o motor uma segunda vez.
  if v_atendimento.venda_id is not null then return v_atendimento.resultado || '{"reutilizada":true}'::jsonb; end if;
  if v_pedido.status = 'cancelado' then raise exception 'Pedido cancelado.'; end if;
  if v_pedido.pessoa_id is null or v_pedido.pessoa_id is distinct from p_pessoa_id then raise exception 'Cliente do pedido alterado.'; end if;
  if not exists (select 1 from public.cadastros_clientes c join public.pessoas p on p.id = c.pessoa_id
    where c.user_id = v_pedido.user_id and c.pessoa_id = v_pedido.pessoa_id and c.status = 'aprovado' and p.ativo = true) then
    raise exception 'Cadastro não aprovado ou vínculo alterado.';
  end if;
  perform 1 from public.depositos where id = p_deposito_id and loja_id = v_loja and ativo = true for share;
  if not found then raise exception 'Depósito não autorizado para esta unidade.'; end if;
  perform 1 from public.caixas where id = p_caixa_id and loja_id = v_loja and status = 'aberto' for share;
  if not found then raise exception 'Caixa da unidade fechado.'; end if;
  select jsonb_agg(jsonb_build_object('produto_id', i->>'id', 'nome', i->>'nome',
    'quantidade', (i->>'quantidade')::numeric, 'preco_unitario', (i->>'preco')::numeric,
    'desconto_item', 0) order by i->>'id') into v_itens
    from jsonb_array_elements(v_pedido.itens) i where i->>'loja' = p_unidade;
  if v_itens is null then raise exception 'Pedido sem itens nesta unidade.'; end if;
  if exists (select 1 from jsonb_array_elements(v_itens) i join public.produtos p on p.id = i->>'produto_id'
    where p.controla_serie = true) then
    raise exception 'Produto com série exige atendimento pelo PDV com seleção de série.';
  end if;
  if v_itens is distinct from (select jsonb_agg(i order by i->>'produto_id') from jsonb_array_elements(p_itens) i) then
    raise exception 'Itens ou preços alterados. Atualize o pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
    left join public.catalogo_app c on c.id = i->>'id' and c.loja = p_unidade
    where i->>'loja' = p_unidade and (c.id is null or c.preco is distinct from (i->>'preco')::numeric)) then
    raise exception 'Preço mudou. Solicite revisão do pedido ao cliente.';
  end if;
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) <> 1 then
    raise exception 'Escolha uma forma de pagamento.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pg
    left join public.formas_pagamento f on f.id = pg->>'forma_pagamento_id'
    where f.id is null or f.ativo is not true or (f.loja_id is not null and f.loja_id <> v_loja)
      or f.tipo not in ('dinheiro','pix','fiado') or f.tipo is null
      or pg->>'status' is distinct from (case when f.tipo = 'fiado' then 'pendente' else 'pago' end)
      or coalesce((pg->>'taxa')::numeric, -1) <> 0 or coalesce((pg->>'parcelas')::integer, 0) <> 1) then
    raise exception 'Forma de pagamento inválida para esta unidade.';
  end if;
  v_resultado := public.finalizar_venda_com_desconto_item(v_itens, p_pagamentos, v_pedido.pessoa_id,
    0, 'Pedido do app ' || p_pedido::text || ' · ' || p_unidade, p_deposito_id,
    '[]'::jsonb, p_operador, p_vendedor_nome, 0, 'retirada', null);
  if v_resultado->>'venda_id' is null then raise exception 'Motor de venda não confirmou o resultado.'; end if;
  update public.vendas set caixa_id = p_caixa_id where id = (v_resultado->>'venda_id')::uuid;
  update public.pedidos_app_atendimentos set venda_id = (v_resultado->>'venda_id')::uuid,
    resultado = v_resultado where pedido_id = p_pedido and unidade = p_unidade;
  perform public.atualizar_status_pedido_app(p_pedido);
  return v_resultado || '{"reutilizada":false}'::jsonb;
end;
$$;

-- Recebimentos reais atualizam o app; cancelamento de venda nunca simula estorno.
create function public.sincronizar_pagamento_pedido_app()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_venda uuid; v_pedido uuid;
begin
  if tg_table_name = 'vendas' then v_venda := new.id;
  elsif tg_op = 'DELETE' then v_venda := old.venda_id;
  else v_venda := new.venda_id; end if;
  select pedido_id into v_pedido from public.pedidos_app_atendimentos where venda_id = v_venda;
  if v_pedido is not null then perform public.atualizar_status_pedido_app(v_pedido); end if;
  return null;
end;
$$;
create trigger pedido_app_recebimento after insert or update or delete on public.lancamentos
  for each row execute function public.sincronizar_pagamento_pedido_app();
create trigger pedido_app_pagamento after insert or update or delete on public.pagamentos_venda
  for each row execute function public.sincronizar_pagamento_pedido_app();
create trigger pedido_app_venda after update of status on public.vendas
  for each row execute function public.sincronizar_pagamento_pedido_app();

revoke all on function public.validar_operador_pedido_app(uuid,text),
  public.atualizar_status_pedido_app(uuid), public.confirmar_pedido_app_unidade(uuid,text,uuid),
  public.cancelar_pedido_app(uuid,uuid),
  public.finalizar_pedido_app_unidade(uuid,text,uuid,jsonb,jsonb,text,text,uuid,text),
  public.sincronizar_pagamento_pedido_app() from public, anon, authenticated;
grant execute on function public.confirmar_pedido_app_unidade(uuid,text,uuid),
  public.cancelar_pedido_app(uuid,uuid),
  public.finalizar_pedido_app_unidade(uuid,text,uuid,jsonb,jsonb,text,text,uuid,text) to service_role;
commit;
