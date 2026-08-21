-- Rascunho de anúncio do Mercado Livre — separado do produto de propósito
-- (ver docs/superpowers/specs/2026-08-21-publicar-anuncio-mercado-livre-design.md).
-- O cadastro de produto nunca é alterado por essa tela; o rascunho é uma
-- cópia editável (título, categoria, atributos, fotos) até publicar.
create table if not exists rascunhos_anuncio_ml (
  id uuid primary key default gen_random_uuid(),
  produto_id text not null references produtos(id),
  conexao_id uuid not null references integracoes_mercado_livre(id) on delete cascade,
  categoria_ml_id text,
  categoria_ml_nome text,
  titulo text,
  atributos jsonb not null default '{}'::jsonb,
  fotos jsonb not null default '[]'::jsonb,
  preco numeric,
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'erro')),
  ml_item_id text,
  erro_publicacao text,
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rascunhos_ml_produto on rascunhos_anuncio_ml(produto_id);
create index if not exists idx_rascunhos_ml_conexao on rascunhos_anuncio_ml(conexao_id);

-- Bucket público: o Mercado Livre precisa buscar a foto por URL pra montar
-- o anúncio, não dá pra usar URL assinada (diferente do bucket 'clientes').
insert into storage.buckets (id, name, public)
values ('anuncios-ml', 'anuncios-ml', true)
on conflict (id) do nothing;
