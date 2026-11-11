-- Dados da empresa por loja: natureza jurídica, data de abertura, CNAE e nome fantasia.
--
-- A loja guardava razão social, CNPJ e endereço, mas não o resto da ficha da empresa.
-- Com dois CNPJs (um por loja) e duas contas bancárias, esses campos passam a ser
-- necessários para separar custo por empresa — que é o que se quer saber adiante.
-- Fonte dos dados: consulta pública do Redesim, PDFs de 02/11/2026.

alter table public.lojas add column if not exists nome_fantasia text;
alter table public.lojas add column if not exists natureza_juridica text;
alter table public.lojas add column if not exists data_abertura date;
alter table public.lojas add column if not exists cnae_principal text;
