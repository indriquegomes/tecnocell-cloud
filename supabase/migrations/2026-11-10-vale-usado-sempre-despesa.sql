-- Vale-crédito usado: SEMPRE vira despesa, e o app resolve sozinho.
--
-- Antes (migration 2026-09-26): só lançava despesa quando o cliente gastava crédito
-- que já existia antes do mês corrente. Crédito criado e usado no mesmo mês não gerava
-- nada, e o faturamento do mês ficava com a venda paga em crédito sem contrapartida.
--
-- Agora: todo uso de crédito lança despesa pelo valor cheio. O motivo é o mesmo dos dois
-- lados: quando o cliente paga com crédito, a loja entrega mercadoria e não recebe
-- dinheiro — a venda é receita sem entrada, e a despesa é o outro lado dela.
--
-- O lançamento leva o id do movimento de crédito na descrição, para auditoria: dá para
-- achar de qual uso cada despesa nasceu.
--
-- Aplicada em 10/11/2026 a pedido do dono.

CREATE OR REPLACE FUNCTION public.vale_usado_despesa()
RETURNS trigger AS $$
BEGIN
  IF NEW.tipo <> 'uso' THEN RETURN NEW; END IF;
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN RETURN NEW; END IF;

  INSERT INTO lancamentos (
    id, descricao, valor, tipo, categoria,
    pessoa_id, pessoa_nome, loja_id,
    data_competencia, data_vencimento, status, data_pagamento, valor_pago, updated_at
  ) VALUES (
    gen_random_uuid()::text,
    'Vale crédito usado — ' || coalesce(NEW.pessoa_nome, 'cliente') || ' (crédito ' || left(NEW.id::text, 8) || ')',
    NEW.valor,
    'pagar',
    'Vale crédito usado',
    NEW.pessoa_id,
    NEW.pessoa_nome,
    NEW.loja_id,
    (NEW.created_at at time zone 'America/Sao_Paulo')::date,
    (NEW.created_at at time zone 'America/Sao_Paulo')::date,
    'pago',
    NEW.created_at,
    NEW.valor,
    now()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vale_usado_mes_anterior ON creditos_clientes;
DROP TRIGGER IF EXISTS trg_vale_usado_despesa ON creditos_clientes;

CREATE TRIGGER trg_vale_usado_despesa
AFTER INSERT ON creditos_clientes
FOR EACH ROW EXECUTE FUNCTION public.vale_usado_despesa();

-- A função antiga (vale_usado_mes_anterior) fica no banco, só sem gatilho: é o caminho
-- de volta se a regra nova der problema — basta recriar o gatilho apontando para ela.
