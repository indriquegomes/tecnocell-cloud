-- Pagamento de motoboy (Fase 2).
-- Liga a rota ao lançamento do pagamento (conta a pagar) pra não pagar o
-- mesmo dia 2x. Rota com lancamento_id preenchido = já foi gerada a conta.
alter table public.rotas_motoboy
  add column if not exists lancamento_id text;
