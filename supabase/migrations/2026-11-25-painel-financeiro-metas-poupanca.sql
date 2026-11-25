-- Painel financeiro (protótipo aprovado pelo dono) — METAS DE POUPANÇA.
--
-- As "metas" que já existem no app (tabela public.metas) são metas de VENDA
-- (faturamento por período, com faixas de prêmio). O painel financeiro pede
-- outro conceito: potes de reserva (Reserva, Impostos, Equipamentos, Meta do
-- ano) com valor guardado e objetivo. Por isso as tabelas são novas e separadas.
--
-- O "guardar" NÃO move dinheiro de conta bancária nenhuma: ele é uma RESERVA.
-- O painel mostra "Tenho agora" = saldo das contas − tudo que está guardado,
-- então guardar reduz o disponível do painel e enche o pote. Cada aporte fica
-- registrado (auditável e reversível), com o quinto de quem guardou.

create table if not exists public.metas_poupanca (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#34C79D',
  atual numeric(14,2) not null default 0 check (atual >= 0),
  objetivo numeric(14,2) not null check (objetivo > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aportes_poupanca (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas_poupanca(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  criado_por uuid references public.perfis(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists aportes_poupanca_meta_idx on public.aportes_poupanca (meta_id, criado_em desc);

-- Só service role (as telas usam createServiceClient). RLS ligado sem policy
-- fecha acesso anônimo/autenticado direto na tabela.
alter table public.metas_poupanca enable row level security;
alter table public.aportes_poupanca enable row level security;

-- Potes iniciais do protótipo (objetivos do documento). O valor guardado começa
-- em zero: dinheiro real é o dono quem guarda, pelo botão do painel.
insert into public.metas_poupanca (nome, cor, atual, objetivo)
select v.nome, v.cor, 0, v.objetivo
from (values
  ('Reserva',       '#34C79D', 20000.00),
  ('Impostos',      '#5BC0EB', 10000.00),
  ('Equipamentos',  '#7B6CF6', 10000.00),
  ('Meta do ano',   '#FFD25A', 10000.00)
) as v(nome, cor, objetivo)
where not exists (select 1 from public.metas_poupanca);
