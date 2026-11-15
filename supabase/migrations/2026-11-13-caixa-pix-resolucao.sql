-- RASTRO DO PIX NO FECHAMENTO.
--
-- O fechamento de caixa resolve o "PIX do dia" no instante em que fecha: soma por
-- fornecedor, abate a dívida e pronto. O que ele resolveu NÃO ficava guardado em
-- lugar nenhum — para auditar depois ("os PIX fecharam?") era preciso reconstruir a
-- conta a partir dos comprovantes, e reconstruir erra: em 12/11/2026 eu contei
-- comprovante como pagamento (o mesmo PIX chega em foto e PDF) e reportei 1.863,10
-- de buraco onde não havia nada.
--
-- Com esta coluna, cada fechamento guarda a própria resolução: a janela usada, o que
-- foi resolvido por fornecedor, quanto foi abatido, quanto virou crédito e o que era
-- a nossa conta. Auditar passa a ser ler, não recalcular.
alter table public.caixas
  add column if not exists pix_resolucao jsonb;

comment on column public.caixas.pix_resolucao is
  'Resolução do PIX do dia gravada no fechamento: janela, fornecedores (resolvido/abatido/crédito), conta própria e não identificado.';
