-- ============================================================
-- Modelos de Check-list para Ordem de Serviço (Isa 29/07: "criar página pra
-- criarmos alguns check-lists, pois há várias"). Cada modelo tem um nome e uma
-- lista de itens (perguntas/verificações do aparelho). itens = array de strings.
-- (Aplicar o check-list numa OS específica é uma etapa seguinte.)
-- Idempotente.
-- ============================================================
create table if not exists checklists_modelo (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  itens      jsonb not null default '[]'::jsonb,
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);
