-- ============================================================
-- Etapa 1 — Formas de pagamento com LÓGICA de verdade.
-- Cada forma passa a decidir: qual máquina usa (taxa/parcelas) e quando o
-- dinheiro entra (prazo de recebimento). Acaba o pick duplo de máquina no PDV.
--
-- maquina_id: só vale p/ tipo cartao_credito/cartao_debito (senão fica null).
-- prazo_recebimento: a_vista | d1 | d30 | por_parcela.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table formas_pagamento add column if not exists maquina_id       uuid references maquinas_cartao(id);
alter table formas_pagamento add column if not exists prazo_recebimento text default 'a_vista';

-- Prazos padrão razoáveis por tipo (só onde ainda está no default 'a_vista')
update formas_pagamento set prazo_recebimento = 'd1'          where tipo = 'cartao_debito'  and coalesce(prazo_recebimento,'a_vista') = 'a_vista';
update formas_pagamento set prazo_recebimento = 'por_parcela' where tipo = 'cartao_credito' and coalesce(prazo_recebimento,'a_vista') = 'a_vista';
