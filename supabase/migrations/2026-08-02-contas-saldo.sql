-- Saldo por conta (fluxo profissional, tipo "Bancos" do SIGE).
-- saldo_inicial: quanto tinha na conta quando começou. O saldo atual é calculado:
--   saldo_inicial + vendas que caem na conta (pagamentos_venda via formas_pagamento.conta_destino_id)
--   + lançamentos pagos (receber − pagar) com conta_id
--   + transferências (destino − origem)
-- conta_id no lançamento: em qual conta o dinheiro entrou/saiu.

alter table contas      add column if not exists saldo_inicial numeric default 0;
alter table lancamentos add column if not exists conta_id uuid references contas(id);
