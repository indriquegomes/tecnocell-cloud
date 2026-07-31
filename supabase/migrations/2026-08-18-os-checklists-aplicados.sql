-- ============================================================
-- Check-lists APLICADOS numa Ordem de Serviço (Isa 29/07: "botão de check list"
-- na OS). Cada linha é um check-list preenchido de uma OS: nome + itens com o
-- estado marcado. itens = [{ "texto": "...", "ok": true|false }].
-- Copiado do modelo (checklists_modelo) no momento de aplicar. Idempotente.
-- ============================================================
create table if not exists os_checklists (
  id         uuid primary key default gen_random_uuid(),
  os_id      uuid not null references ordens_servico(id) on delete cascade,
  nome       text not null,
  itens      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_os_checklists_os on os_checklists(os_id);
