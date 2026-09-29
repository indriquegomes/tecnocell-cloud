-- Funções de resumo pra IA do chat (respostas determinísticas, sem SQL livre errado).
-- Fuso: vendas.created_at é UTC; "hoje" SP = UTC-3 → soma +3h no filtro.

-- 1. Vendas no período: faturamento, quantidade, lucro, top produtos.
CREATE OR REPLACE FUNCTION public.resumo_vendas(p_de date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'faturamento', coalesce((SELECT round(sum(i.total_item)::numeric,2) FROM itens_venda i JOIN vendas v ON v.id=i.venda_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'quantidade', coalesce((SELECT sum(i.quantidade)::int FROM itens_venda i JOIN vendas v ON v.id=i.venda_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'lucro', coalesce((SELECT round(sum(i.total_item - coalesce(p.preco_custo,0)*i.quantidade)::numeric,2) FROM itens_venda i JOIN vendas v ON v.id=i.venda_id JOIN produtos p ON p.id=i.produto_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'top_produtos', coalesce((SELECT jsonb_agg(t) FROM (SELECT p.nome, sum(i.quantidade)::int AS qtd, round(sum(i.total_item)::numeric,2) AS valor FROM itens_venda i JOIN vendas v ON v.id=i.venda_id JOIN produtos p ON p.id=i.produto_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz GROUP BY p.nome ORDER BY qtd DESC LIMIT 10) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

-- 2. Fiados em aberto (contas a receber pendentes), por cliente.
CREATE OR REPLACE FUNCTION public.resumo_fiados()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_em_aberto', coalesce((SELECT round(sum(valor)::numeric,2) FROM lancamentos WHERE tipo='receber' AND status='pendente'), 0),
    'por_cliente', coalesce((SELECT jsonb_agg(t) FROM (SELECT coalesce(pessoa_nome,'(sem nome)') AS pessoa, round(sum(valor)::numeric,2) AS valor FROM lancamentos WHERE tipo='receber' AND status='pendente' GROUP BY pessoa_nome ORDER BY sum(valor) DESC LIMIT 20) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

-- 3. Caixa(s) do dia: loja, status, abertura, fechamento, vendas.
CREATE OR REPLACE FUNCTION public.resumo_caixa(p_data date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT l.nome AS loja, c.status,
           c.valor_abertura AS abertura, c.valor_fechamento AS fechamento,
           coalesce((SELECT round(sum(v.total)::numeric,2) FROM vendas v WHERE v.caixa_id=c.id AND v.status='concluida'), 0) AS vendas
    FROM caixas c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.aberto_em >= (p_data::timestamp + interval '3 hours')::timestamptz
      AND c.aberto_em < (p_data::timestamp + interval '1 day 3 hours')::timestamptz
    ORDER BY c.aberto_em
  ) t;
  RETURN r;
END; $$;

-- 4. Estoque total por depósito.
CREATE OR REPLACE FUNCTION public.resumo_estoque()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_pecas', coalesce((SELECT sum(e.quantidade)::int FROM estoque e WHERE e.quantidade > 0), 0),
    'por_deposito', coalesce((SELECT jsonb_agg(t) FROM (SELECT d.nome AS deposito, sum(e.quantidade)::int AS pecas FROM estoque e JOIN depositos d ON d.id=e.deposito_id WHERE e.quantidade > 0 GROUP BY d.nome ORDER BY pecas DESC) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $$;

-- 5. Vendas por forma de pagamento no período.
CREATE OR REPLACE FUNCTION public.resumo_formas(p_de date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT coalesce(f.nome,'(sem forma)') AS forma, round(sum(pg.valor)::numeric,2) AS valor
    FROM pagamentos_venda pg
    JOIN vendas v ON v.id=pg.venda_id
    LEFT JOIN formas_pagamento f ON f.id=pg.forma_pagamento_id
    WHERE v.status='concluida' AND pg.status='pago'
      AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz
      AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz
    GROUP BY f.nome ORDER BY valor DESC
  ) t;
  RETURN r;
END; $$;

-- 6. Top clientes (mais compraram) no período.
CREATE OR REPLACE FUNCTION public.resumo_clientes(p_de date, p_ate date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT coalesce(pe.nome,'Consumidor') AS cliente, count(*)::int AS compras, round(sum(v.total)::numeric,2) AS total
    FROM vendas v LEFT JOIN pessoas pe ON pe.id=v.pessoa_id
    WHERE v.status='concluida'
      AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz
      AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz
    GROUP BY pe.nome ORDER BY total DESC LIMIT 15
  ) t;
  RETURN r;
END; $$;
