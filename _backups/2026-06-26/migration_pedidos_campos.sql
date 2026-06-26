-- ============================================================
-- TecnoCell — Adicionar campos em pedidos
-- 2026-06-26
-- Rodar no: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS deposito_id   text,
  ADD COLUMN IF NOT EXISTS tabela_preco_id text,
  ADD COLUMN IF NOT EXISTS forma_pagamento_id text,
  ADD COLUMN IF NOT EXISTS vendedor_id   uuid,
  ADD COLUMN IF NOT EXISTS vendedor_nome text,
  ADD COLUMN IF NOT EXISTS origem        text DEFAULT 'balcao';
