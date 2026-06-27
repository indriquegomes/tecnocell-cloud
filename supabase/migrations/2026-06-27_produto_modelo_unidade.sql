-- Cadastro de produto: campos Modelo e Unidade
-- Seguro: só ADICIONA. Não altera nem apaga dados existentes.

alter table produtos add column if not exists modelo text;
alter table produtos add column if not exists unidade text default 'UN';
