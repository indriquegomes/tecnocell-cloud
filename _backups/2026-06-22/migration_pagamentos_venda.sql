-- ============================================================
-- Migration: Pagamento Misto — TecnoCell
-- Gerado em 2026-06-22
--
-- RODAR NO: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- Tabela de pagamentos por venda (suporte a pagamento misto)
create table if not exists pagamentos_venda (
  id                 uuid primary key default uuid_generate_v4(),
  venda_id           uuid not null,
  forma_pagamento_id text references formas_pagamento(id) on delete set null,
  valor              numeric(12,2) not null,
  taxa               numeric(12,2) not null default 0,
  maquina            text,                             -- 'ton' | 'pagbank' | null
  parcelas           int not null default 1,
  status             text not null default 'pago'
    check (status in ('pago', 'pendente')),            -- pendente = fiado (A Receber)
  created_at         timestamptz default now()
);

create index if not exists idx_pagamentos_venda_venda_id
  on pagamentos_venda(venda_id);

-- RLS
alter table pagamentos_venda enable row level security;

create policy "Funcionários leem pagamentos_venda"
  on pagamentos_venda for select to authenticated using (true);

-- (Inserções via service role — bypassa RLS por definição)
