-- ============================================================================
-- Financeiro por loja: backfill de contas antigas (19/09)
--
-- Contas manuais (criarLancamento) nasceram SEM loja_id. Agora cada loja tem as
-- suas contas (aluguel, salários, luz, internet...). Backfill via conta bancária:
-- quem estava numa conta que JÁ tem loja_id herda a loja da conta.
-- Sobram poucas sem conta/loja -> ficam null (aparecem como "Sem loja").
-- ============================================================================

update public.lancamentos l
set loja_id = c.loja_id
from public.contas c
where l.loja_id is null
  and l.conta_id = c.id
  and c.loja_id is not null;
