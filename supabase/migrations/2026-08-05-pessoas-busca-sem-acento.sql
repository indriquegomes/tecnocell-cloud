-- Busca de pessoas sem depender de acento (José acha "jose", Conceição acha "conceicao").
-- Cria uma coluna normalizada (minúscula + sem acento), mantida por trigger, com índice.
-- Depois a tela de clientes busca nessa coluna com o termo também normalizado.

create extension if not exists unaccent;

alter table pessoas add column if not exists nome_norm text;

-- backfill do que já existe
update pessoas set nome_norm = lower(unaccent(coalesce(nome, '')));

-- mantém atualizado em insert/update do nome
create or replace function pessoas_set_nome_norm() returns trigger as $$
begin
  new.nome_norm := lower(unaccent(coalesce(new.nome, '')));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pessoas_nome_norm on pessoas;
create trigger trg_pessoas_nome_norm
  before insert or update of nome on pessoas
  for each row execute function pessoas_set_nome_norm();

create index if not exists idx_pessoas_nome_norm on pessoas (nome_norm text_pattern_ops);
