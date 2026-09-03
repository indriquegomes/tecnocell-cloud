-- Aplicador de transferência entre depósitos (SIGE → TecnoCell).
-- Mesmo padrão de aplicar_movimento_estoque_sige: idempotência + domínio na
-- MESMA transação. Cada item chama transferir_estoque (debita origem, credita
-- destino, move IMEI, loga livro-razão) — tudo atômico.
create or replace function public.aplicar_transferencia_sige(
  p_evento_id uuid,
  p_loja text,
  p_sequencia bigint,
  p_sige_id text,
  p_origem text,
  p_destino text,
  p_observacao text,
  p_itens jsonb
) returns jsonb
language plpgsql
security definer
as $function$
declare
  v_item jsonb;
begin
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'transferencia' and sige_id = p_sige_id and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    perform public.transferir_estoque(
      v_item->>'produto_id',
      p_origem,
      p_destino,
      (v_item->>'quantidade')::numeric,
      coalesce(v_item->'series', '[]'::jsonb),
      p_observacao,
      null
    );
  end loop;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('transferencia', p_sige_id, p_loja, null, coalesce(p_sequencia, 0), now());
  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'transferencia', p_sige_id, p_loja, 'transferir', 'ok', p_origem || ' -> ' || p_destino);
  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'itens', jsonb_array_length(p_itens));
end;
$function$;
