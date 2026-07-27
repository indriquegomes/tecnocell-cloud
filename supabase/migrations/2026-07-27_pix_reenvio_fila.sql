-- Arquivo do fechamento em fila pausada (opção C).
-- /fechar enfileira; o worker manda os comprovantes agrupados aos poucos, fora dos 60s.
alter table pix_periodos add column if not exists reenvio_ativo boolean not null default false;
alter table pix_periodos add column if not exists reenvio_cursor int not null default 0;
