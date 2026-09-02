-- ============================================================
-- Fase 4/5 — tabelas de aplicação e reconciliação da sincronização.
--
-- Complementa a fundação (2026-09-02-sincronizacao-fundacao.sql). O worker
-- (aplicador, Fase 4) e a reconciliação (Fechamento do Dia, Fase 5) usam estas
-- tabelas. RLS sem política → só service role enxerga.
-- ============================================================

-- Vínculo SIGE ↔ TecnoCell (o de-para). Por entidade, qual o id no SIGE e qual
-- o id no TecnoCell + a última sequência aplicada (pra "nunca regredir").
create table if not exists sinc_mapeamento (
  entidade          text not null,
  sige_id           text not null,
  loja              text not null,
  tecno_id          text,
  ultima_sequencia  bigint not null default 0,
  atualizado_em     timestamptz not null default now(),
  primary key (entidade, sige_id, loja)
);

-- Cursor por loja/entidade — a última sequência capturada. A reconciliação usa
-- pra detectar lacuna de evento (gap).
create table if not exists sinc_estado (
  loja              text not null,
  entidade          text not null,
  ultima_sequencia  bigint not null default 0,
  ultima_captura    timestamptz,
  primary key (loja, entidade)
);

-- Log imutável de cada evento aplicado. Só INSERT — nunca UPDATE/DELETE em
-- produção (é a "câmera de segurança" da sincronização).
create table if not exists sinc_auditoria (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid,
  entidade      text not null,
  sige_id       text,
  loja          text not null,
  acao          text not null,
  resultado     text not null,  -- ok | erro | quarentena
  detalhe       text,
  ocorrido_em   timestamptz not null default now()
);

-- Rodada de conferência (Fechamento do Dia) por domínio/loja. Divergência
-- registrada aqui vira alerta no painel.
create table if not exists sinc_reconciliacao (
  id                uuid primary key default gen_random_uuid(),
  dominio           text not null,
  loja              text not null,
  rodada_em         timestamptz not null default now(),
  total_sige        numeric,
  total_tecnocell   numeric,
  divergencia       numeric,
  status            text not null default 'pendente'
                    check (status in ('pendente','ok','divergente')),
  detalhe           jsonb
);

alter table sinc_mapeamento     enable row level security;
alter table sinc_estado         enable row level security;
alter table sinc_auditoria      enable row level security;
alter table sinc_reconciliacao  enable row level security;
