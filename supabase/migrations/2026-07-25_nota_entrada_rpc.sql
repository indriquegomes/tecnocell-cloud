-- ============================================================
-- Notas de entrada: receber e estornar de forma ATÔMICA (RPC).
-- Receber: dá entrada no estoque de tudo-ou-nada + atualiza o custo do produto.
-- Estornar: devolve o estoque e marca a nota como cancelada.
-- Idempotente/seguro reaplicar (create or replace).
-- ============================================================

create or replace function receber_nota_entrada(p_nota_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_status text;
  v_item record;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status is null then raise exception 'Nota não encontrada'; end if;
  if v_status = 'recebida' then return; end if;   -- idempotente: já recebida

  for v_item in
    select produto_id, deposito_id, quantidade, preco_unitario
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    update estoque set quantidade = coalesce(quantidade, 0) + v_item.quantidade, updated_at = now()
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    if not found then
      insert into estoque (produto_id, deposito_id, quantidade)
        values (v_item.produto_id, v_item.deposito_id, v_item.quantidade);
    end if;

    -- custo do produto = preço de compra desta entrada (último custo)
    if coalesce(v_item.preco_unitario, 0) > 0 then
      update produtos set preco_custo = v_item.preco_unitario where id = v_item.produto_id;
    end if;
  end loop;

  update notas_entrada set status = 'recebida' where id = p_nota_id;
end;
$$;

create or replace function estornar_nota_entrada(p_nota_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_status text;
  v_item record;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status <> 'recebida' then return; end if;   -- só estorna nota recebida

  for v_item in
    select produto_id, deposito_id, quantidade
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;
    update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_item.quantidade), updated_at = now()
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
  end loop;

  update notas_entrada set status = 'cancelada' where id = p_nota_id;
end;
$$;
