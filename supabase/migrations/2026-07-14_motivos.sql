-- ============================================================
-- POR QUE a peça voltou / a venda caiu.
--
-- O campo "motivo" da devolução era TEXTO LIVRE — e as 6 devoluções existentes tinham
-- motivo NULL. Ninguém preenche texto livre, e o que se preenche não dá pra somar.
--
-- Os motivos são FECHADOS (lib/motivos.ts) e obrigatórios. Saíram do Vitor:
--   devolução:    pediu pra testar · defeito ALEGADO (sem como confirmar) ·
--                 cliente dele desistiu do serviço · peça errada · outro
--   cancelamento: erro no pedido · cliente desistiu · sem estoque ·
--                 pagamento não passou · outro
--
-- Contexto: 16% dos pedidos de julho foram cancelados (e 22-25% o ano inteiro).
-- 76% deles têm uma venda pro MESMO cliente no MESMO dia — cheira a erro de digitação
-- sendo refeito, não a venda perdida. Mas isso é DEDUÇÃO. Só o motivo prova.
-- ============================================================

alter table devolucoes add column if not exists motivo_tipo text;
alter table vendas     add column if not exists motivo_cancelamento text;

create index if not exists idx_devolucoes_motivo  on devolucoes (motivo_tipo);
create index if not exists idx_vendas_motivo_canc on vendas (motivo_cancelamento);
