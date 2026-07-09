-- Quantas pessoas dividem a meta da loja (pra mostrar a "parte de cada um").
alter table metas add column if not exists pessoas int not null default 4;
