-- ============================================================
-- Lojas: identidade fiscal (o que sai no cupom de cada unidade).
-- Razão social, inscrição estadual e endereço completo. (cnpj/endereco já existem.)
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table lojas add column if not exists razao_social       text;
alter table lojas add column if not exists inscricao_estadual text;
alter table lojas add column if not exists cep                text;
alter table lojas add column if not exists numero             text;
alter table lojas add column if not exists bairro             text;
