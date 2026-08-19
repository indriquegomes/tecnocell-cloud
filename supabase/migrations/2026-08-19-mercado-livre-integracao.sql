-- ============================================================
-- Integração real com Mercado Livre — Peças 1-4
-- Ver docs/superpowers/specs/2026-08-19-mercado-livre-integracao-design.md
-- ============================================================

-- Peça 1: conexão OAuth. Singleton de propósito (id sempre 'principal') —
-- o negócio só tem uma conta Mercado Livre; conectar de novo substitui.
create table if not exists integracoes_mercado_livre (
  id                text primary key default 'principal',
  ml_user_id        text not null,
  ml_nickname       text,
  access_token      text not null,
  refresh_token     text not null,
  expira_em         timestamptz not null,
  conectado_por     text,
  conectado_em      timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- Peça 2: anúncio do Mercado Livre <-> produto do TecnoCell. produto_id
-- null = sem correspondência encontrada (nunca casa por título, só código).
create table if not exists integracoes_mercado_livre_anuncios (
  id             uuid primary key default gen_random_uuid(),
  ml_item_id     text not null unique,
  produto_id     text references produtos(id),
  titulo_ml      text not null,
  preco_ml       numeric(12,2),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Peça 3: pedido pago no ML que finalizar_venda não conseguiu processar
-- (estoque insuficiente, item sem produto correspondente). Nunca some.
create table if not exists integracoes_mercado_livre_pedidos_pendentes (
  id            uuid primary key default gen_random_uuid(),
  ml_order_id   text not null unique,
  motivo        text not null,
  payload       jsonb not null,
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now()
);

-- Peça 3: idempotência — webhook duplicado não cria venda duplicada.
alter table vendas add column if not exists ml_order_id text unique;

-- Peça 3: forma de pagamento nova. tipo = 'marketplace' (não é 'fiado' nem
-- 'vale_credito') então CONTA como faturamento normal nas Metas — decisão
-- de negócio confirmada com o usuário antes desta spec.
insert into formas_pagamento (id, nome, ativo, tipo)
values ('FP_MERCADOLIVRE', 'Mercado Livre', true, 'marketplace')
on conflict (id) do update set nome = excluded.nome, ativo = true, tipo = excluded.tipo;
