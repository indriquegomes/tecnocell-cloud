-- Cancelamento de remessa de estoque (entre depósitos) com motivo.
-- Só cancela remessa "em_transito": devolve o estoque pra ORIGEM, volta IMEI
-- pra "em_estoque" e grava o motivo. Remessa "recebida" não pode ser cancelada.

alter table public.remessas_estoque add column if not exists motivo_cancelamento text;
alter table public.remessas_estoque add column if not exists cancelada_em timestamptz;
alter table public.remessas_estoque add column if not exists cancelada_por text;

create or replace function public.cancelar_remessa_estoque(p_remessa_id uuid, p_motivo text, p_user text default null)
returns jsonb
language plpgsql security definer
as $function$
declare
  v_r record;
  v_item record;
  v_antes numeric;
  v_imei jsonb;
  v_nome_d text;
begin
  select * into v_r from remessas_estoque where id = p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if v_r.status <> 'em_transito' then raise exception 'Só dá pra cancelar remessa em trânsito (status: %)', v_r.status; end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select nome into v_nome_d from depositos where id = v_r.destino;

  for v_item in select * from remessas_estoque_itens where remessa_id = p_remessa_id loop
    -- serializado: IMEI volta pra "em_estoque" (continua na origem)
    if jsonb_array_length(coalesce(v_item.series, '[]'::jsonb)) > 0 then
      for v_imei in select * from jsonb_array_elements(v_item.series) loop
        update numeros_serie set status = 'em_estoque', updated_at = now()
        where produto_id = v_item.produto_id and serie = (v_imei->>'serie') and status = 'em_transito';
      end loop;
    end if;

    -- devolve o estoque pra origem
    select quantidade into v_antes from estoque
      where produto_id = v_item.produto_id and deposito_id = v_r.origem for update;
    if found then
      update estoque set quantidade = v_antes + v_item.quantidade, updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_r.origem;
    else
      v_antes := 0;
      insert into estoque (produto_id, deposito_id, quantidade) values (v_item.produto_id, v_r.origem, v_item.quantidade);
    end if;

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_item.produto_id, v_r.origem, 'entrada', round(v_item.quantidade)::int, round(v_antes)::int, round(v_antes + v_item.quantidade)::int,
            'Cancelamento de remessa p/ ' || coalesce(v_nome_d, v_r.destino) || ' | Motivo: ' || p_motivo, p_user, now());
  end loop;

  update remessas_estoque set status = 'cancelada', motivo_cancelamento = p_motivo, cancelada_em = now(), cancelada_por = p_user where id = p_remessa_id;
  return jsonb_build_object('ok', true);
end;
$function$;
