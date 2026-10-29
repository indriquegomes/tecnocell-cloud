-- ============================================================================
-- Estorno de nota inexistente reclama (27/10/2026, autorizado pelo dono)
--
-- Antes: id que não existia não gerava erro nenhum — a função terminava em
-- silêncio e o operador achava que tinha estornado.
-- Agora: levanta "Nota de entrada não encontrada." e o resto do corpo segue igual.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.estornar_nota_entrada(p_nota_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status         text;
  v_item           record;
  v_controla_serie boolean;
  v_serie          text;
  v_revertidos     int;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  -- Nota que não existe não pode terminar em silêncio: o operador achava que tinha
  -- estornado (achado dos testes de 27/10).
  if v_status is null then
    raise exception 'Nota de entrada não encontrada.';
  end if;
  if v_status <> 'recebida' then return; end if;

  for v_item in
    select produto_id, deposito_id, quantidade, series
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    select controla_serie into v_controla_serie from produtos where id = v_item.produto_id;

    if v_controla_serie then
      v_revertidos := 0;
      for v_serie in select * from jsonb_array_elements_text(coalesce(v_item.series, '[]'::jsonb))
      loop
        delete from numeros_serie
          where produto_id = v_item.produto_id and serie = v_serie and status = 'em_estoque';
        if found then
          v_revertidos := v_revertidos + 1;
        end if;
      end loop;
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_revertidos), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    else
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_item.quantidade), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    end if;
  end loop;

  update notas_entrada set status = 'cancelada' where id = p_nota_id;
end;
$function$
;
