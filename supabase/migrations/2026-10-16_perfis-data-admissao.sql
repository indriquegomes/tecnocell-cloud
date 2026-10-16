-- Data de admissão do funcionário. O detector de falta NÃO marca falta
-- em dias anteriores à admissão (ex: contratado no dia 13 não 'faltou' no dia 05).
alter table public.perfis
  add column if not exists data_admissao date;
