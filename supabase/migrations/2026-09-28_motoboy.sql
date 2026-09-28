-- Cargo MOTOBOY + registro de rotas (Fase 1).
-- Config do motoboy fica no perfis (valor fixo + adicional por loja + adicional extra).
-- O motoboy registra as rotas do dia; o admin vê e calcula o pagamento.

alter table public.perfis
  add column if not exists motoboy_valor_fixo numeric(12,2),
  add column if not exists motoboy_adicional_loja numeric(12,2),
  add column if not exists motoboy_adicional_extra numeric(12,2),
  add column if not exists motoboy_tipo text default 'diaria';

create table if not exists public.rotas_motoboy (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis(id),
  data date not null,
  loja_id uuid references public.lojas(id),
  entregas int not null default 0,
  extras int not null default 0,
  observacao text,
  created_at timestamptz default now()
);

create index if not exists rotas_motoboy_perfil_data on public.rotas_motoboy (perfil_id, data);
