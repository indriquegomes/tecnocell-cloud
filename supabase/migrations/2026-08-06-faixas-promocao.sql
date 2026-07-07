-- Promoção tipo "progressivo": preço por faixa de quantidade (películas).
-- A quantidade que define a faixa é o TOTAL dos produtos da promoção no carrinho
-- (misturados). Ex: 3D → 1un R$4,00 · 10un R$1,80 · 100un R$1,70 ...

create table if not exists faixas_promocao (
  id uuid primary key default gen_random_uuid(),
  promocao_id uuid not null references promocoes(id) on delete cascade,
  quantidade_minima integer not null check (quantidade_minima >= 1),
  preco numeric(12,2) not null check (preco >= 0),
  created_at timestamptz default now(),
  unique (promocao_id, quantidade_minima)
);

create index if not exists idx_faixas_promocao_promo on faixas_promocao (promocao_id);
