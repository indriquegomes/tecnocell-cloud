-- ============================================================================
-- TROCA ABATIDA EM NOTA (fornecedor não devolve peça, dá crédito)
-- 04/11/2026 — pedido do dono.
--
-- O fornecedor às vezes não manda a peça de volta: abate o valor na nota que a
-- loja deve. Não é perda — a peça vira crédito e compra outras peças. Só existe
-- perda de verdade quando o crédito é MENOR que o custo da peça.
--
--   1) novo status 'abatida' (não é 'perdida': a peça virou crédito)
--   2) valor_abatido e abatido_em para somar/filtrar depois
-- ============================================================================

alter table public.trocas drop constraint if exists trocas_status_check;
alter table public.trocas
  add constraint trocas_status_check
  check (status in ('aberta', 'enviada', 'retornou', 'perdida', 'cancelada', 'abatida'));

alter table public.trocas add column if not exists valor_abatido numeric(12,2);
alter table public.trocas add column if not exists abatido_em    timestamptz;

comment on column public.trocas.valor_abatido is
  'Crédito que o fornecedor deu na dívida da loja por esta troca (abate a conta a pagar, não é perda).';
comment on column public.trocas.perda is
  'Só a DIFERENÇA real quando o crédito recebido é menor que o custo da peça. Abatimento igual ou maior que o custo = perda zero.';
