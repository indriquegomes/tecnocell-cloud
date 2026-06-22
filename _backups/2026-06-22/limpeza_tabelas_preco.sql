-- ============================================================
-- Limpeza das tabelas de preço — TecnoCell
-- Gerado em 2026-06-22 (Fase 1)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > Run
--
-- O QUE FAZ:
--   - Desativa a "Tabela Varejo" DUPLICADA (a mais nova, de 29/05)
--   - Mantém ativas: Revendedor, Atacado, Varejo (28/05)
--   - Nada é apagado (só ativa = false)
-- ============================================================

-- Desativar a Varejo duplicada (criada 29/05)
update tabelas_preco set ativa = false
where id = 'eb2d165a-8824-4b20-a597-878ea3e490b9';

-- Conferir (a duplicada deve aparecer como ativa = false)
select id, nome, ativa from tabelas_preco order by nome, created_at;
