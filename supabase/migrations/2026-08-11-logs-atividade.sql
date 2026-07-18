-- Trilha de auditoria: o que cada usuária CLICOU, independente do que o banco gravou.
-- A graça está no cruzamento: se existe log de "recebi o fiado" mas não existe o
-- movimento de caixa correspondente, o dinheiro sumiu no caminho e o alerta acusa.
--
-- contexto é jsonb livre de propósito — cada ação guarda o que faz sentido pra ela
-- (id do lançamento, valor, forma de pagamento) sem precisar de migration nova.

create table if not exists logs_atividade (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid,
  usuario_email text,
  tipo_acao text not null,
  contexto jsonb default '{}'::jsonb not null,
  url text,
  origem text default 'server' not null,   -- 'server' (action) ou 'client' (clique)
  created_at timestamptz default now() not null,
  primary key (id)
);

-- Os dois cruzamentos da auditoria: "quais pagamentos de hoje" e "os logs desta venda".
create index if not exists idx_logs_acao_data on logs_atividade (tipo_acao, created_at desc);
create index if not exists idx_logs_usuario   on logs_atividade (usuario_id, created_at desc);
create index if not exists idx_logs_contexto  on logs_atividade using gin (contexto);

alter table logs_atividade enable row level security;

-- Escrita só pela service role (as actions). Leitura pelo painel de auditoria.
drop policy if exists logs_leitura on logs_atividade;
create policy logs_leitura on logs_atividade for select
  using (auth.role() = 'authenticated');
