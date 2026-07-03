-- Permite o status 'faturado' no pedido (o botão Faturar marca assim pra não
-- faturar 2×). Mantém os demais status existentes.

alter table pedidos drop constraint if exists pedidos_status_check;
alter table pedidos add constraint pedidos_status_check
  check (status in ('rascunho','pendente','aprovado','cancelado','faturado'));
