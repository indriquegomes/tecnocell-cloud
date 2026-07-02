-- ============================================================
-- Pessoas: ficha profissional (Tier 1). Endereço completo + WhatsApp +
-- nascimento + nome fantasia + observações. (endereco/bairro/cep já existem.)
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table pessoas add column if not exists nome_fantasia   text;
alter table pessoas add column if not exists data_nascimento date;
alter table pessoas add column if not exists celular         text;
alter table pessoas add column if not exists numero          text;
alter table pessoas add column if not exists complemento     text;
alter table pessoas add column if not exists observacoes     text;
