-- ============================================================
-- Marcas: registro próprio (antes era texto livre em produtos.marca).
-- produtos.marca continua sendo o nome (ligação por texto, como categorias).
-- Semeia com as marcas que já existem nos produtos. Idempotente.
-- ============================================================

create table if not exists marcas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  ativa      boolean default true,
  created_at timestamptz default now()
);

insert into marcas (nome)
select distinct trim(marca) from produtos
where marca is not null and trim(marca) <> ''
on conflict (nome) do nothing;
