-- Subcategoria nos lancamentos financeiros.
--
-- O financeiro passou a ter tres niveis: setor -> categoria -> subcategoria.
-- A coluna nasce VAZIA: nenhum lancamento existente e alterado e nenhum valor muda.
-- Subcategoria e rotulo; nao entra em conta, total, cartao nem relatorio de dinheiro.

alter table public.lancamentos add column if not exists subcategoria text;

comment on column public.lancamentos.subcategoria is
  'Detalhe dentro da categoria (ex.: Mercadoria > Peca; Fiado > Atacado). So rotulo: nao entra em total.';
