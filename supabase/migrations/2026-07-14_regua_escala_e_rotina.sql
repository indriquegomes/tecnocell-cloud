-- ============================================================
-- 1. RÉGUA da escala (edição arrastando na linha do tempo) + ALMOÇO/LANCHE.
--    Durante a pausa a pessoa NÃO cobre a loja — o almoço pode virar furo, e é
--    exatamente o que o Vitor quer enxergar. Cor por pessoa ("a Bruna é rosinha").
--
-- 2. Crediário POR PESSOA no PDV: rotina de pagamento no cadastro ("paga no fim
--    do dia") — o combinado que separa saldo NORMAL de inadimplência.
-- ============================================================

alter table pessoas add column if not exists rotina_pagamento text;

alter table escalas
  add column if not exists pausa_inicio time,
  add column if not exists pausa_fim time;

alter table escala_excecoes
  add column if not exists pausa_inicio time,
  add column if not exists pausa_fim time;

alter table perfis add column if not exists cor_escala text;
