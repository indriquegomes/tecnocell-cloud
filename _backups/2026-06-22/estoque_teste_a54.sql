-- ============================================================
-- Estoque de TESTE — produtos A54 em Petrópolis / Teresópolis
-- Gerado em 2026-06-22 (para testar o seletor de Loja no PDV)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > Run
--
-- CENÁRIO:
--   Galaxy A54 (PRD001) -> Petrópolis 5  | Teresópolis 3   (vende nas duas)
--   Capinha    (PRD002) -> Petrópolis 10 | Teresópolis —   (bloqueia em Teresópolis)
--   Película   (PRD003) -> Petrópolis —  | Teresópolis 8   (bloqueia em Petrópolis)
--
-- São dados de teste — ajuste/remova depois na sua limpeza.
-- ============================================================

insert into estoque (produto_id, deposito_id, quantidade, updated_at) values
  ('PRD001', '63d9054d59a9c829747233d4', 5,  now()),  -- Galaxy A54 @ PETRÓPOLIS
  ('PRD001', '63e4dc8ede713ef765366d69', 3,  now()),  -- Galaxy A54 @ TERESÓPOLIS LOJA
  ('PRD002', '63d9054d59a9c829747233d4', 10, now()),  -- Capinha    @ PETRÓPOLIS
  ('PRD003', '63e4dc8ede713ef765366d69', 8,  now())   -- Película   @ TERESÓPOLIS LOJA
on conflict (produto_id, deposito_id)
do update set quantidade = excluded.quantidade, updated_at = now();

-- Conferir
select produto_id, deposito_id, quantidade
from estoque
where produto_id in ('PRD001','PRD002','PRD003')
  and deposito_id in ('63d9054d59a9c829747233d4','63e4dc8ede713ef765366d69')
order by produto_id;
