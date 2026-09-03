-- Aplica um evento inteiro de estoque e grava idempotência na mesma transação.
create or replace function public.aplicar_movimento_estoque_sige(
  p_evento_id uuid,
  p_loja text,
  p_sequencia bigint,
  p_movimentos jsonb
) returns jsonb
language plpgsql
security definer
as $function$
declare
  v_mov jsonb;
begin
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'movimento_estoque' and sige_id = p_evento_id::text and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  for v_mov in select value from jsonb_array_elements(p_movimentos) loop
    perform public.movimentar_estoque(
      v_mov->>'produto_id',
      v_mov->>'deposito_id',
      v_mov->>'operacao',
      (v_mov->>'quantidade')::numeric,
      '[]'::jsonb,
      v_mov->>'observacao',
      null,
      (v_mov->>'data')::timestamptz
    );
  end loop;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('movimento_estoque', p_evento_id::text, p_loja, null, coalesce(p_sequencia, 0), now());
  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'movimento_estoque', p_evento_id::text, p_loja, 'aplicar', 'ok', jsonb_array_length(p_movimentos) || ' movimento(s)');
  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'movimentos', jsonb_array_length(p_movimentos));
end;
$function$;
