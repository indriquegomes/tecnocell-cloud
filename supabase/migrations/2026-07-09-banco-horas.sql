-- Banco de horas (hora extra) por funcionário. horas > 0 adiciona, < 0 retira.
create table if not exists banco_horas (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  horas      numeric not null,        -- + adiciona / - retira
  data       date not null,
  motivo     text,                    -- solicitacao_loja | cobrir_colega | atraso | pagamento | folga | outro
  obs        text,
  criado_por uuid,
  criado_em  timestamptz not null default now()
);

create index if not exists idx_banco_horas_usuario on banco_horas(usuario_id, data);
