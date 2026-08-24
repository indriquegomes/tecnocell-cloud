-- receber_nota_entrada nunca criava numeros_serie pra produto serializado
-- (só somava estoque.quantidade) — o PDV recusava a venda desse produto
-- ("IMEI indisponível") mesmo com quantidade disponível. Agora, pra item de
-- produto com controla_serie=true, cria um numeros_serie por IMEI salvo em
-- itens_nota_entrada.series (coluna nova, ver migration anterior) e trava
-- (mesmo padrão de erro claro dos outros RPCs) se a quantidade de IMEIs
-- não bater com a quantidade do item — defesa em profundidade, o app já
-- valida isso antes de chamar, mas o RPC não deve confiar cegamente.
CREATE OR REPLACE FUNCTION public.receber_nota_entrada(p_nota_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status         text;
  v_item           record;
  v_qtd_antes      numeric;
  v_custo_antes    numeric;
  v_novo_custo     numeric;
  v_controla_serie boolean;
  v_serie          text;
  v_qtd_series     int;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status is null then raise exception 'Nota não encontrada'; end if;
  if v_status = 'recebida' then return; end if;

  for v_item in
    select produto_id, deposito_id, quantidade, preco_unitario, series
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    select controla_serie into v_controla_serie from produtos where id = v_item.produto_id;
    if v_controla_serie then
      v_qtd_series := jsonb_array_length(coalesce(v_item.series, '[]'::jsonb));
      if v_qtd_series <> v_item.quantidade then
        raise exception 'Produto "%" controla IMEI: % cadastrado(s), mas a quantidade da nota é %. Cadastre todos os IMEIs antes de confirmar.',
          v_item.produto_id, v_qtd_series, v_item.quantidade;
      end if;
    end if;

    if coalesce(v_item.preco_unitario, 0) > 0 then
      select coalesce(sum(quantidade), 0) into v_qtd_antes
        from estoque where produto_id = v_item.produto_id;
      select coalesce(preco_custo, 0) into v_custo_antes
        from produtos where id = v_item.produto_id;
      if v_qtd_antes > 0 and v_custo_antes > 0 then
        v_novo_custo := (v_custo_antes * v_qtd_antes + v_item.preco_unitario * v_item.quantidade)
                        / (v_qtd_antes + v_item.quantidade);
      else
        v_novo_custo := v_item.preco_unitario;
      end if;
    end if;

    update estoque set quantidade = coalesce(quantidade, 0) + v_item.quantidade, updated_at = now()
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    if not found then
      insert into estoque (produto_id, deposito_id, quantidade)
        values (v_item.produto_id, v_item.deposito_id, v_item.quantidade);
    end if;

    if v_controla_serie then
      for v_serie in select * from jsonb_array_elements_text(coalesce(v_item.series, '[]'::jsonb))
      loop
        insert into numeros_serie (produto_id, deposito_id, serie, status, custo)
        values (v_item.produto_id, v_item.deposito_id, v_serie, 'em_estoque', v_item.preco_unitario);
      end loop;
    end if;

    if coalesce(v_item.preco_unitario, 0) > 0 then
      update produtos set preco_custo = round(v_novo_custo, 4) where id = v_item.produto_id;
    end if;
  end loop;

  update notas_entrada set status = 'recebida' where id = p_nota_id;
end;
$function$
