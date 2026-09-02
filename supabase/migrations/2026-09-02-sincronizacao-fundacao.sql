-- ============================================================
-- Fundação da sincronização sombra SIGE → TecnoCell (Fase 1).
--
-- Decisão (dono): SIGE é mestre, TecnoCell é sombra unilateral — recebe e
-- reproduz, nunca devolve. Estas tabelas são o início do "cano": a credencial
-- de origem (chave por loja) e a fila de eventos com a Porta 1 anti-duplicata.
--
-- Segurança: RLS habilitado SEM política → só o service role (ingest/worker)
-- enxerga. O captor NÃO usa service role: manda a chave da loja no header e o
-- ingestor (server-side, service role) confere o hash.
--
-- Próximas fases (Fase 4/5) adicionam: sinc_mapeamento (vínculo SIGE↔TecnoCell),
-- sinc_estado (cursor), sinc_auditoria (log de aplicação) e sinc_reconciliacao
-- (Fechamento do Dia).
-- ============================================================

-- Chave de origem por loja. Guarda SÓ o hash SHA-256 da chave — nunca a chave
-- em claro. Rotação = chave nova + expira_em. Revogação = revogado_em.
-- O dono gera a chave e insere o hash aqui (a chave em claro nunca entra no repo).
create table if not exists sinc_credencial_loja (
  loja_id     text primary key,
  chave_hash  text not null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz,
  revogado_em timestamptz
);

-- Fila bruta de eventos. Porta 1 anti-duplicata = UNIQUE em idempotency_key:
-- o mesmo evento reenviado (retry do captor) é ignorado no insert.
--
-- idempotency_key segue o formato: loja:entidade:sige_id:ação:sequência.
-- estado: pendente → (aplicado | quarentena | invalido | descartado).
-- payload = envelope cru do evento, imutável depois de gravado.
create table if not exists sinc_inbox (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  origem          text not null default 'sige',
  loja            text not null,
  entidade        text not null,
  acao            text not null,
  sige_id         text,
  sequencia       bigint,
  schema_version  integer not null default 1,
  payload         jsonb not null default '{}'::jsonb,
  estado          text not null default 'pendente'
                  check (estado in ('pendente','aplicado','quarentena','invalido','descartado')),
  tentativas      integer not null default 0,
  proximo_em      timestamptz,
  erro            text,
  recebido_em     timestamptz not null default now(),
  aplicado_em     timestamptz
);

create index if not exists sinc_inbox_estado_idx   on sinc_inbox (estado, proximo_em);
create index if not exists sinc_inbox_entidade_idx on sinc_inbox (loja, entidade, sequencia);

-- RLS sem política → ninguém além do service role toca.
alter table sinc_credencial_loja enable row level security;
alter table sinc_inbox            enable row level security;
