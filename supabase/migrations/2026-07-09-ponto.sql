-- Registro de ponto (entrada/saída/pausa/retorno) por funcionário.
create table if not exists pontos (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  tipo       text not null,          -- entrada | pausa | retorno | saida
  loja_id    text,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_pontos_usuario on pontos(usuario_id, criado_em);
