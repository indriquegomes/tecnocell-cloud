-- PROMOÇÃO TOP 20 no produto — 23/11/2026
--
-- Motivo: a lista das "top 20 mais vendidas" era marcada pelo TEXTO no nome
-- ("*PROMOÇÃO TOP20*"). Qualquer edição do nome (ou erro de digitação, como o
-- "(ATUALIZADA)" que já existe) desligava a regra sem ninguém perceber. A regra de
-- desconto da segunda peça precisa de uma marcação de verdade no produto.
--
-- Aplicar no SQL Editor (migration não roda sozinha). Depois do SQL, o deploy do
-- código que lê/escreve a coluna.

alter table produtos add column if not exists promocao_top20 boolean not null default false;

-- Liga o campo nos produtos que hoje carregam a marcação no nome (48 ativos).
update produtos set promocao_top20 = true where nome ilike '%TOP20%';
