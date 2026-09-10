-- Ordena os itens da nota de entrada na ordem em que foram digitados.
-- `itens_nota_entrada.id` é UUID v4 (aleatório): ordenar por id bagunçava a
-- sequência real de digitação. `created_at` preserva a ordem de inserção.
alter table itens_nota_entrada
  add column if not exists created_at timestamptz not null default now();
