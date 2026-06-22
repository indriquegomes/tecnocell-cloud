-- ============================================================
-- Limpeza das formas de pagamento — TecnoCell
-- Gerado em 2026-06-22 (Entrega 1)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > Run
--
-- O QUE FAZ:
--   - Desativa TODAS as formas (ativo = false) — nada é apagado
--   - Reativa e padroniza apenas as 5 formas que você usa
--   - Renomeia "Crédito Loja" -> "Crédito Loja (Fiado)"
--
-- Histórico de vendas/lançamentos NÃO é afetado (só liga/desliga o flag 'ativo').
-- Backup do estado anterior: _backups/2026-06-22/formas_pagamento_ANTES.json
-- ============================================================

-- 1) Desativar todas
update formas_pagamento set ativo = false;

-- 2) Reativar + padronizar as 5 formas usadas
update formas_pagamento set ativo = true, nome = 'PIX'                  where id = 'FP003';
update formas_pagamento set ativo = true, nome = 'Dinheiro'             where id = 'FP001';
update formas_pagamento set ativo = true, nome = 'Crédito Loja (Fiado)' where id = '63de417be94e938cc171c865';
update formas_pagamento set ativo = true, nome = 'Cartão de Débito'     where id = 'FP004';
update formas_pagamento set ativo = true, nome = 'Cartão de Crédito'    where id = 'FP002';

-- 3) Conferir (deve retornar exatamente as 5 acima)
select id, nome, ativo from formas_pagamento where ativo = true order by nome;
