-- Categoria no lançamento (Plano de Conta simplificado do SIGE).
-- Agrupa despesas/receitas (Aluguel, Fornecedor, Salários…) pra ver no DRE.
-- Recorrência/parcelamento não precisa de coluna — gera vários lançamentos na criação.

alter table lancamentos add column if not exists categoria text;
