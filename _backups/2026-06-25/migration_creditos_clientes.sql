-- Migration: sistema de crédito do cliente
-- Executar no SQL Editor do Supabase Dashboard

create table if not exists creditos_clientes (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     text references pessoas(id) on delete set null,
  pessoa_nome   text not null,
  valor         numeric(12,2) not null check (valor > 0),
  tipo          text not null check (tipo in ('credito', 'uso', 'estorno')),
  descricao     text,
  devolucao_id  uuid references devolucoes(id) on delete set null,
  venda_id      text,
  operador_nome text,
  created_at    timestamptz default now()
);

-- RLS
alter table creditos_clientes enable row level security;

create policy "autenticados leem creditos_clientes"
  on creditos_clientes for select to authenticated using (true);

create policy "autenticados inserem creditos_clientes"
  on creditos_clientes for insert to authenticated with check (true);

create policy "autenticados atualizam creditos_clientes"
  on creditos_clientes for update to authenticated using (true);

-- Service role pode tudo (usado nas server actions)
create policy "service role acessa creditos_clientes"
  on creditos_clientes for all to service_role using (true);
