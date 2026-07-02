-- ============================================================
-- Lojas: padrões no PDV. Ao escolher a loja, o PDV já vem com o depósito e a
-- tabela dela. A conta padrão fica pronta pro controle de saldo por conta.
-- deposito_id é TEXT (padrão SIGE); contas/tabelas são uuid.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table lojas add column if not exists deposito_padrao_id text references depositos(id);
alter table lojas add column if not exists conta_padrao_id    uuid references contas(id);
alter table lojas add column if not exists tabela_padrao_id   uuid references tabelas_preco(id);
