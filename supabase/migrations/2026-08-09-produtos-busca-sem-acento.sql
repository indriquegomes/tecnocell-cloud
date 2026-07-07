-- Busca de produtos sem acento e por palavras (igual à de pessoas), agora usada
-- pelo PDV pra buscar produto SOB DEMANDA no servidor (não embutir 7.983 no HTML).
-- Coluna normalizada = nome + código + marca, tudo minúsculo e sem acento, com índice.

create extension if not exists unaccent;

alter table produtos add column if not exists busca_norm text;

-- backfill do que já existe
update produtos set busca_norm = lower(unaccent(
  coalesce(nome, '') || ' ' || coalesce(codigo, '') || ' ' || coalesce(marca, '')
));

-- mantém atualizado quando nome/codigo/marca mudam
create or replace function produtos_set_busca_norm() returns trigger as $$
begin
  new.busca_norm := lower(unaccent(
    coalesce(new.nome, '') || ' ' || coalesce(new.codigo, '') || ' ' || coalesce(new.marca, '')
  ));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_produtos_busca_norm on produtos;
create trigger trg_produtos_busca_norm
  before insert or update of nome, codigo, marca on produtos
  for each row execute function produtos_set_busca_norm();

create index if not exists idx_produtos_busca_norm on produtos (busca_norm text_pattern_ops);
