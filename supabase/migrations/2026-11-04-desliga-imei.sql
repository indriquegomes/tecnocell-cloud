-- ============================================================================
-- DESLIGA O CONTROLE POR IMEI/SÉRIE EM TODOS OS PRODUTOS
-- 04/11/2026 — decisão do dono: "não quero IMEI no app".
--
-- O PDV, a devolução e a venda já ignoram série (commit 6984802). Mas outras
-- telas leem produtos.controla_serie e continuam EXIGINDO IMEI:
--   - entrada de nota (Compras)
--   - movimentar estoque (entrada/saída/ajuste)
--   - histórico de movimentações
--   - transferência entre lojas
--   - conferência de estoque (bloqueia produto serializado)
--   - faturamento de pedido (bloqueia e manda pro PDV)
--
-- Em vez de caçar cada tela, desliga a flag na origem. É reversível: a tabela de
-- backup guarda exatamente quem estava marcado.
-- ============================================================================

create table if not exists public.backup_controla_serie_20261104 as
  select id, nome, controla_serie
    from public.produtos
   where controla_serie = true;

update public.produtos
   set controla_serie = false
 where controla_serie = true;

-- Conferência: quantos produtos foram desligados (guarde o número)
select count(*) as produtos_desligados from public.backup_controla_serie_20261104;

-- Para voltar atrás (rodar só se quiser o IMEI de volta):
-- update public.produtos p set controla_serie = true
--   from public.backup_controla_serie_20261104 b where b.id = p.id;
