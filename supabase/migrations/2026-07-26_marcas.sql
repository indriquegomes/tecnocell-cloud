-- ============================================================
-- Marcas: registro dos fabricantes. Já existia uma tabela marcas(nome) do SIGE
-- (chave = nome). produtos.marca liga por texto (como categorias). Idempotente.
-- ============================================================

create table if not exists marcas (nome text primary key);

insert into marcas (nome)
select distinct trim(marca) from produtos
where marca is not null and trim(marca) <> ''
on conflict (nome) do nothing;
