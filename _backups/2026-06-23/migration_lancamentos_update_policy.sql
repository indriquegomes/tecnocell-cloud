-- ============================================================
-- Migration: RLS UPDATE policy para lancamentos
-- Gerado em 2026-06-23
--
-- RODAR NO: Supabase Dashboard > SQL Editor > New query > Run
--
-- Problema: lancamentos tinha apenas policy de SELECT.
-- O pagarLancamentos() depende do service role, mas como camada
-- extra de segurança, adicionamos policy de UPDATE p/ autenticados.
-- ============================================================

create policy "Funcionários atualizam lançamentos"
  on lancamentos for update to authenticated using (true) with check (true);
