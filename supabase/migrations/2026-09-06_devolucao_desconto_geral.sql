-- Preserva a função instalada e ajusta os dois cálculos monetários pelo desconto geral.
do $$
declare v_oid oid; v_sql text;
  v_antigo text := 'select sum(total_item) / nullif(sum(quantidade), 0) as preco_medio';
  v_novo text := 'select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio';
begin
  for v_oid in select oid from pg_proc where pronamespace='public'::regnamespace and proname='registrar_devolucao' loop
    v_sql := pg_get_functiondef(v_oid);
    if position(v_novo in v_sql)>0 then continue; end if;
    if (length(v_sql)-length(replace(v_sql,v_antigo,'')))/length(v_antigo) <> 2 then
      raise exception 'Definição de registrar_devolucao mudou; revisão necessária.';
    end if;
    execute replace(v_sql,v_antigo,v_novo);
  end loop;
end $$;
