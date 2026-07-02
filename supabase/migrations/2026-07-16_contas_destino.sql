-- ============================================================
-- Etapa 2 (começar simples) — "pra onde vai o dinheiro".
-- Conta = lugar onde o dinheiro fica de verdade: Caixa (gaveta) ou Banco.
-- Cada forma de pagamento aponta pra uma conta destino.
-- Fiado NÃO tem conta (não entra dinheiro — vira 'a receber' do cliente).
-- Idempotente. Seguro reaplicar.
-- ============================================================

create table if not exists contas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  tipo       text not null default 'banco',   -- 'caixa' (dinheiro em mãos) | 'banco'
  ativa      boolean default true,
  created_at timestamptz default now()
);

-- Toda loja tem um caixa físico
insert into contas (nome, tipo)
select 'Caixa da Loja', 'caixa'
where not exists (select 1 from contas where tipo = 'caixa');

alter table formas_pagamento add column if not exists conta_destino_id uuid references contas(id);

-- Dinheiro cai no caixa por padrão
update formas_pagamento
set conta_destino_id = (select id from contas where tipo = 'caixa' order by created_at limit 1)
where tipo = 'dinheiro' and conta_destino_id is null;

-- Fiado nunca tem conta destino
update formas_pagamento set conta_destino_id = null where tipo = 'fiado';
