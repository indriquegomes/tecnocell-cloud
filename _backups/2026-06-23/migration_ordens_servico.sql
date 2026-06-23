-- Migration: tabelas de Ordens de Serviço
-- Executar no SQL Editor do Supabase Dashboard

create table if not exists ordens_servico (
  id              uuid primary key default uuid_generate_v4(),
  numero          serial,
  pessoa_id       text references pessoas(id) on delete set null,
  pessoa_nome     text,
  equipamento     text not null,     -- ex: "Celular", "Tablet", "Notebook"
  marca           text,
  modelo          text,
  serial_imei     text,
  defeito_relatado text not null,
  diagnostico     text,
  status          text not null default 'aberta'
                  check (status in ('aberta','em_andamento','aguardando_peca','pronta','entregue','cancelada')),
  tecnico_nome    text,
  total_pecas     numeric(12,2) default 0,
  total_mao_obra  numeric(12,2) default 0,
  total           numeric(12,2) default 0,
  observacoes     text,
  deposito_id     text references depositos(id) on delete set null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table if not exists itens_os (
  id              uuid primary key default uuid_generate_v4(),
  os_id           uuid references ordens_servico(id) on delete cascade,
  tipo            text check (tipo in ('peca','servico')) default 'peca',
  produto_id      text references produtos(id) on delete set null,
  nome            text not null,
  quantidade      numeric(12,3) default 1,
  preco_unitario  numeric(12,2) default 0,
  created_at      timestamptz default now()
);

-- RLS
alter table ordens_servico enable row level security;
alter table itens_os enable row level security;

create policy "Autenticados leem ordens_servico"
  on ordens_servico for select to authenticated using (true);

create policy "Autenticados leem itens_os"
  on itens_os for select to authenticated using (true);

create policy "Autenticados inserem ordens_servico"
  on ordens_servico for insert to authenticated with check (true);

create policy "Autenticados atualizam ordens_servico"
  on ordens_servico for update to authenticated using (true);

create policy "Autenticados inserem itens_os"
  on itens_os for insert to authenticated with check (true);

create policy "Autenticados atualizam itens_os"
  on itens_os for update to authenticated using (true);
