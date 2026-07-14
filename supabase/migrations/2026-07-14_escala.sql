-- ============================================================
-- ESCALA DE HORÁRIOS.
--
-- Vitor: hora de entrada/saída por pessoa, cálculo de horas, e ver o FURO — loja
-- aberta e ninguém escalado. Loja abre 08:00 e fecha 19:00 (sábado 17:00). A escala
-- VARIA, então tem alterações por dia. Cobertura mínima: 1 pessoa.
--
--   escalas         -> a ROTINA (a Duda entra 08h toda segunda). unique por (pessoa, dia)
--   escala_excecoes -> a ALTERAÇÃO de um dia específico (folga, entrar mais tarde)
-- ============================================================

create table if not exists escalas (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfis(id) on delete cascade,
  loja_id    uuid references lojas(id) on delete set null,
  dia        smallint not null check (dia between 0 and 6),   -- 0=dom … 6=sáb
  entrada    time not null,
  saida      time not null,
  ativo      boolean not null default true,
  created_at timestamptz default now(),
  unique (perfil_id, dia)
);

create table if not exists escala_excecoes (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfis(id) on delete cascade,
  data       date not null,
  folga      boolean not null default false,
  entrada    time,
  saida      time,
  motivo     text,
  criado_por uuid references perfis(id),
  created_at timestamptz default now(),
  unique (perfil_id, data)
);

create index if not exists idx_excecoes_data on escala_excecoes (data);
