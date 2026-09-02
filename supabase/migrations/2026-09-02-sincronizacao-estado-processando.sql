-- O worker usa o estado 'processando' pra reivindicar um evento (idempotência
-- atômica), mas a check constraint da fundação não incluía esse valor. Adiciona.
alter table sinc_inbox drop constraint if exists sinc_inbox_estado_check;
alter table sinc_inbox add constraint sinc_inbox_estado_check
  check (estado in ('pendente','processando','aplicado','quarentena','invalido','descartado'));
