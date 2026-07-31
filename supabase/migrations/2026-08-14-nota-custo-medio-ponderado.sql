-- ============================================================
-- CUSTO MÉDIO PONDERADO ao receber nota de entrada.
--
-- Antes: preco_custo do produto = preço da ÚLTIMA compra (sobrescrevia direto).
-- Isa 29/07: "aprovei o item e mudou o custo direto no produto; o certo é
-- DISSOLVER o custo nas quantidades anteriores. Se custava 0,60 e a compra veio
-- a 2,00, diluir no custo × quantidade existente."
--
-- Agora: média ponderada por quantidade —
--   novo_custo = (custo_atual*qtd_antes + preco_entrada*qtd_entrada)
--                / (qtd_antes + qtd_entrada)
-- qtd_antes = estoque TOTAL do produto (todos os depósitos) ANTES desta entrada.
-- Sem estoque anterior OU sem custo válido antes → custo passa a ser o da entrada.
--
-- estornar_nota_entrada NÃO restaura o custo antigo (média é lossy) — só devolve
-- o estoque. Limitação conhecida.
-- Idempotente (create or replace); seguro reaplicar.
-- ============================================================

create or replace function receber_nota_entrada(p_nota_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_status      text;
  v_item        record;
  v_qtd_antes   numeric;
  v_custo_antes numeric;
  v_novo_custo  numeric;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status is null then raise exception 'Nota não encontrada'; end if;
  if v_status = 'recebida' then return; end if;   -- idempotente: já recebida

  for v_item in
    select produto_id, deposito_id, quantidade, preco_unitario
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    -- custo médio: lê qtd e custo ANTES de dar entrada
    if coalesce(v_item.preco_unitario, 0) > 0 then
      select coalesce(sum(quantidade), 0) into v_qtd_antes
        from estoque where produto_id = v_item.produto_id;
      select coalesce(preco_custo, 0) into v_custo_antes
        from produtos where id = v_item.produto_id;
      if v_qtd_antes > 0 and v_custo_antes > 0 then
        v_novo_custo := (v_custo_antes * v_qtd_antes + v_item.preco_unitario * v_item.quantidade)
                        / (v_qtd_antes + v_item.quantidade);
      else
        v_novo_custo := v_item.preco_unitario;   -- sem base anterior → custo da entrada
      end if;
    end if;

    -- entrada no estoque
    update estoque set quantidade = coalesce(quantidade, 0) + v_item.quantidade, updated_at = now()
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    if not found then
      insert into estoque (produto_id, deposito_id, quantidade)
        values (v_item.produto_id, v_item.deposito_id, v_item.quantidade);
    end if;

    -- aplica o custo médio ponderado
    if coalesce(v_item.preco_unitario, 0) > 0 then
      update produtos set preco_custo = round(v_novo_custo, 4) where id = v_item.produto_id;
    end if;
  end loop;

  update notas_entrada set status = 'recebida' where id = p_nota_id;
end;
$$;
