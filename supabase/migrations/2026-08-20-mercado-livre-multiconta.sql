-- ============================================================
-- Multiplas contas Mercado Livre — de singleton pra multi-conta
-- Ver docs/superpowers/specs/2026-08-20-mercado-livre-multiconta-design.md
-- ============================================================

-- A unica linha hoje ('principal') e a conta de teste ja desconectada
-- durante a sessao — limpa antes de mudar o formato da chave.
delete from integracoes_mercado_livre;

alter table integracoes_mercado_livre drop constraint integracoes_mercado_livre_pkey;
alter table integracoes_mercado_livre alter column id drop default;
alter table integracoes_mercado_livre alter column id type uuid using gen_random_uuid();
alter table integracoes_mercado_livre alter column id set default gen_random_uuid();
alter table integracoes_mercado_livre add primary key (id);
alter table integracoes_mercado_livre add constraint integracoes_mercado_livre_ml_user_id_key unique (ml_user_id);

alter table integracoes_mercado_livre_anuncios
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_pedidos_pendentes
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_perguntas
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_mensagens
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;

create index if not exists idx_ml_anuncios_conexao on integracoes_mercado_livre_anuncios(conexao_id);
create index if not exists idx_ml_perguntas_conexao on integracoes_mercado_livre_perguntas(conexao_id);
create index if not exists idx_ml_mensagens_conexao on integracoes_mercado_livre_mensagens(conexao_id);

alter table vendas
  add column if not exists ml_conexao_id uuid references integracoes_mercado_livre(id);
create index if not exists idx_vendas_ml_conexao on vendas(ml_conexao_id) where ml_conexao_id is not null;

-- 903 anuncios da conta de teste, sem venda associada — comeca limpo.
delete from integracoes_mercado_livre_anuncios;
