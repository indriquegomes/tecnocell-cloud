-- ============================================================
-- Forma de pagamento ganha TIPO — o comportamento no PDV (troco, fiado,
-- máquina/parcela) passa a vir do TIPO, não do NOME. Renomear vira seguro.
--
-- Seed: mapeia as formas existentes pelo nome (uma vez só). Ordem importa:
-- fiado antes de crédito (o nome "Crédito Loja (Fiado)" contém "crédito").
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table formas_pagamento add column if not exists tipo text;

update formas_pagamento set tipo = 'fiado'
  where tipo is null and (lower(nome) like '%fiado%' or lower(nome) like '%crédito loja%' or lower(nome) like '%credito loja%');
update formas_pagamento set tipo = 'cartao_debito'
  where tipo is null and (lower(nome) like '%débito%' or lower(nome) like '%debito%');
update formas_pagamento set tipo = 'cartao_credito'
  where tipo is null and (lower(nome) like '%crédito%' or lower(nome) like '%credito%' or lower(nome) like '%cart%');
update formas_pagamento set tipo = 'dinheiro'
  where tipo is null and lower(nome) like '%dinheiro%';
update formas_pagamento set tipo = 'pix'
  where tipo is null and lower(nome) like '%pix%';
