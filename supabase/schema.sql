-- ============================================================
-- TecnoCell — Schema Supabase
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================

-- Habilita UUID nativo
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABELAS DE DADOS (sincronizadas do SigeCloud)
-- ============================================================

create table if not exists depositos (
  id          text primary key,
  nome        text not null,
  empresa_id  text,
  empresa     text,
  created_at  timestamptz default now()
);

create table if not exists categorias (
  hierarquia  text primary key,
  nome        text not null,
  descricao   text
);

create table if not exists marcas (
  nome text primary key
);

create table if not exists produtos (
  id            text primary key,
  nome          text not null,
  descricao     text,
  preco         numeric(12, 2) default 0,
  preco_custo   numeric(12, 2) default 0,
  categoria     text references categorias(hierarquia) on delete set null,
  marca         text,
  modelo        text,
  unidade       text default 'UN',
  ativo         boolean default true,
  visivel_catalogo boolean default true,
  imagem_url    text,
  codigo        text,
  ean            text,
  fornecedor_id  text references pessoas(id) on delete set null,
  prateleira     text,
  estoque_minimo integer default 0,
  controla_serie boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists estoque (
  id          uuid primary key default uuid_generate_v4(),
  produto_id  text references produtos(id) on delete cascade,
  deposito_id text references depositos(id) on delete cascade,
  quantidade  numeric(12, 3) default 0,
  updated_at  timestamptz default now(),
  unique(produto_id, deposito_id)
);

-- Histórico de movimentações de estoque (audit trail)
create table if not exists movimentacoes_estoque (
  id           uuid        primary key default gen_random_uuid(),
  produto_id   text        not null,
  deposito_id  text        not null,
  operacao     text        not null check (operacao in ('entrada', 'saida', 'ajuste')),
  quantidade   integer     not null,
  qtd_anterior integer     not null default 0,
  qtd_nova     integer     not null,
  observacao   text,
  criado_por   text,
  created_at   timestamptz not null default now()
);

-- Unidades serializadas: 1 linha = 1 aparelho físico (IMEI / nº série)
create table if not exists numeros_serie (
  id          uuid primary key default uuid_generate_v4(),
  produto_id  text references produtos(id) on delete cascade,
  deposito_id text references depositos(id) on delete set null,
  serie       text not null,
  status      text default 'em_estoque',  -- em_estoque | vendido | devolvido | defeito
  custo       numeric(12, 2),
  venda_id    text,
  observacao  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(produto_id, serie)
);

create table if not exists pessoas (
  id            text primary key,
  nome          text not null,
  tipo          text check (tipo in ('cliente', 'fornecedor', 'ambos')),
  pessoa_fisica boolean default true,
  cpf_cnpj      text,
  email         text,
  telefone      text,
  cidade        text,
  estado        text,
  ultima_alteracao timestamptz,
  created_at    timestamptz default now()
);

create table if not exists lancamentos (
  id                  text primary key,
  codigo              int,
  descricao           text,
  valor               numeric(12, 2),
  data_competencia    timestamptz,
  data_vencimento     timestamptz,
  data_pagamento      timestamptz,
  tipo                text check (tipo in ('pagar', 'receber')),
  status              text,
  forma_pagamento     text,
  pessoa_nome         text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists formas_pagamento (
  id    text primary key,
  nome  text not null
);

-- ============================================================
-- CONTROLE DE SINCRONIZAÇÃO
-- ============================================================

create table if not exists sync_log (
  id          uuid primary key default uuid_generate_v4(),
  endpoint    text not null,
  status      text check (status in ('ok', 'erro', 'parcial')),
  registros   int default 0,
  mensagem    text,
  synced_at   timestamptz default now()
);

-- ============================================================
-- CHAT IA
-- ============================================================

create table if not exists chat_sessoes (
  id          uuid primary key default uuid_generate_v4(),
  tipo        text check (tipo in ('funcionario', 'cliente')) default 'cliente',
  usuario_id  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now()
);

create table if not exists chat_mensagens (
  id          uuid primary key default uuid_generate_v4(),
  sessao_id   uuid references chat_sessoes(id) on delete cascade,
  role        text check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- REALTIME — habilita as tabelas que o portal público escuta
-- ============================================================

alter publication supabase_realtime add table estoque;
alter publication supabase_realtime add table produtos;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Produtos e estoque: leitura pública, escrita apenas autenticado
alter table produtos enable row level security;
alter table estoque enable row level security;
alter table numeros_serie enable row level security;
alter table categorias enable row level security;
alter table marcas enable row level security;
alter table depositos enable row level security;
alter table pessoas enable row level security;
alter table lancamentos enable row level security;
alter table formas_pagamento enable row level security;
alter table sync_log enable row level security;
alter table chat_sessoes enable row level security;
alter table chat_mensagens enable row level security;

-- Leitura pública (anon) para catálogo
create policy "Leitura pública de produtos"
  on produtos for select to anon, authenticated using (true);

create policy "Leitura pública de estoque"
  on estoque for select to anon, authenticated using (true);

create policy "Leitura pública de categorias"
  on categorias for select to anon, authenticated using (true);

create policy "Leitura pública de marcas"
  on marcas for select to anon, authenticated using (true);

create policy "Leitura pública de depósitos"
  on depositos for select to anon, authenticated using (true);

-- Dados internos: apenas autenticados
create policy "Funcionários leem pessoas"
  on pessoas for select to authenticated using (true);

create policy "Funcionários leem lançamentos"
  on lancamentos for select to authenticated using (true);

create policy "Funcionários leem formas de pagamento"
  on formas_pagamento for select to authenticated using (true);

create policy "Funcionários leem sync_log"
  on sync_log for select to authenticated using (true);

-- Chat: usuário acessa suas próprias sessões
create policy "Usuário acessa seus chats"
  on chat_sessoes for all to authenticated
  using (usuario_id = auth.uid());

create policy "Usuário acessa suas mensagens"
  on chat_mensagens for all to authenticated
  using (sessao_id in (
    select id from chat_sessoes where usuario_id = auth.uid()
  ));

-- Service role (usado pela sync route) ignora RLS por definição
