-- Acelera a tela de Escala: a query de pontos filtra e ordena por criado_em,
-- mas não tinha índice — a cada refresh fazia full scan + sort.
create index if not exists idx_pontos_criado_em on public.pontos (criado_em);
