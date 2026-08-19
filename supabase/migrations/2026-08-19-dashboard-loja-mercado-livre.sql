-- ============================================================
-- Dashboard por loja do Mercado Livre — colunas e tabelas novas
-- Ver docs/superpowers/specs/2026-08-19-dashboard-loja-mercado-livre-design.md
-- ============================================================

-- Parte 1/5: catálogo é lido pelo card "Anúncios de catálogo ativos" do
-- Dashboard antes da Parte 5 (Anúncios do Catálogo) existir de verdade —
-- fica default false até a Tarefa 9 passar a preencher de verdade.
alter table integracoes_mercado_livre_anuncios
  add column if not exists is_catalogo boolean not null default false;
alter table integracoes_mercado_livre_anuncios
  add column if not exists catalog_product_id text;

-- Parte 4: pergunta pública pré-venda.
create table if not exists integracoes_mercado_livre_perguntas (
  id             uuid primary key default gen_random_uuid(),
  ml_question_id text not null unique,
  ml_item_id     text not null,
  texto          text not null,
  respondida     boolean not null default false,
  resposta_texto text,
  criado_em      timestamptz not null default now(),
  respondida_em  timestamptz
);

-- Parte 6: chat pós-venda (mensagens entre comprador e vendedor de um pedido).
create table if not exists integracoes_mercado_livre_mensagens (
  id             uuid primary key default gen_random_uuid(),
  ml_message_id  text not null unique,
  ml_pack_id     text not null,
  ml_order_id    text,
  autor          text not null,   -- 'comprador' | 'vendedor'
  texto          text not null,
  lida           boolean not null default false,
  criado_em      timestamptz not null default now()
);
