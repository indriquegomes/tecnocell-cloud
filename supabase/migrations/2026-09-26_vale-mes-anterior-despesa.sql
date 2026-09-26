-- Vale crédito de mês anterior: quando usado, vira DESPESA no financeiro.
-- Regra (dono): vale criado e usado no MESMO mês = sem despesa; usado em mês
-- seguinte = despesa (o dinheiro já foi contado no mês da devolução, então a
-- venda paga com esse vale não é receita nova).
CREATE OR REPLACE FUNCTION public.vale_usado_mes_anterior()
RETURNS trigger AS $$
DECLARE
  v_saldo_anterior numeric;
  v_despesa numeric;
BEGIN
  IF NEW.tipo <> 'uso' THEN RETURN NEW; END IF;
  IF NEW.valor <= 0 THEN RETURN NEW; END IF;

  -- Saldo de vale que já existia ANTES do início do mês do uso (carregado de mês
  -- anterior). Se > 0, usar esse saldo agora não gera receita nova -> despesa.
  SELECT coalesce(sum(case when c.tipo = 'credito' then c.valor else -c.valor end), 0)
    INTO v_saldo_anterior
    FROM creditos_clientes c
   WHERE c.pessoa_id = NEW.pessoa_id
     AND c.loja_id IS NOT DISTINCT FROM NEW.loja_id
     AND c.created_at < date_trunc('month', NEW.created_at);

  v_despesa := least(NEW.valor, greatest(coalesce(v_saldo_anterior, 0), 0));

  IF v_despesa > 0 THEN
    INSERT INTO lancamentos (id, descricao, valor, tipo, categoria, pessoa_id, pessoa_nome, loja_id, data_competencia, data_vencimento, status, data_pagamento, valor_pago, updated_at)
    VALUES (
      gen_random_uuid()::text,
      'Vale crédito usado (mês anterior) — ' || coalesce(NEW.pessoa_nome, ''),
      v_despesa,
      'pagar',
      'Vale crédito usado',
      NEW.pessoa_id,
      NEW.pessoa_nome,
      NEW.loja_id,
      (now() at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date,
      'pago',
      now() at time zone 'America/Sao_Paulo',
      v_despesa,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vale_usado_mes_anterior ON creditos_clientes;
CREATE TRIGGER trg_vale_usado_mes_anterior
AFTER INSERT ON creditos_clientes
FOR EACH ROW EXECUTE FUNCTION public.vale_usado_mes_anterior();
