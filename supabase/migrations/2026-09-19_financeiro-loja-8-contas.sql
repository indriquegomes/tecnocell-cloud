-- ============================================================================
-- Backfill manual das 8 contas "Sem loja" (19/09)
-- Dono confirmou o vínculo de cada uma (cliente = loja de origem).
--   Petrópolis:  SERRA CELULARES + o "Uso interno" (PETRÓPOLIS LOJA)
--   Teresópolis: JOSÉ MIGUEL, AMILTON, WEVERSON, ANTONIO RAFAEL, JF CELL, CONTROL Z
-- ============================================================================

update public.lancamentos set loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
where loja_id is null and descricao like 'Devolução%' and pessoa_nome = 'SERRA CELULARES';

update public.lancamentos set loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946'
where loja_id is null and descricao like 'Uso interno%';

update public.lancamentos set loja_id = '81791d01-dc4a-485c-bbb8-f2b4cda6731c'
where loja_id is null and descricao like 'Devolução%'
  and pessoa_nome in ('JOSÉ MIGUEL MAGALHAES', 'AMILTON  TEREMAQCELL', 'WEVERSON MATTOS', 'ANTONIO RAFAEL SILVA CUNHA', 'JF CELL - ONLY CELL', 'CONTROL Z');
