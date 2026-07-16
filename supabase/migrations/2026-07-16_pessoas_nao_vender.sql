-- ============================================================
-- Cliente problemático vira CAMPO, não texto no nome.
--
-- Hoje as meninas marcam cliente ruim digitando no próprio nome:
--   "TATIANA DA SILVA COELHO (NÃO VENDER)"
--   "ELETROCELL (PENDENTE R$439,00)"
--   "*NAO VENDER*"
-- Isso quebra de três formas: a busca por nome fica suja, um dia alguém digita
-- "nao vender" em minúsculo e o sistema não vê, e não dá pra saber o motivo nem
-- desde quando.
--
-- `nao_vender` AVISA, não bloqueia (decisão do Vitor, 16/07): travar a venda sem
-- o cadastro estar limpo deixaria a menina presa no balcão com cliente na frente.
-- Quando o cadastro estiver confiável, dá pra apertar.
--
-- Read/write de schema. Não altera nenhum dado existente (default false).
-- ============================================================

alter table pessoas add column if not exists nao_vender boolean default false;
alter table pessoas add column if not exists nao_vender_motivo text;

-- índice parcial: são poucos (6 hoje), mas o PDV consulta sempre
create index if not exists idx_pessoas_nao_vender on pessoas (nao_vender) where nao_vender;

comment on column pessoas.nao_vender is 'Cliente problemático — o PDV avisa (não bloqueia). Antes era digitado no nome.';
comment on column pessoas.nao_vender_motivo is 'Por que não vender: calote, pendência, etc.';
