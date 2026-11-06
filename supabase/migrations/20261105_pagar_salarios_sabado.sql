-- Paga automaticamente os salários semanais no sábado (vencimento = hoje).
-- Decisão do dono (05/11/2026): os fixos são pagos todo sábado, sem falta.
-- Roda sábado 20:00 UTC (= 17:00 São Paulo, horário de fechar).
SELECT cron.schedule(
  'pagar-salarios-sabado',
  '0 20 * * 6',
  $cron$
  UPDATE lancamentos
  SET status='pago',
      data_pagamento=(now() at time zone 'America/Sao_Paulo')::date,
      valor_pago=valor
  WHERE tipo='pagar'
    AND status='pendente'
    AND descricao ILIKE '%semana de%'
    AND (data_vencimento at time zone 'UTC')::date = (now() at time zone 'UTC')::date
  $cron$
);
