-- ============================================================
-- Lojas: extras úteis (contato, fiscal leve, hierarquia, cupom, controle PDV).
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table lojas add column if not exists email               text;
alter table lojas add column if not exists whatsapp            text;
alter table lojas add column if not exists inscricao_municipal text;
alter table lojas add column if not exists complemento         text;
alter table lojas add column if not exists matriz_id           uuid references lojas(id);
alter table lojas add column if not exists senha_desconto      text;
alter table lojas add column if not exists prazo_troca_dias    int;
alter table lojas add column if not exists termos_venda        text;
alter table lojas add column if not exists informativo_os      text;
alter table lojas add column if not exists logo_url            text;
