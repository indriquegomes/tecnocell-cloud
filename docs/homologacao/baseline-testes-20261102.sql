-- Derived from reviewed READ ONLY catalogs; TEST PROJECT ONLY. No data.
-- setup
set search_path=public,extensions,pg_catalog; set check_function_bodies=off;

-- setup
create schema if not exists extensions;

-- extensions
create extension if not exists "pgcrypto" with schema "extensions";

-- extensions
create extension if not exists "unaccent" with schema "public";

-- extensions
create extension if not exists "uuid-ossp" with schema "extensions";

-- schemas
create schema if not exists "halloween_private";

-- schemas
create schema if not exists "public";

-- sequences
create sequence "public"."ordens_servico_numero_seq" as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;

-- sequences
create sequence "public"."pedidos_numero_seq" as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1 no cycle;

-- sequences
create sequence "public"."remessas_estoque_codigo_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

-- sequences
create sequence "public"."venda_numero_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

-- tables
create table "halloween_private"."audit" (
  "id" bigint generated always as identity (sequence name "halloween_private"."audit_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1) not null,
  "campaign_id" text not null,
  "action" text not null,
  "object_id" text,
  "actor" uuid,
  "created_at" timestamp with time zone default clock_timestamp() not null
);

-- tables
create table "halloween_private"."campaigns" (
  "id" text not null,
  "title" text not null,
  "active" boolean default false not null,
  "test_mode" boolean default false not null,
  "stock_confirmed" boolean default false not null,
  "secret" bytea default gen_random_bytes(32) not null,
  "last_sync_at" timestamp with time zone,
  "sync_error" text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone
);

-- tables
create table "halloween_private"."coupons" (
  "id" uuid default gen_random_uuid() not null,
  "ticket_id" uuid not null,
  "campaign_id" text not null,
  "product_id" integer not null,
  "offer" jsonb not null,
  "code" text not null,
  "created_at" timestamp with time zone default clock_timestamp() not null,
  "expires_at" timestamp with time zone not null,
  "redeemed_at" timestamp with time zone,
  "redeemed_by" uuid,
  "released_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" text
);

-- tables
create table "halloween_private"."margin_cost_audit" (
  "id" bigint generated always as identity (sequence name "halloween_private"."margin_cost_audit_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1) not null,
  "campaign_id" text not null,
  "item_id" uuid not null,
  "actor" uuid not null,
  "old_cost" numeric,
  "new_cost" numeric not null,
  "reason" text not null,
  "created_at" timestamp with time zone default clock_timestamp() not null
);

-- tables
create table "halloween_private"."margin_items" (
  "campaign_id" text not null,
  "sale_id" uuid not null,
  "item_id" uuid not null,
  "store_id" uuid not null,
  "product_id" text not null,
  "rule_id" text not null,
  "version" integer not null,
  "quantity" numeric not null,
  "revenue" numeric(14,2) not null,
  "unit_cost" numeric,
  "created_at" timestamp with time zone default clock_timestamp() not null
);

-- tables
create table "halloween_private"."margin_operations" (
  "operation_id" uuid not null,
  "payload" jsonb not null,
  "result" jsonb
);

-- tables
create table "halloween_private"."margin_rules" (
  "code" text not null,
  "rule_id" text not null,
  "percent" numeric not null,
  "version" integer default 1 not null
);

-- tables
create table "halloween_private"."margin_stores" (
  "campaign_id" text not null,
  "store_id" uuid not null,
  "total" numeric(14,2) default 0 not null,
  "pending" integer default 0 not null,
  "unlocked_at" timestamp with time zone,
  "unlocked_margin" numeric,
  "last_sync_at" timestamp with time zone
);

-- tables
create table "halloween_private"."payment_claims" (
  "campaign_id" text not null,
  "receipt_id" text not null,
  "proof_id" uuid not null
);

-- tables
create table "halloween_private"."payment_proofs" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" text not null,
  "kind" text not null,
  "source_id" uuid not null,
  "source_created_at" timestamp with time zone not null,
  "paid_at" timestamp with time zone not null,
  "origin" text not null,
  "loja_id" uuid not null,
  "customer_id" text not null,
  "amount" numeric not null,
  "receipt_ids" text[] default '{}'::text[] not null,
  "evidence" jsonb default '{}'::jsonb not null,
  "actor" uuid,
  "reason" text,
  "created_at" timestamp with time zone default clock_timestamp() not null
);

-- tables
create table "halloween_private"."products" (
  "campaign_id" text not null,
  "id" integer not null,
  "name" text not null,
  "benefit_type" text not null,
  "benefit_value" integer not null,
  "weight" integer not null,
  "quantity" integer not null,
  "remaining" integer not null,
  "unlimited" boolean default false not null,
  "enabled" boolean default true not null
);

-- tables
create table "halloween_private"."sale_windows" (
  "id" bigint generated always as identity (sequence name "halloween_private"."sale_windows_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1) not null,
  "campaign_id" text not null,
  "started_at" timestamp with time zone default clock_timestamp() not null,
  "ended_at" timestamp with time zone
);

-- tables
create table "halloween_private"."staff" (
  "user_id" uuid not null,
  "enabled" boolean default true not null
);

-- tables
create table "halloween_private"."store_prizes" (
  "campaign_id" text not null,
  "store_id" uuid not null,
  "slot" integer not null,
  "code" text,
  "name" text not null,
  "quantity" integer default 0 not null,
  "remaining" integer default 0 not null,
  "enabled" boolean default false not null
);

-- tables
create table "halloween_private"."store_reservations" (
  "coupon_id" uuid not null,
  "campaign_id" text not null,
  "store_id" uuid not null,
  "slot" integer not null,
  "released_at" timestamp with time zone
);

-- tables
create table "halloween_private"."tickets" (
  "id" uuid default gen_random_uuid() not null,
  "campaign_id" text not null,
  "purchase_ref" text not null,
  "customer" text not null,
  "amount_cents" integer not null,
  "token_hash" text not null,
  "created_at" timestamp with time zone default clock_timestamp() not null,
  "expires_at" timestamp with time zone not null,
  "created_by" uuid,
  "customer_id" text,
  "sale_id" uuid,
  "revoked_at" timestamp with time zone,
  "revoked_reason" text,
  "loja_id" uuid,
  "os_id" uuid,
  "replaces_coupon_id" uuid,
  "excluded_products" integer[] default '{}'::integer[] not null,
  "proof_id" uuid
);

-- tables
create table "public"."apelidos_cliente" (
  "id" uuid default gen_random_uuid() not null,
  "apelido" text not null,
  "cliente_id" text,
  "criado_em" timestamp with time zone default now()
);

-- tables
create table "public"."bairros_entrega" (
  "id" uuid default gen_random_uuid() not null,
  "loja_id" uuid not null,
  "nome" text not null,
  "ativo" boolean default true not null
);

-- tables
create table "public"."banco_horas" (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid not null,
  "horas" numeric not null,
  "data" date not null,
  "motivo" text,
  "obs" text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone default now() not null,
  "confirmado" boolean default true not null
);

-- tables
create table "public"."cadastros_clientes" (
  "user_id" uuid not null,
  "nome_completo" text not null,
  "usuario" text not null,
  "email" text not null,
  "rg" text,
  "cpf" text,
  "endereco" text,
  "cep" text,
  "data_nascimento" date,
  "comprovante_path" text,
  "pessoa_id" text,
  "status" text default 'pendente'::text not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."caixas" (
  "id" uuid default uuid_generate_v4() not null,
  "status" text default 'aberto'::text,
  "valor_abertura" numeric(12,2) default 0,
  "valor_fechamento" numeric(12,2),
  "obs_abertura" text,
  "obs_fechamento" text,
  "usuario_id" uuid,
  "aberto_em" timestamp with time zone default now(),
  "fechado_em" timestamp with time zone,
  "loja_id" uuid,
  "sige_caixa_id" text,
  "aberto_por" uuid
);

-- tables
create table "public"."cargos" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "permissoes" text[] default '{}'::text[],
  "is_master" boolean default false,
  "ativo" boolean default true,
  "created_at" timestamp with time zone default now(),
  "ordem" integer
);

-- tables
create table "public"."categorias" (
  "hierarquia" text not null,
  "nome" text not null,
  "descricao" text,
  "id" uuid default uuid_generate_v4()
);

-- tables
create table "public"."chat_limites" (
  "chave" text not null,
  "janela" timestamp with time zone not null,
  "chamadas" integer not null
);

-- tables
create table "public"."chat_mensagens" (
  "id" uuid default uuid_generate_v4() not null,
  "sessao_id" uuid,
  "role" text,
  "content" text not null,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."chat_sessoes" (
  "id" uuid default uuid_generate_v4() not null,
  "tipo" text default 'cliente'::text,
  "usuario_id" uuid,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."checklists_modelo" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "itens" jsonb default '[]'::jsonb not null,
  "ativo" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."comprovantes_pix" (
  "id" uuid default gen_random_uuid() not null,
  "telegram_chat_id" bigint,
  "telegram_message_id" bigint,
  "recebido_em" timestamp with time zone default now(),
  "formato" text,
  "arquivo_file_id" text,
  "arquivo_url" text,
  "valor" numeric(12,2),
  "data_pix" date,
  "pagador" text,
  "nome_digitado" text,
  "cliente_id" text,
  "status" text default 'recebido'::text,
  "extraido_raw" jsonb,
  "destinatario" text,
  "transacao_id" text,
  "cliente_sistema" text
);

-- tables
create table "public"."configuracoes" (
  "chave" text not null,
  "valor" jsonb default '{}'::jsonb
);

-- tables
create table "public"."consignados" (
  "id" text default (gen_random_uuid())::text not null,
  "pessoa_id" text,
  "pessoa_nome" text,
  "deposito_id" text,
  "observacoes" text,
  "status" text default 'aberto'::text not null,
  "total" numeric(12,2) default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."contas" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "tipo" text default 'banco'::text not null,
  "ativa" boolean default true,
  "created_at" timestamp with time zone default now(),
  "saldo_inicial" numeric default 0,
  "loja_id" uuid,
  "chave_pix" text,
  "titular" text
);

-- tables
create table "public"."convites" (
  "id" uuid default gen_random_uuid() not null,
  "token" text not null,
  "user_id" uuid not null,
  "nome" text,
  "usado" boolean default false,
  "expires_at" timestamp with time zone,
  "criado_por" uuid,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."creditos_clientes" (
  "id" uuid default gen_random_uuid() not null,
  "pessoa_id" text,
  "pessoa_nome" text not null,
  "valor" numeric(12,2) not null,
  "tipo" text not null,
  "descricao" text,
  "devolucao_id" uuid,
  "venda_id" text,
  "created_at" timestamp with time zone default now(),
  "estorna_credito_id" uuid,
  "lancamento_id" text,
  "loja_id" uuid
);

-- tables
create table "public"."depositos" (
  "id" text not null,
  "nome" text not null,
  "empresa_id" text,
  "empresa" text,
  "created_at" timestamp with time zone default now(),
  "descricao" text,
  "ativo" boolean default true,
  "responsavel" text,
  "telefone" text,
  "email" text,
  "cep" text,
  "cidade" text,
  "uf" text,
  "loja_id" uuid,
  "disponivel_app" boolean default false not null
);

-- tables
create table "public"."devolucoes" (
  "id" uuid default gen_random_uuid() not null,
  "venda_id" uuid,
  "deposito_id" text,
  "pessoa_nome" text,
  "vendedor_nome" text,
  "motivo" text,
  "valor_total" numeric(12,2) default 0 not null,
  "tipo_credito" text default 'sem_reembolso'::text,
  "status" text default 'concluida'::text,
  "created_at" timestamp with time zone default now(),
  "motivo_tipo" text,
  "caixa_id" uuid,
  "abate_fiado" numeric,
  "reembolsos" jsonb
);

-- tables
create table "public"."empresas" (
  "id" uuid default uuid_generate_v4() not null,
  "nome" text not null,
  "cnpj" text,
  "telefone" text,
  "email" text,
  "endereco" text,
  "cidade" text,
  "estado" text,
  "ativa" boolean default true,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."encomendas" (
  "id" uuid default gen_random_uuid() not null,
  "pessoa_id" text,
  "pessoa_nome" text not null,
  "produto_id" text,
  "item_nome" text not null,
  "temporario" boolean default false not null,
  "quantidade" numeric default 1 not null,
  "valor_venda" numeric,
  "custo" numeric,
  "sinal" numeric default 0 not null,
  "sinal_forma" text,
  "status" text default 'aberta'::text not null,
  "loja_id" uuid,
  "created_by" text,
  "observacoes" text,
  "created_at" timestamp with time zone default now() not null,
  "aprovado_em" timestamp with time zone
);

-- tables
create table "public"."escala_excecoes" (
  "id" uuid default gen_random_uuid() not null,
  "perfil_id" uuid not null,
  "data" date not null,
  "folga" boolean default false not null,
  "entrada" time without time zone,
  "saida" time without time zone,
  "motivo" text,
  "criado_por" uuid,
  "created_at" timestamp with time zone default now(),
  "pausa_inicio" time without time zone,
  "pausa_fim" time without time zone
);

-- tables
create table "public"."escalas" (
  "id" uuid default gen_random_uuid() not null,
  "perfil_id" uuid not null,
  "loja_id" uuid,
  "dia" smallint not null,
  "entrada" time without time zone not null,
  "saida" time without time zone not null,
  "ativo" boolean default true not null,
  "created_at" timestamp with time zone default now(),
  "pausa_inicio" time without time zone,
  "pausa_fim" time without time zone
);

-- tables
create table "public"."estoque" (
  "id" uuid default uuid_generate_v4() not null,
  "produto_id" text,
  "deposito_id" text,
  "quantidade" numeric(12,3) default 0,
  "updated_at" timestamp with time zone default now()
);

-- tables
create table "public"."faixas_promocao" (
  "id" uuid default gen_random_uuid() not null,
  "promocao_id" uuid not null,
  "quantidade_minima" integer not null,
  "preco" numeric(12,2) not null,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."feriados" (
  "id" uuid default gen_random_uuid() not null,
  "cidade" text not null,
  "data" date not null,
  "nome" text not null,
  "tipo" text default 'municipal'::text not null,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."forma_conta_loja" (
  "forma_id" text not null,
  "loja_id" uuid not null,
  "conta_id" uuid not null
);

-- tables
create table "public"."formas_pagamento" (
  "id" text not null,
  "nome" text not null,
  "ativo" boolean default true,
  "tipo" text,
  "maquina_id" uuid,
  "prazo_recebimento" text default 'a_vista'::text,
  "conta_destino_id" uuid,
  "loja_id" uuid
);

-- tables
create table "public"."historico_itens_venda" (
  "id" uuid default gen_random_uuid() not null,
  "produto_id" text not null,
  "data" date not null,
  "quantidade" numeric default 0 not null,
  "origem" text default 'sige'::text not null,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."historico_vendas" (
  "sige_id" text not null,
  "codigo" bigint,
  "data" timestamp with time zone,
  "data_faturamento" timestamp with time zone,
  "loja" text,
  "status" text,
  "vendedor" text,
  "categoria" text,
  "origem" text,
  "cliente" text,
  "cidade" text,
  "estado" text,
  "frete" numeric default 0,
  "desconto" numeric default 0,
  "comissao" numeric default 0,
  "valor_final" numeric default 0,
  "pdv" numeric default 0,
  "ecommerce" numeric default 0,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."integracoes_mercado_livre" (
  "id" uuid default gen_random_uuid() not null,
  "ml_user_id" text not null,
  "ml_nickname" text,
  "access_token" text not null,
  "refresh_token" text not null,
  "expira_em" timestamp with time zone not null,
  "conectado_por" text,
  "conectado_em" timestamp with time zone default now() not null,
  "atualizado_em" timestamp with time zone default now() not null,
  "nome_loja" text
);

-- tables
create table "public"."integracoes_mercado_livre_anuncios" (
  "id" uuid default gen_random_uuid() not null,
  "ml_item_id" text not null,
  "produto_id" text,
  "titulo_ml" text not null,
  "preco_ml" numeric(12,2),
  "criado_em" timestamp with time zone default now() not null,
  "atualizado_em" timestamp with time zone default now() not null,
  "is_catalogo" boolean default false not null,
  "catalog_product_id" text,
  "conexao_id" uuid,
  "sku" text
);

-- tables
create table "public"."integracoes_mercado_livre_mensagens" (
  "id" uuid default gen_random_uuid() not null,
  "ml_message_id" text not null,
  "ml_pack_id" text not null,
  "ml_order_id" text,
  "autor" text not null,
  "texto" text not null,
  "lida" boolean default false not null,
  "criado_em" timestamp with time zone default now() not null,
  "conexao_id" uuid
);

-- tables
create table "public"."integracoes_mercado_livre_pedidos_pendentes" (
  "id" uuid default gen_random_uuid() not null,
  "ml_order_id" text not null,
  "motivo" text not null,
  "payload" jsonb not null,
  "resolvido" boolean default false not null,
  "criado_em" timestamp with time zone default now() not null,
  "conexao_id" uuid
);

-- tables
create table "public"."integracoes_mercado_livre_perguntas" (
  "id" uuid default gen_random_uuid() not null,
  "ml_question_id" text not null,
  "ml_item_id" text not null,
  "texto" text not null,
  "respondida" boolean default false not null,
  "resposta_texto" text,
  "criado_em" timestamp with time zone default now() not null,
  "respondida_em" timestamp with time zone,
  "conexao_id" uuid
);

-- tables
create table "public"."itens_consignado" (
  "id" text default (gen_random_uuid())::text not null,
  "consignado_id" text not null,
  "produto_id" text,
  "nome" text not null,
  "codigo" text,
  "quantidade" numeric(12,3) default 1 not null,
  "preco_unitario" numeric(12,2) default 0 not null,
  "devolvido" numeric(12,3) default 0 not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."itens_devolucao" (
  "id" uuid default gen_random_uuid() not null,
  "devolucao_id" uuid,
  "produto_id" text,
  "nome" text not null,
  "quantidade" numeric(12,3) default 1 not null,
  "preco_unitario" numeric(12,2) default 0 not null,
  "total_item" numeric(12,2) default 0 not null,
  "status_produto" text default 'ok'::text
);

-- tables
create table "public"."itens_nota_entrada" (
  "id" uuid default uuid_generate_v4() not null,
  "nota_id" uuid,
  "produto_id" text,
  "quantidade" numeric(12,3) default 1,
  "preco_unitario" numeric(12,2) default 0,
  "total_item" numeric(12,2) default 0,
  "deposito_id" text,
  "series" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."itens_os" (
  "id" uuid default uuid_generate_v4() not null,
  "os_id" uuid,
  "tipo" text default 'peca'::text,
  "produto_id" text,
  "nome" text not null,
  "quantidade" numeric(12,3) default 1,
  "preco_unitario" numeric(12,2) default 0,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."itens_pedido" (
  "id" uuid default uuid_generate_v4() not null,
  "pedido_id" uuid,
  "produto_id" text,
  "quantidade" numeric(12,3) default 1,
  "preco_unitario" numeric(12,2) default 0,
  "total_item" numeric(12,2) default 0,
  "nome" text
);

-- tables
create table "public"."itens_promocao" (
  "id" uuid default gen_random_uuid() not null,
  "promocao_id" uuid not null,
  "produto_id" text not null,
  "preco_promocional" numeric(10,2),
  "quantidade_x" integer,
  "quantidade_y" integer
);

-- tables
create table "public"."itens_tabela_preco" (
  "id" uuid default uuid_generate_v4() not null,
  "tabela_id" uuid,
  "produto_id" text,
  "preco" numeric(10,2) not null,
  "created_at" timestamp with time zone default now(),
  "quantidade_minima" integer default 1
);

-- tables
create table "public"."itens_venda" (
  "id" uuid default gen_random_uuid() not null,
  "venda_id" uuid,
  "produto_id" text,
  "quantidade" integer not null,
  "preco_unitario" numeric(10,2) not null,
  "desconto_item" numeric(10,2) default 0,
  "total_item" numeric(10,2) not null,
  "nome" text
);

-- tables
create table "public"."lancamentos" (
  "id" text default gen_random_uuid() not null,
  "codigo" integer,
  "descricao" text,
  "valor" numeric(12,2),
  "data_competencia" timestamp with time zone,
  "data_vencimento" timestamp with time zone,
  "data_pagamento" timestamp with time zone,
  "tipo" text,
  "status" text,
  "forma_pagamento" text,
  "pessoa_nome" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "venda_id" uuid,
  "valor_pago" numeric(12,2) default 0,
  "historico_pagamentos" jsonb default '[]'::jsonb,
  "conta_id" uuid,
  "categoria" text,
  "pessoa_id" text,
  "loja_id" uuid,
  "comprovante_url" text,
  "devolucao_id" uuid,
  "subcategoria" text
);

-- tables
create table "public"."lembretes" (
  "id" uuid default gen_random_uuid() not null,
  "titulo" text not null,
  "descricao" text,
  "perfil_id" uuid,
  "cargo_id" uuid,
  "hora" time without time zone not null,
  "dias" smallint[] default '{1,2,3,4,5,6}'::smallint[] not null,
  "ativo" boolean default true not null,
  "criado_por" uuid,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "tipo" text default 'rotina'::text not null,
  "valor" numeric,
  "chave_pix" text
);

-- tables
create table "public"."lembretes_feitos" (
  "id" uuid default gen_random_uuid() not null,
  "lembrete_id" uuid not null,
  "data" date not null,
  "perfil_id" uuid,
  "feito_em" timestamp with time zone default now(),
  "comprovante_url" text
);

-- tables
create table "public"."logs_atividade" (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid,
  "usuario_email" text,
  "tipo_acao" text not null,
  "contexto" jsonb default '{}'::jsonb not null,
  "url" text,
  "origem" text default 'server'::text not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."lojas" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "cnpj" text,
  "telefone" text,
  "endereco" text,
  "cidade" text,
  "uf" text,
  "ativa" boolean default true,
  "created_at" timestamp with time zone default now(),
  "razao_social" text,
  "inscricao_estadual" text,
  "cep" text,
  "numero" text,
  "bairro" text,
  "deposito_padrao_id" text,
  "conta_padrao_id" uuid,
  "tabela_padrao_id" uuid,
  "email" text,
  "whatsapp" text,
  "inscricao_municipal" text,
  "complemento" text,
  "matriz_id" uuid,
  "senha_desconto" text,
  "prazo_troca_dias" integer,
  "termos_venda" text,
  "informativo_os" text,
  "logo_url" text,
  "pedidos_app_auto_credito" boolean default false not null
);

-- tables
create table "public"."maquinas_cartao" (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "taxa_debito" numeric(6,2) default 0,
  "taxas_credito" jsonb default '[]'::jsonb,
  "max_parcelas" integer default 1,
  "ativo" boolean default true,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."marcas" (
  "nome" text not null
);

-- tables
create table "public"."metas" (
  "id" uuid default gen_random_uuid() not null,
  "loja_id" text,
  "rotulo" text not null,
  "data_inicio" date not null,
  "data_fim" date not null,
  "dias_uteis" integer default 26 not null,
  "ativo" boolean default true not null,
  "created_at" timestamp with time zone default now(),
  "pessoas" integer default 4 not null
);

-- tables
create table "public"."metas_faixas" (
  "id" uuid default gen_random_uuid() not null,
  "meta_id" uuid not null,
  "nome" text not null,
  "valor" numeric default 0 not null,
  "premio" numeric default 0 not null,
  "ordem" integer default 0 not null
);

-- tables
create table "public"."movimentacoes_estoque" (
  "id" uuid default gen_random_uuid() not null,
  "produto_id" text not null,
  "deposito_id" text not null,
  "operacao" text not null,
  "quantidade" integer not null,
  "qtd_anterior" integer default 0 not null,
  "qtd_nova" integer not null,
  "observacao" text,
  "criado_por" text,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."movimentos_caixa" (
  "id" uuid default gen_random_uuid() not null,
  "caixa_id" uuid,
  "tipo" text not null,
  "motivo" text,
  "forma_pagamento" text default 'Dinheiro'::text not null,
  "valor" numeric(10,2) not null,
  "created_at" timestamp with time zone default now(),
  "lancamento_id" text,
  "origem" text
);

-- tables
create table "public"."notas_entrada" (
  "id" uuid default uuid_generate_v4() not null,
  "numero" text,
  "fornecedor_id" text,
  "data_emissao" date,
  "data_entrada" date default CURRENT_DATE,
  "valor_total" numeric(12,2) default 0,
  "status" text default 'pendente'::text,
  "observacoes" text,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."numeros_serie" (
  "id" uuid default uuid_generate_v4() not null,
  "produto_id" text,
  "deposito_id" text,
  "serie" text not null,
  "status" text default 'em_estoque'::text,
  "custo" numeric(12,2),
  "venda_id" text,
  "observacao" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);

-- tables
create table "public"."ordens_servico" (
  "id" uuid default uuid_generate_v4() not null,
  "numero" integer default nextval('ordens_servico_numero_seq'::regclass) not null,
  "pessoa_id" text,
  "pessoa_nome" text,
  "equipamento" text not null,
  "marca" text,
  "modelo" text,
  "serial_imei" text,
  "defeito_relatado" text not null,
  "diagnostico" text,
  "status" text default 'aberta'::text not null,
  "tecnico_nome" text,
  "total_pecas" numeric(12,2) default 0,
  "total_mao_obra" numeric(12,2) default 0,
  "total" numeric(12,2) default 0,
  "observacoes" text,
  "deposito_id" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "previsao_entrega" timestamp with time zone,
  "custo" numeric default 0 not null,
  "recebido_em" timestamp with time zone,
  "forma_recebimento" text
);

-- tables
create table "public"."os_checklists" (
  "id" uuid default gen_random_uuid() not null,
  "os_id" uuid not null,
  "nome" text not null,
  "itens" jsonb default '[]'::jsonb not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."pagamentos_venda" (
  "id" uuid default uuid_generate_v4() not null,
  "venda_id" uuid not null,
  "forma_pagamento_id" text,
  "valor" numeric(12,2) not null,
  "taxa" numeric(12,2) default 0 not null,
  "maquina" text,
  "parcelas" integer default 1 not null,
  "status" text default 'pago'::text not null,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."pedidos" (
  "id" uuid default gen_random_uuid() not null,
  "numero" integer default nextval('pedidos_numero_seq'::regclass) not null,
  "tipo" text default 'orcamento'::text,
  "status" text default 'rascunho'::text,
  "pessoa_id" text,
  "total" numeric(12,2) default 0,
  "desconto" numeric(12,2) default 0,
  "observacoes" text,
  "data_validade" date,
  "created_at" timestamp with time zone default now(),
  "deposito_id" text,
  "tabela_preco_id" text,
  "forma_pagamento_id" text,
  "vendedor_id" uuid,
  "vendedor_nome" text,
  "origem" text default 'balcao'::text,
  "frete" numeric(10,2) default 0,
  "referencia_cliente" text,
  "termos_condicoes" text,
  "motivo_cancelamento" text
);

-- tables
create table "public"."pedidos_app" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "pessoa_id" text,
  "chave_envio" text not null,
  "status" text default 'pendente'::text not null,
  "forma_entrega" text default 'retirada'::text not null,
  "status_pagamento" text default 'pendente'::text not null,
  "itens" jsonb not null,
  "total" numeric(12,2) not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."pedidos_app_atendimentos" (
  "pedido_id" uuid not null,
  "unidade" text not null,
  "confirmado_em" timestamp with time zone default now(),
  "encaminhado_em" timestamp with time zone,
  "venda_id" uuid
);

-- tables
create table "public"."pedidos_app_credito_fila" (
  "pedido_id" uuid not null,
  "unidade" text not null,
  "caixa_id" uuid,
  "estado" text default 'pendente'::text not null,
  "motivo" text,
  "automatico" boolean default false not null,
  "tentativas" integer default 0 not null,
  "proxima_tentativa" timestamp with time zone default now() not null,
  "criado_em" timestamp with time zone default now() not null,
  "atualizado_em" timestamp with time zone default now() not null
);

-- tables
create table "public"."pedidos_app_operacao" (
  "pedido_id" uuid not null,
  "unidade" text not null,
  "responsavel_id" uuid,
  "responsavel_em" timestamp with time zone,
  "solicitacoes_impressao" integer default 0 not null,
  "versao" integer default 0 not null,
  "separado_em" timestamp with time zone,
  "entregue_em" timestamp with time zone,
  "papel_confirmado_em" timestamp with time zone
);

-- tables
create table "public"."pedidos_app_operacao_eventos" (
  "id" bigint generated always as identity (sequence name "public"."pedidos_app_operacao_eventos_id_seq" start with 1 increment by 1 minvalue 1 maxvalue 9223372036854775807 cache 1) not null,
  "pedido_id" uuid not null,
  "unidade" text not null,
  "operador_id" uuid not null,
  "versao" integer not null,
  "criado_em" timestamp with time zone default now() not null,
  "tipo" text not null
);

-- tables
create table "public"."pedidos_app_unidades" (
  "unidade" text not null,
  "loja_id" uuid not null
);

-- tables
create table "public"."perfis" (
  "id" uuid not null,
  "nome" text not null,
  "cargo" text default 'vendedor'::text not null,
  "permissoes" text[] default '{}'::text[],
  "ativo" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "is_master" boolean default false,
  "cargo_id" uuid,
  "lojas_permitidas" uuid[],
  "pdv_loja_id" uuid,
  "pdv_deposito_id" text,
  "caixa_numero" integer,
  "acesso_hora_inicio" text,
  "acesso_hora_fim" text,
  "acesso_bloqueia_sabado" boolean default false,
  "acesso_bloqueia_domingo" boolean default false,
  "acesso_bloqueia_feriado" boolean default false,
  "meta_venda_mensal" numeric default 0,
  "tabelas_permitidas" uuid[],
  "avatar_url" text,
  "cor_escala" text,
  "salario" numeric(12,2) default 0,
  "chave_pix" text,
  "username" text,
  "motoboy_valor_fixo" numeric(12,2),
  "motoboy_adicional_loja" numeric(12,2),
  "motoboy_adicional_extra" numeric(12,2),
  "motoboy_tipo" text default 'variavel'::text,
  "vinculo" text,
  "mei_valor_servico" numeric(12,2),
  "mei_dia_pagamento" text,
  "mei_funcoes" text,
  "clt_vale_transporte" numeric(12,2),
  "freelancer" boolean default false,
  "freelancer_valor_hora" numeric(12,2),
  "login_bloqueado" boolean default false not null,
  "data_admissao" date,
  "data_demissao" date,
  "data_contrato_inicio" date,
  "data_contrato_fim" date,
  "pin_ponto" text default '1234'::text not null
);

-- tables
create table "public"."pessoas" (
  "id" text default gen_random_uuid() not null,
  "nome" text not null,
  "tipo" text,
  "pessoa_fisica" boolean default true,
  "cpf_cnpj" text,
  "email" text,
  "telefone" text,
  "cidade" text,
  "estado" text,
  "ultima_alteracao" timestamp with time zone,
  "created_at" timestamp with time zone default now(),
  "endereco" text,
  "bairro" text,
  "cep" text,
  "limite_credito" numeric(12,2) default 0,
  "tabela_preco_id" uuid,
  "ativo" boolean default true,
  "nome_fantasia" text,
  "data_nascimento" date,
  "celular" text,
  "numero" text,
  "complemento" text,
  "observacoes" text,
  "rg" text,
  "origem" text,
  "vendedor_id" uuid,
  "nome_norm" text,
  "rotina_pagamento" text,
  "nao_vender" boolean default false,
  "nao_vender_motivo" text,
  "foto_url" text,
  "permite_fiado" boolean default false not null,
  "chave_pix" text,
  "tipo_chave_pix" text,
  "formas_pagamento" text[] default '{}'::text[],
  "forma_padrao" text,
  "obs_cobranca" text
);

-- tables
create table "public"."pix_aliases" (
  "id" uuid default gen_random_uuid() not null,
  "telegram_chat_id" bigint not null,
  "pagador_norm" text not null,
  "pagador" text not null,
  "cliente" text not null,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."pix_periodos" (
  "id" text not null,
  "telegram_chat_id" bigint not null,
  "aberto_em" timestamp with time zone default now() not null,
  "fechado_em" timestamp with time zone,
  "aberto_por" text,
  "fechado_por" text,
  "reenvio_ativo" boolean default false not null,
  "reenvio_cursor" integer default 0 not null
);

-- tables
create table "public"."pontos" (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid not null,
  "tipo" text not null,
  "loja_id" text,
  "criado_em" timestamp with time zone default now() not null,
  "pago_em" timestamp with time zone,
  "dobra_tipo" text,
  "dobra_data" date
);

-- tables
create table "public"."produtos" (
  "id" text default gen_random_uuid() not null,
  "nome" text not null,
  "descricao" text,
  "preco" numeric(12,2) default 0,
  "preco_custo" numeric(12,2) default 0,
  "categoria" text,
  "marca" text,
  "ativo" boolean default true,
  "visivel_catalogo" boolean default true,
  "imagem_url" text,
  "codigo" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "ean" text,
  "fornecedor_id" text,
  "prateleira" text,
  "estoque_minimo" integer default 0,
  "controla_serie" boolean default false,
  "modelo" text,
  "unidade" text default 'UN'::text,
  "preco_minimo" numeric,
  "busca_norm" text,
  "permite_estoque_negativo" boolean default false,
  "servico" boolean default false not null
);

-- tables
create table "public"."promocao_tabelas" (
  "promocao_id" uuid not null,
  "tabela_id" uuid not null
);

-- tables
create table "public"."promocoes" (
  "id" uuid default uuid_generate_v4() not null,
  "nome" text not null,
  "tipo" text default 'percentual'::text,
  "valor" numeric(12,2) default 0,
  "data_inicio" date,
  "data_fim" date,
  "ativa" boolean default true,
  "descricao" text,
  "created_at" timestamp with time zone default now(),
  "quantidade_x" integer,
  "quantidade_y" integer,
  "categoria" text
);

-- tables
create table "public"."rascunhos_anuncio_ml" (
  "id" uuid default gen_random_uuid() not null,
  "produto_id" text not null,
  "conexao_id" uuid not null,
  "categoria_ml_id" text,
  "categoria_ml_nome" text,
  "titulo" text,
  "atributos" jsonb default '{}'::jsonb not null,
  "fotos" jsonb default '[]'::jsonb not null,
  "preco" numeric,
  "status" text default 'rascunho'::text not null,
  "ml_item_id" text,
  "erro_publicacao" text,
  "criado_por" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "listing_type_id" text,
  "condicao" text default 'new'::text not null
);

-- tables
create table "public"."recebimentos_lote_operacoes" (
  "id" uuid not null,
  "pedido" jsonb not null,
  "resultado" jsonb,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."reclassificacoes_forma" (
  "id" uuid default gen_random_uuid() not null,
  "venda_id" uuid,
  "pagamento_id" uuid,
  "forma_original" text,
  "forma_nova" text,
  "valor" numeric(12,2) not null,
  "motivo" text,
  "usuario_id" uuid,
  "created_at" timestamp with time zone default now(),
  "revertida_em" timestamp with time zone,
  "revertido_por" uuid,
  "lancamento_id" text
);

-- tables
create table "public"."remessas_estoque" (
  "id" uuid default gen_random_uuid() not null,
  "origem" text not null,
  "destino" text not null,
  "status" text default 'em_transito'::text not null,
  "observacao" text,
  "criado_por" text,
  "recebida_por" text,
  "created_at" timestamp with time zone default now(),
  "recebida_em" timestamp with time zone,
  "codigo" text default ('TED'::text || (nextval('remessas_estoque_codigo_seq'::regclass))::text) not null,
  "cancelada_em" timestamp with time zone,
  "cancelada_por" text,
  "motivo_cancelamento" text
);

-- tables
create table "public"."remessas_estoque_itens" (
  "id" uuid default gen_random_uuid() not null,
  "remessa_id" uuid not null,
  "produto_id" text not null,
  "nome" text not null,
  "quantidade" numeric(12,3) not null,
  "custo_unitario" numeric(12,2) default 0,
  "series" jsonb default '[]'::jsonb
);

-- tables
create table "public"."sync_log" (
  "id" uuid default uuid_generate_v4() not null,
  "endpoint" text not null,
  "status" text,
  "registros" integer default 0,
  "mensagem" text,
  "synced_at" timestamp with time zone default now()
);

-- tables
create table "public"."tabelas_preco" (
  "id" uuid default uuid_generate_v4() not null,
  "nome" text not null,
  "descricao" text,
  "ativa" boolean default true,
  "created_at" timestamp with time zone default now(),
  "data_inicio" date,
  "data_fim" date,
  "usa_preco_custo" boolean default false not null
);

-- tables
create table "public"."transferencias" (
  "id" uuid default gen_random_uuid() not null,
  "conta_origem_id" uuid not null,
  "conta_destino_id" uuid not null,
  "valor" numeric not null,
  "data" date default CURRENT_DATE not null,
  "observacao" text,
  "created_at" timestamp with time zone default now() not null
);

-- tables
create table "public"."trocas_sp" (
  "id" uuid default gen_random_uuid() not null,
  "item" text not null,
  "fornecedor" text not null,
  "quantidade" integer default 1 not null,
  "valor" numeric(10,2) default 0 not null,
  "loja_id" uuid,
  "status" text default 'enviado'::text not null,
  "observacao" text,
  "criado_por" uuid,
  "created_at" timestamp with time zone default now(),
  "resolvido_em" timestamp with time zone
);

-- tables
create table "public"."vales_credito" (
  "id" uuid default uuid_generate_v4() not null,
  "pessoa_id" text,
  "valor" numeric(12,2) default 0,
  "saldo" numeric(12,2) default 0,
  "motivo" text,
  "status" text default 'ativo'::text,
  "created_at" timestamp with time zone default now()
);

-- tables
create table "public"."vendas" (
  "id" uuid default gen_random_uuid() not null,
  "data" timestamp with time zone default now(),
  "total" numeric(10,2) default 0 not null,
  "desconto" numeric(10,2) default 0,
  "forma_pagamento_id" text,
  "pessoa_id" text,
  "status" text default 'concluida'::text,
  "observacoes" text,
  "created_at" timestamp with time zone default now(),
  "numero" integer,
  "vendedor_id" uuid,
  "vendedor_nome" text,
  "deposito_id" text,
  "caixa_id" uuid,
  "motivo_cancelamento" text,
  "ml_order_id" text,
  "ml_conexao_id" uuid,
  "tipo_entrega" text default 'retirada'::text,
  "endereco_entrega" text,
  "rota_entrega" text,
  "horario_entrega" text,
  "entregue_em" timestamp with time zone,
  "entregue_por" text,
  "uso_interno" boolean default false not null
);

-- sequences_ownership
alter sequence "public"."ordens_servico_numero_seq" owned by ordens_servico."numero";

-- sequences_ownership
alter sequence "public"."pedidos_numero_seq" owned by pedidos."numero";

-- constraints
alter table "halloween_private"."audit" add constraint "audit_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."campaigns" add constraint "campaigns_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_check" CHECK (redeemed_at IS NULL OR released_at IS NULL);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_code_key" UNIQUE (code);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_ticket_id_key" UNIQUE (ticket_id);

-- constraints
alter table "halloween_private"."margin_cost_audit" add constraint "margin_cost_audit_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_pkey" PRIMARY KEY (campaign_id, item_id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_quantity_check" CHECK (quantity > 0::numeric);

-- constraints
alter table "halloween_private"."margin_operations" add constraint "margin_operations_pkey" PRIMARY KEY (operation_id);

-- constraints
alter table "halloween_private"."margin_rules" add constraint "margin_rules_pkey" PRIMARY KEY (code);

-- constraints
alter table "halloween_private"."margin_rules" add constraint "margin_rules_rule_id_key" UNIQUE (rule_id);

-- constraints
alter table "halloween_private"."margin_stores" add constraint "margin_stores_pkey" PRIMARY KEY (campaign_id, store_id);

-- constraints
alter table "halloween_private"."payment_claims" add constraint "payment_claims_pkey" PRIMARY KEY (campaign_id, receipt_id);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_amount_check" CHECK (amount >= 200::numeric);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_campaign_id_kind_source_id_key" UNIQUE (campaign_id, kind, source_id);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_check" CHECK (paid_at >= source_created_at);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_check1" CHECK (origin = 'auto'::text OR actor IS NOT NULL AND length(btrim(reason)) >= 5 AND length(btrim(reason)) <= 300);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_kind_check" CHECK (kind = ANY (ARRAY['sale'::text, 'os'::text]));

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_origin_check" CHECK (origin = ANY (ARRAY['auto'::text, 'manual_time'::text, 'manual_os'::text]));

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."products" add constraint "products_benefit_type_check" CHECK (benefit_type = ANY (ARRAY['percent'::text, 'price'::text]));

-- constraints
alter table "halloween_private"."products" add constraint "products_benefit_value_check" CHECK (benefit_value > 0);

-- constraints
alter table "halloween_private"."products" add constraint "products_check" CHECK (remaining >= 0 AND remaining <= quantity);

-- constraints
alter table "halloween_private"."products" add constraint "products_check1" CHECK (benefit_type <> 'percent'::text OR benefit_value <= 100);

-- constraints
alter table "halloween_private"."products" add constraint "products_pkey" PRIMARY KEY (campaign_id, id);

-- constraints
alter table "halloween_private"."products" add constraint "products_quantity_check" CHECK (quantity >= 0);

-- constraints
alter table "halloween_private"."products" add constraint "products_weight_check" CHECK (weight >= 0 AND weight <= 10000);

-- constraints
alter table "halloween_private"."sale_windows" add constraint "sale_windows_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."staff" add constraint "staff_pkey" PRIMARY KEY (user_id);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_check" CHECK (remaining >= 0 AND remaining <= quantity);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_pkey" PRIMARY KEY (campaign_id, store_id, slot);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_quantity_check" CHECK (quantity >= 0);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_slot_check" CHECK (slot = ANY (ARRAY[12, 13]));

-- constraints
alter table "halloween_private"."store_reservations" add constraint "store_reservations_pkey" PRIMARY KEY (coupon_id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_amount_cents_check" CHECK (amount_cents >= 20000);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_campaign_id_purchase_ref_key" UNIQUE (campaign_id, purchase_ref);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_customer_check" CHECK (length(customer) >= 1 AND length(customer) <= 80);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_purchase_ref_check" CHECK (length(purchase_ref) >= 1 AND length(purchase_ref) <= 100);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_replaces_coupon_id_key" UNIQUE (replaces_coupon_id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_token_hash_key" UNIQUE (token_hash);

-- constraints
alter table "public"."apelidos_cliente" add constraint "apelidos_cliente_apelido_key" UNIQUE (apelido);

-- constraints
alter table "public"."apelidos_cliente" add constraint "apelidos_cliente_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."bairros_entrega" add constraint "bairros_entrega_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."banco_horas" add constraint "banco_horas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_pkey" PRIMARY KEY (user_id);

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_status_check" CHECK (status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'bloqueado'::text]));

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_usuario_check" CHECK (usuario ~ '^[a-z0-9._]{3,24}$'::text);

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_usuario_key" UNIQUE (usuario);

-- constraints
alter table "public"."caixas" add constraint "caixas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."caixas" add constraint "caixas_status_check" CHECK (status = ANY (ARRAY['aberto'::text, 'fechado'::text]));

-- constraints
alter table "public"."cargos" add constraint "cargos_nome_key" UNIQUE (nome);

-- constraints
alter table "public"."cargos" add constraint "cargos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."categorias" add constraint "categorias_pkey" PRIMARY KEY (hierarquia);

-- constraints
alter table "public"."chat_limites" add constraint "chat_limites_pkey" PRIMARY KEY (chave);

-- constraints
alter table "public"."chat_mensagens" add constraint "chat_mensagens_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."chat_mensagens" add constraint "chat_mensagens_role_check" CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text]));

-- constraints
alter table "public"."chat_sessoes" add constraint "chat_sessoes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."chat_sessoes" add constraint "chat_sessoes_tipo_check" CHECK (tipo = ANY (ARRAY['funcionario'::text, 'cliente'::text]));

-- constraints
alter table "public"."checklists_modelo" add constraint "checklists_modelo_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."comprovantes_pix" add constraint "comprovantes_pix_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."comprovantes_pix" add constraint "comprovantes_pix_telegram_chat_id_telegram_message_id_key" UNIQUE (telegram_chat_id, telegram_message_id);

-- constraints
alter table "public"."configuracoes" add constraint "configuracoes_pkey" PRIMARY KEY (chave);

-- constraints
alter table "public"."consignados" add constraint "consignados_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."contas" add constraint "contas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."convites" add constraint "convites_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."convites" add constraint "convites_token_key" UNIQUE (token);

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_tipo_check" CHECK (tipo = ANY (ARRAY['credito'::text, 'uso'::text, 'estorno'::text]));

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_valor_check" CHECK (valor > 0::numeric);

-- constraints
alter table "public"."depositos" add constraint "depositos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."devolucoes" add constraint "devolucoes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."empresas" add constraint "empresas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."encomendas" add constraint "encomendas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."escala_excecoes" add constraint "escala_excecoes_perfil_id_data_key" UNIQUE (perfil_id, data);

-- constraints
alter table "public"."escala_excecoes" add constraint "escala_excecoes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."escalas" add constraint "escalas_dia_check" CHECK (dia >= 0 AND dia <= 6);

-- constraints
alter table "public"."escalas" add constraint "escalas_perfil_id_dia_key" UNIQUE (perfil_id, dia);

-- constraints
alter table "public"."escalas" add constraint "escalas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."estoque" add constraint "estoque_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."estoque" add constraint "estoque_produto_id_deposito_id_key" UNIQUE (produto_id, deposito_id);

-- constraints
alter table "public"."faixas_promocao" add constraint "faixas_promocao_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."faixas_promocao" add constraint "faixas_promocao_preco_check" CHECK (preco >= 0::numeric);

-- constraints
alter table "public"."faixas_promocao" add constraint "faixas_promocao_promocao_id_quantidade_minima_key" UNIQUE (promocao_id, quantidade_minima);

-- constraints
alter table "public"."faixas_promocao" add constraint "faixas_promocao_quantidade_minima_check" CHECK (quantidade_minima >= 1);

-- constraints
alter table "public"."feriados" add constraint "feriados_cidade_data_key" UNIQUE (cidade, data);

-- constraints
alter table "public"."feriados" add constraint "feriados_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."forma_conta_loja" add constraint "forma_conta_loja_pkey" PRIMARY KEY (forma_id, loja_id);

-- constraints
alter table "public"."formas_pagamento" add constraint "formas_pagamento_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."historico_itens_venda" add constraint "historico_itens_venda_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."historico_itens_venda" add constraint "historico_itens_venda_produto_id_data_origem_key" UNIQUE (produto_id, data, origem);

-- constraints
alter table "public"."historico_vendas" add constraint "historico_vendas_pkey" PRIMARY KEY (sige_id);

-- constraints
alter table "public"."integracoes_mercado_livre" add constraint "integracoes_mercado_livre_ml_user_id_key" UNIQUE (ml_user_id);

-- constraints
alter table "public"."integracoes_mercado_livre" add constraint "integracoes_mercado_livre_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."integracoes_mercado_livre_anuncios" add constraint "integracoes_mercado_livre_anuncios_ml_item_id_key" UNIQUE (ml_item_id);

-- constraints
alter table "public"."integracoes_mercado_livre_anuncios" add constraint "integracoes_mercado_livre_anuncios_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."integracoes_mercado_livre_mensagens" add constraint "integracoes_mercado_livre_mensagens_ml_message_id_key" UNIQUE (ml_message_id);

-- constraints
alter table "public"."integracoes_mercado_livre_mensagens" add constraint "integracoes_mercado_livre_mensagens_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."integracoes_mercado_livre_pedidos_pendentes" add constraint "integracoes_mercado_livre_pedidos_pendentes_ml_order_id_key" UNIQUE (ml_order_id);

-- constraints
alter table "public"."integracoes_mercado_livre_pedidos_pendentes" add constraint "integracoes_mercado_livre_pedidos_pendentes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."integracoes_mercado_livre_perguntas" add constraint "integracoes_mercado_livre_perguntas_ml_question_id_key" UNIQUE (ml_question_id);

-- constraints
alter table "public"."integracoes_mercado_livre_perguntas" add constraint "integracoes_mercado_livre_perguntas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_consignado" add constraint "itens_consignado_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_devolucao" add constraint "itens_devolucao_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_nota_entrada" add constraint "itens_nota_entrada_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_os" add constraint "itens_os_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_os" add constraint "itens_os_tipo_check" CHECK (tipo = ANY (ARRAY['peca'::text, 'servico'::text]));

-- constraints
alter table "public"."itens_pedido" add constraint "itens_pedido_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_promocao" add constraint "itens_promocao_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_tabela_preco" add constraint "itens_tabela_preco_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."itens_venda" add constraint "itens_venda_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."lancamentos" add constraint "lancamentos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."lancamentos" add constraint "lancamentos_tipo_check" CHECK (tipo = ANY (ARRAY['pagar'::text, 'receber'::text]));

-- constraints
alter table "public"."lembretes" add constraint "lembretes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."lembretes_feitos" add constraint "lembretes_feitos_lembrete_id_data_key" UNIQUE (lembrete_id, data);

-- constraints
alter table "public"."lembretes_feitos" add constraint "lembretes_feitos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."logs_atividade" add constraint "logs_atividade_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."lojas" add constraint "lojas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."maquinas_cartao" add constraint "maquinas_cartao_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."marcas" add constraint "marcas_pkey" PRIMARY KEY (nome);

-- constraints
alter table "public"."metas" add constraint "metas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."metas_faixas" add constraint "metas_faixas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."movimentacoes_estoque" add constraint "movimentacoes_estoque_operacao_check" CHECK (operacao = ANY (ARRAY['entrada'::text, 'saida'::text, 'ajuste'::text, 'perda'::text, 'uso_interno'::text]));

-- constraints
alter table "public"."movimentacoes_estoque" add constraint "movimentacoes_estoque_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."movimentos_caixa" add constraint "movimentos_caixa_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."movimentos_caixa" add constraint "movimentos_caixa_tipo_check" CHECK (tipo = ANY (ARRAY['reforco'::text, 'retirada'::text, 'recebimento'::text, 'devolucao'::text]));

-- constraints
alter table "public"."movimentos_caixa" add constraint "movimentos_caixa_valor_check" CHECK (valor > 0::numeric);

-- constraints
alter table "public"."notas_entrada" add constraint "notas_entrada_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."notas_entrada" add constraint "notas_entrada_status_check" CHECK (status = ANY (ARRAY['pendente'::text, 'recebida'::text, 'cancelada'::text]));

-- constraints
alter table "public"."numeros_serie" add constraint "numeros_serie_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."numeros_serie" add constraint "numeros_serie_produto_id_serie_key" UNIQUE (produto_id, serie);

-- constraints
alter table "public"."ordens_servico" add constraint "ordens_servico_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."ordens_servico" add constraint "ordens_servico_status_check" CHECK (status = ANY (ARRAY['aberta'::text, 'em_andamento'::text, 'cancelada'::text, 'aguardando'::text, 'em_reparo'::text, 'aguardando_peca'::text, 'pronto'::text, 'entregue'::text, 'cancelado'::text, 'orcamento'::text, 'finalizada'::text, 'nao_finalizada'::text]));

-- constraints
alter table "public"."os_checklists" add constraint "os_checklists_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pagamentos_venda" add constraint "pagamentos_venda_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pagamentos_venda" add constraint "pagamentos_venda_status_check" CHECK (status = ANY (ARRAY['pago'::text, 'pendente'::text, 'cancelado'::text, 'vale'::text]));

-- constraints
alter table "public"."pedidos" add constraint "pedidos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pedidos" add constraint "pedidos_status_check" CHECK (status = ANY (ARRAY['rascunho'::text, 'pendente'::text, 'aprovado'::text, 'cancelado'::text, 'faturado'::text]));

-- constraints
alter table "public"."pedidos" add constraint "pedidos_tipo_check" CHECK (tipo = ANY (ARRAY['orcamento'::text, 'pedido'::text]));

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_forma_entrega_check" CHECK (forma_entrega = 'retirada'::text);

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_itens_check" CHECK (jsonb_typeof(itens) = 'array'::text);

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_status_check" CHECK (status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'cancelado'::text]));

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_status_pagamento_check" CHECK (status_pagamento = ANY (ARRAY['pendente'::text, 'pago'::text, 'cancelado'::text]));

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_total_check" CHECK (total > 0::numeric);

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_user_id_chave_envio_key" UNIQUE (user_id, chave_envio);

-- constraints
alter table "public"."pedidos_app_atendimentos" add constraint "pedidos_app_atendimentos_pkey" PRIMARY KEY (pedido_id, unidade);

-- constraints
alter table "public"."pedidos_app_atendimentos" add constraint "pedidos_app_atendimentos_venda_id_key" UNIQUE (venda_id);

-- constraints
alter table "public"."pedidos_app_credito_fila" add constraint "pedidos_app_credito_fila_estado_check" CHECK (estado = ANY (ARRAY['pendente'::text, 'concluido'::text, 'manual'::text]));

-- constraints
alter table "public"."pedidos_app_credito_fila" add constraint "pedidos_app_credito_fila_pkey" PRIMARY KEY (pedido_id, unidade);

-- constraints
alter table "public"."pedidos_app_operacao" add constraint "pedidos_app_operacao_pkey" PRIMARY KEY (pedido_id, unidade);

-- constraints
alter table "public"."pedidos_app_operacao" add constraint "pedidos_app_operacao_solicitacoes_impressao_check" CHECK (solicitacoes_impressao >= 0);

-- constraints
alter table "public"."pedidos_app_operacao" add constraint "pedidos_app_operacao_versao_check" CHECK (versao >= 0);

-- constraints
alter table "public"."pedidos_app_operacao_eventos" add constraint "pedidos_app_operacao_eventos_pedido_id_unidade_versao_key" UNIQUE (pedido_id, unidade, versao);

-- constraints
alter table "public"."pedidos_app_operacao_eventos" add constraint "pedidos_app_operacao_eventos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pedidos_app_operacao_eventos" add constraint "pedidos_app_operacao_eventos_tipo_check" CHECK (tipo = ANY (ARRAY['assumir'::text, 'transferir'::text, 'impressao_solicitada'::text, 'papel_confirmado'::text, 'separado'::text, 'entregue'::text]));

-- constraints
alter table "public"."pedidos_app_unidades" add constraint "pedidos_app_unidades_loja_id_key" UNIQUE (loja_id);

-- constraints
alter table "public"."pedidos_app_unidades" add constraint "pedidos_app_unidades_pkey" PRIMARY KEY (unidade);

-- constraints
alter table "public"."pedidos_app_unidades" add constraint "pedidos_app_unidades_unidade_check" CHECK (length(TRIM(BOTH FROM unidade)) > 0);

-- constraints
alter table "public"."perfis" add constraint "perfis_cargo_check" CHECK (cargo = ANY (ARRAY['dono'::text, 'vendedor'::text, 'gerente'::text, 'estagiária'::text, 'estoquista'::text, 'freelancer'::text, 'motoboy'::text, 'coordenador'::text]));

-- constraints
alter table "public"."perfis" add constraint "perfis_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pessoas" add constraint "pessoas_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pessoas" add constraint "pessoas_tipo_check" CHECK (tipo = ANY (ARRAY['cliente'::text, 'fornecedor'::text, 'ambos'::text]));

-- constraints
alter table "public"."pix_aliases" add constraint "pix_aliases_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pix_aliases" add constraint "pix_aliases_telegram_chat_id_pagador_norm_key" UNIQUE (telegram_chat_id, pagador_norm);

-- constraints
alter table "public"."pix_periodos" add constraint "pix_periodos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."pontos" add constraint "pontos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."produtos" add constraint "produtos_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."promocao_tabelas" add constraint "promocao_tabelas_pkey" PRIMARY KEY (promocao_id, tabela_id);

-- constraints
alter table "public"."promocoes" add constraint "promocoes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."rascunhos_anuncio_ml" add constraint "rascunhos_anuncio_ml_condicao_check" CHECK (condicao = ANY (ARRAY['new'::text, 'used'::text]));

-- constraints
alter table "public"."rascunhos_anuncio_ml" add constraint "rascunhos_anuncio_ml_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."rascunhos_anuncio_ml" add constraint "rascunhos_anuncio_ml_status_check" CHECK (status = ANY (ARRAY['rascunho'::text, 'publicado'::text, 'erro'::text]));

-- constraints
alter table "public"."recebimentos_lote_operacoes" add constraint "recebimentos_lote_operacoes_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."reclassificacoes_forma" add constraint "reclassificacoes_forma_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."remessas_estoque" add constraint "remessas_estoque_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."remessas_estoque_itens" add constraint "remessas_estoque_itens_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."sync_log" add constraint "sync_log_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."sync_log" add constraint "sync_log_status_check" CHECK (status = ANY (ARRAY['ok'::text, 'erro'::text, 'parcial'::text]));

-- constraints
alter table "public"."tabelas_preco" add constraint "tabelas_preco_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."transferencias" add constraint "transferencias_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."trocas_sp" add constraint "trocas_sp_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."vales_credito" add constraint "vales_credito_pkey" PRIMARY KEY (id);

-- constraints
alter table "public"."vales_credito" add constraint "vales_credito_status_check" CHECK (status = ANY (ARRAY['ativo'::text, 'utilizado'::text, 'cancelado'::text]));

-- constraints
alter table "public"."vendas" add constraint "vendas_ml_order_id_key" UNIQUE (ml_order_id);

-- constraints
alter table "public"."vendas" add constraint "vendas_pkey" PRIMARY KEY (id);

-- constraints
alter table "halloween_private"."audit" add constraint "audit_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_campaign_id_product_id_fkey" FOREIGN KEY (campaign_id, product_id) REFERENCES halloween_private.products(campaign_id, id);

-- constraints
alter table "halloween_private"."coupons" add constraint "coupons_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES halloween_private.tickets(id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_item_id_fkey" FOREIGN KEY (item_id) REFERENCES itens_venda(id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES vendas(id);

-- constraints
alter table "halloween_private"."margin_items" add constraint "margin_items_store_id_fkey" FOREIGN KEY (store_id) REFERENCES lojas(id);

-- constraints
alter table "halloween_private"."margin_stores" add constraint "margin_stores_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."margin_stores" add constraint "margin_stores_store_id_fkey" FOREIGN KEY (store_id) REFERENCES lojas(id);

-- constraints
alter table "halloween_private"."payment_claims" add constraint "payment_claims_proof_id_fkey" FOREIGN KEY (proof_id) REFERENCES halloween_private.payment_proofs(id);

-- constraints
alter table "halloween_private"."payment_proofs" add constraint "payment_proofs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."products" add constraint "products_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."sale_windows" add constraint "sale_windows_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."store_prizes" add constraint "store_prizes_store_id_fkey" FOREIGN KEY (store_id) REFERENCES lojas(id);

-- constraints
alter table "halloween_private"."store_reservations" add constraint "store_reservations_campaign_id_store_id_slot_fkey" FOREIGN KEY (campaign_id, store_id, slot) REFERENCES halloween_private.store_prizes(campaign_id, store_id, slot);

-- constraints
alter table "halloween_private"."store_reservations" add constraint "store_reservations_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES halloween_private.coupons(id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES halloween_private.campaigns(id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_proof_id_fkey" FOREIGN KEY (proof_id) REFERENCES halloween_private.payment_proofs(id);

-- constraints
alter table "halloween_private"."tickets" add constraint "tickets_replaces_coupon_id_fkey" FOREIGN KEY (replaces_coupon_id) REFERENCES halloween_private.coupons(id);

-- constraints
alter table "public"."bairros_entrega" add constraint "bairros_entrega_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id);

-- constraints
alter table "public"."cadastros_clientes" add constraint "cadastros_clientes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraints
alter table "public"."caixas" add constraint "caixas_aberto_por_fkey" FOREIGN KEY (aberto_por) REFERENCES perfis(id);

-- constraints
alter table "public"."caixas" add constraint "caixas_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."caixas" add constraint "caixas_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- constraints
alter table "public"."chat_mensagens" add constraint "chat_mensagens_sessao_id_fkey" FOREIGN KEY (sessao_id) REFERENCES chat_sessoes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."chat_sessoes" add constraint "chat_sessoes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- constraints
alter table "public"."consignados" add constraint "consignados_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."consignados" add constraint "consignados_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_devolucao_id_fkey" FOREIGN KEY (devolucao_id) REFERENCES devolucoes(id) ON DELETE SET NULL;

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_estorna_credito_id_fkey" FOREIGN KEY (estorna_credito_id) REFERENCES creditos_clientes(id);

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."creditos_clientes" add constraint "creditos_clientes_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."depositos" add constraint "depositos_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."devolucoes" add constraint "devolucoes_caixa_id_fkey" FOREIGN KEY (caixa_id) REFERENCES caixas(id);

-- constraints
alter table "public"."devolucoes" add constraint "devolucoes_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id);

-- constraints
alter table "public"."devolucoes" add constraint "devolucoes_venda_id_fkey" FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."escala_excecoes" add constraint "escala_excecoes_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES perfis(id);

-- constraints
alter table "public"."escala_excecoes" add constraint "escala_excecoes_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE;

-- constraints
alter table "public"."escalas" add constraint "escalas_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."escalas" add constraint "escalas_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE;

-- constraints
alter table "public"."estoque" add constraint "estoque_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."estoque" add constraint "estoque_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."faixas_promocao" add constraint "faixas_promocao_promocao_id_fkey" FOREIGN KEY (promocao_id) REFERENCES promocoes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."forma_conta_loja" add constraint "forma_conta_loja_conta_id_fkey" FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE;

-- constraints
alter table "public"."forma_conta_loja" add constraint "forma_conta_loja_forma_id_fkey" FOREIGN KEY (forma_id) REFERENCES formas_pagamento(id) ON DELETE CASCADE;

-- constraints
alter table "public"."forma_conta_loja" add constraint "forma_conta_loja_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id) ON DELETE CASCADE;

-- constraints
alter table "public"."formas_pagamento" add constraint "formas_pagamento_conta_destino_id_fkey" FOREIGN KEY (conta_destino_id) REFERENCES contas(id);

-- constraints
alter table "public"."formas_pagamento" add constraint "formas_pagamento_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."formas_pagamento" add constraint "formas_pagamento_maquina_id_fkey" FOREIGN KEY (maquina_id) REFERENCES maquinas_cartao(id);

-- constraints
alter table "public"."historico_itens_venda" add constraint "historico_itens_venda_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id);

-- constraints
alter table "public"."integracoes_mercado_livre_anuncios" add constraint "integracoes_mercado_livre_anuncios_conexao_id_fkey" FOREIGN KEY (conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE CASCADE;

-- constraints
alter table "public"."integracoes_mercado_livre_anuncios" add constraint "integracoes_mercado_livre_anuncios_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id);

-- constraints
alter table "public"."integracoes_mercado_livre_mensagens" add constraint "integracoes_mercado_livre_mensagens_conexao_id_fkey" FOREIGN KEY (conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE CASCADE;

-- constraints
alter table "public"."integracoes_mercado_livre_pedidos_pendentes" add constraint "integracoes_mercado_livre_pedidos_pendentes_conexao_id_fkey" FOREIGN KEY (conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE CASCADE;

-- constraints
alter table "public"."integracoes_mercado_livre_perguntas" add constraint "integracoes_mercado_livre_perguntas_conexao_id_fkey" FOREIGN KEY (conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_consignado" add constraint "itens_consignado_consignado_id_fkey" FOREIGN KEY (consignado_id) REFERENCES consignados(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_consignado" add constraint "itens_consignado_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."itens_devolucao" add constraint "itens_devolucao_devolucao_id_fkey" FOREIGN KEY (devolucao_id) REFERENCES devolucoes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_nota_entrada" add constraint "itens_nota_entrada_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."itens_nota_entrada" add constraint "itens_nota_entrada_nota_id_fkey" FOREIGN KEY (nota_id) REFERENCES notas_entrada(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_nota_entrada" add constraint "itens_nota_entrada_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."itens_os" add constraint "itens_os_os_id_fkey" FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_os" add constraint "itens_os_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."itens_pedido" add constraint "itens_pedido_pedido_id_fkey" FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_pedido" add constraint "itens_pedido_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."itens_promocao" add constraint "itens_promocao_promocao_id_fkey" FOREIGN KEY (promocao_id) REFERENCES promocoes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_tabela_preco" add constraint "itens_tabela_preco_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_tabela_preco" add constraint "itens_tabela_preco_tabela_id_fkey" FOREIGN KEY (tabela_id) REFERENCES tabelas_preco(id) ON DELETE CASCADE;

-- constraints
alter table "public"."itens_venda" add constraint "itens_venda_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id);

-- constraints
alter table "public"."itens_venda" add constraint "itens_venda_venda_id_fkey" FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE;

-- constraints
alter table "public"."lancamentos" add constraint "lancamentos_conta_id_fkey" FOREIGN KEY (conta_id) REFERENCES contas(id);

-- constraints
alter table "public"."lancamentos" add constraint "lancamentos_devolucao_id_fkey" FOREIGN KEY (devolucao_id) REFERENCES devolucoes(id);

-- constraints
alter table "public"."lancamentos" add constraint "lancamentos_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."lembretes" add constraint "lembretes_cargo_id_fkey" FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."lembretes" add constraint "lembretes_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES perfis(id);

-- constraints
alter table "public"."lembretes" add constraint "lembretes_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE;

-- constraints
alter table "public"."lembretes_feitos" add constraint "lembretes_feitos_lembrete_id_fkey" FOREIGN KEY (lembrete_id) REFERENCES lembretes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."lembretes_feitos" add constraint "lembretes_feitos_perfil_id_fkey" FOREIGN KEY (perfil_id) REFERENCES perfis(id);

-- constraints
alter table "public"."lojas" add constraint "lojas_conta_padrao_id_fkey" FOREIGN KEY (conta_padrao_id) REFERENCES contas(id);

-- constraints
alter table "public"."lojas" add constraint "lojas_deposito_padrao_id_fkey" FOREIGN KEY (deposito_padrao_id) REFERENCES depositos(id);

-- constraints
alter table "public"."lojas" add constraint "lojas_matriz_id_fkey" FOREIGN KEY (matriz_id) REFERENCES lojas(id);

-- constraints
alter table "public"."lojas" add constraint "lojas_tabela_padrao_id_fkey" FOREIGN KEY (tabela_padrao_id) REFERENCES tabelas_preco(id);

-- constraints
alter table "public"."metas_faixas" add constraint "metas_faixas_meta_id_fkey" FOREIGN KEY (meta_id) REFERENCES metas(id) ON DELETE CASCADE;

-- constraints
alter table "public"."movimentos_caixa" add constraint "movimentos_caixa_caixa_id_fkey" FOREIGN KEY (caixa_id) REFERENCES caixas(id) ON DELETE CASCADE;

-- constraints
alter table "public"."movimentos_caixa" add constraint "movimentos_caixa_lancamento_id_fkey" FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."notas_entrada" add constraint "notas_entrada_fornecedor_id_fkey" FOREIGN KEY (fornecedor_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."numeros_serie" add constraint "numeros_serie_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."numeros_serie" add constraint "numeros_serie_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;

-- constraints
alter table "public"."ordens_servico" add constraint "ordens_servico_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL;

-- constraints
alter table "public"."ordens_servico" add constraint "ordens_servico_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."os_checklists" add constraint "os_checklists_os_id_fkey" FOREIGN KEY (os_id) REFERENCES ordens_servico(id) ON DELETE CASCADE;

-- constraints
alter table "public"."pagamentos_venda" add constraint "pagamentos_venda_forma_pagamento_id_fkey" FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE SET NULL;

-- constraints
alter table "public"."pedidos" add constraint "pedidos_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id);

-- constraints
alter table "public"."pedidos_app" add constraint "pedidos_app_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- constraints
alter table "public"."pedidos_app_atendimentos" add constraint "pedidos_app_atendimentos_pedido_id_fkey" FOREIGN KEY (pedido_id) REFERENCES pedidos_app(id);

-- constraints
alter table "public"."pedidos_app_atendimentos" add constraint "pedidos_app_atendimentos_unidade_fkey" FOREIGN KEY (unidade) REFERENCES pedidos_app_unidades(unidade);

-- constraints
alter table "public"."pedidos_app_atendimentos" add constraint "pedidos_app_atendimentos_venda_id_fkey" FOREIGN KEY (venda_id) REFERENCES vendas(id);

-- constraints
alter table "public"."pedidos_app_credito_fila" add constraint "pedidos_app_credito_fila_caixa_id_fkey" FOREIGN KEY (caixa_id) REFERENCES caixas(id);

-- constraints
alter table "public"."pedidos_app_credito_fila" add constraint "pedidos_app_credito_fila_pedido_id_fkey" FOREIGN KEY (pedido_id) REFERENCES pedidos_app(id);

-- constraints
alter table "public"."pedidos_app_credito_fila" add constraint "pedidos_app_credito_fila_unidade_fkey" FOREIGN KEY (unidade) REFERENCES pedidos_app_unidades(unidade);

-- constraints
alter table "public"."pedidos_app_operacao" add constraint "pedidos_app_operacao_pedido_id_fkey" FOREIGN KEY (pedido_id) REFERENCES pedidos_app(id);

-- constraints
alter table "public"."pedidos_app_operacao" add constraint "pedidos_app_operacao_unidade_fkey" FOREIGN KEY (unidade) REFERENCES pedidos_app_unidades(unidade);

-- constraints
alter table "public"."pedidos_app_operacao_eventos" add constraint "pedidos_app_operacao_eventos_pedido_id_unidade_fkey" FOREIGN KEY (pedido_id, unidade) REFERENCES pedidos_app_operacao(pedido_id, unidade);

-- constraints
alter table "public"."pedidos_app_unidades" add constraint "pedidos_app_unidades_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."perfis" add constraint "perfis_cargo_id_fkey" FOREIGN KEY (cargo_id) REFERENCES cargos(id);

-- constraints
alter table "public"."perfis" add constraint "perfis_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- constraints
alter table "public"."pessoas" add constraint "pessoas_tabela_preco_id_fkey" FOREIGN KEY (tabela_preco_id) REFERENCES tabelas_preco(id);

-- constraints
alter table "public"."produtos" add constraint "produtos_categoria_fkey" FOREIGN KEY (categoria) REFERENCES categorias(hierarquia) ON DELETE SET NULL;

-- constraints
alter table "public"."produtos" add constraint "produtos_fornecedor_id_fkey" FOREIGN KEY (fornecedor_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."promocao_tabelas" add constraint "promocao_tabelas_promocao_id_fkey" FOREIGN KEY (promocao_id) REFERENCES promocoes(id) ON DELETE CASCADE;

-- constraints
alter table "public"."promocao_tabelas" add constraint "promocao_tabelas_tabela_id_fkey" FOREIGN KEY (tabela_id) REFERENCES tabelas_preco(id) ON DELETE CASCADE;

-- constraints
alter table "public"."promocoes" add constraint "promocoes_categoria_fkey" FOREIGN KEY (categoria) REFERENCES categorias(hierarquia);

-- constraints
alter table "public"."rascunhos_anuncio_ml" add constraint "rascunhos_anuncio_ml_conexao_id_fkey" FOREIGN KEY (conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE CASCADE;

-- constraints
alter table "public"."rascunhos_anuncio_ml" add constraint "rascunhos_anuncio_ml_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id);

-- constraints
alter table "public"."reclassificacoes_forma" add constraint "reclassificacoes_forma_pagamento_id_fkey" FOREIGN KEY (pagamento_id) REFERENCES pagamentos_venda(id);

-- constraints
alter table "public"."reclassificacoes_forma" add constraint "reclassificacoes_forma_venda_id_fkey" FOREIGN KEY (venda_id) REFERENCES vendas(id);

-- constraints
alter table "public"."remessas_estoque" add constraint "remessas_estoque_destino_fkey" FOREIGN KEY (destino) REFERENCES depositos(id);

-- constraints
alter table "public"."remessas_estoque" add constraint "remessas_estoque_origem_fkey" FOREIGN KEY (origem) REFERENCES depositos(id);

-- constraints
alter table "public"."remessas_estoque_itens" add constraint "remessas_estoque_itens_produto_id_fkey" FOREIGN KEY (produto_id) REFERENCES produtos(id);

-- constraints
alter table "public"."remessas_estoque_itens" add constraint "remessas_estoque_itens_remessa_id_fkey" FOREIGN KEY (remessa_id) REFERENCES remessas_estoque(id) ON DELETE CASCADE;

-- constraints
alter table "public"."transferencias" add constraint "transferencias_conta_destino_id_fkey" FOREIGN KEY (conta_destino_id) REFERENCES contas(id);

-- constraints
alter table "public"."transferencias" add constraint "transferencias_conta_origem_id_fkey" FOREIGN KEY (conta_origem_id) REFERENCES contas(id);

-- constraints
alter table "public"."trocas_sp" add constraint "trocas_sp_loja_id_fkey" FOREIGN KEY (loja_id) REFERENCES lojas(id);

-- constraints
alter table "public"."vales_credito" add constraint "vales_credito_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- constraints
alter table "public"."vendas" add constraint "vendas_caixa_id_fkey" FOREIGN KEY (caixa_id) REFERENCES caixas(id);

-- constraints
alter table "public"."vendas" add constraint "vendas_deposito_id_fkey" FOREIGN KEY (deposito_id) REFERENCES depositos(id);

-- constraints
alter table "public"."vendas" add constraint "vendas_forma_pagamento_id_fkey" FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id);

-- constraints
alter table "public"."vendas" add constraint "vendas_ml_conexao_id_fkey" FOREIGN KEY (ml_conexao_id) REFERENCES integracoes_mercado_livre(id) ON DELETE SET NULL;

-- constraints
alter table "public"."vendas" add constraint "vendas_pessoa_id_fkey" FOREIGN KEY (pessoa_id) REFERENCES pessoas(id);

-- constraints
alter table "public"."vendas" add constraint "vendas_vendedor_id_fkey" FOREIGN KEY (vendedor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- indexes
CREATE INDEX coupons_campaign_id_expires_at_idx ON halloween_private.coupons USING btree (campaign_id, expires_at) WHERE ((redeemed_at IS NULL) AND (released_at IS NULL));

-- indexes
CREATE UNIQUE INDEX halloween_open_window ON halloween_private.sale_windows USING btree (campaign_id) WHERE (ended_at IS NULL);

-- indexes
CREATE INDEX halloween_ticket_customer ON halloween_private.tickets USING btree (campaign_id, customer_id, created_at DESC);

-- indexes
CREATE UNIQUE INDEX halloween_ticket_os ON halloween_private.tickets USING btree (campaign_id, os_id) WHERE ((os_id IS NOT NULL) AND (replaces_coupon_id IS NULL));

-- indexes
CREATE UNIQUE INDEX halloween_ticket_sale ON halloween_private.tickets USING btree (campaign_id, sale_id) WHERE ((sale_id IS NOT NULL) AND (replaces_coupon_id IS NULL));

-- indexes
CREATE INDEX halloween_tickets_store ON halloween_private.tickets USING btree (campaign_id, loja_id, created_at DESC);

-- indexes
CREATE UNIQUE INDEX idx_banco_horas_falta_dobra_unica ON public.banco_horas USING btree (usuario_id, data) WHERE (motivo = ANY (ARRAY['falta'::text, 'abono'::text, 'dobra'::text]));

-- indexes
CREATE INDEX idx_banco_horas_usuario ON public.banco_horas USING btree (usuario_id, data);

-- indexes
CREATE UNIQUE INDEX cadastros_clientes_pessoa_unica ON public.cadastros_clientes USING btree (pessoa_id) WHERE (pessoa_id IS NOT NULL);

-- indexes
CREATE UNIQUE INDEX uniq_caixa_aberto_por_loja ON public.caixas USING btree (loja_id) WHERE (status = 'aberto'::text);

-- indexes
CREATE INDEX idx_comprovantes_recebido ON public.comprovantes_pix USING btree (recebido_em);

-- indexes
CREATE INDEX idx_comprovantes_status ON public.comprovantes_pix USING btree (status);

-- indexes
CREATE INDEX idx_comprovantes_transacao ON public.comprovantes_pix USING btree (telegram_chat_id, transacao_id);

-- indexes
CREATE UNIQUE INDEX creditos_clientes_estorno_unico ON public.creditos_clientes USING btree (estorna_credito_id) WHERE ((tipo = 'estorno'::text) AND (estorna_credito_id IS NOT NULL));

-- indexes
CREATE INDEX creditos_clientes_loja_idx ON public.creditos_clientes USING btree (loja_id) WHERE (loja_id IS NOT NULL);

-- indexes
CREATE INDEX creditos_clientes_pessoa_loja_idx ON public.creditos_clientes USING btree (pessoa_id, loja_id);

-- indexes
CREATE INDEX idx_devolucoes_caixa ON public.devolucoes USING btree (caixa_id) WHERE (caixa_id IS NOT NULL);

-- indexes
CREATE INDEX idx_devolucoes_motivo ON public.devolucoes USING btree (motivo_tipo);

-- indexes
CREATE INDEX encomendas_loja_status_idx ON public.encomendas USING btree (loja_id, status);

-- indexes
CREATE INDEX encomendas_pessoa_idx ON public.encomendas USING btree (pessoa_id);

-- indexes
CREATE INDEX idx_excecoes_data ON public.escala_excecoes USING btree (data);

-- indexes
CREATE INDEX idx_faixas_promocao_promo ON public.faixas_promocao USING btree (promocao_id);

-- indexes
CREATE INDEX idx_feriados_data ON public.feriados USING btree (data);

-- indexes
CREATE INDEX idx_forma_conta_loja_forma ON public.forma_conta_loja USING btree (forma_id);

-- indexes
CREATE INDEX idx_hist_itens_data ON public.historico_itens_venda USING btree (data);

-- indexes
CREATE INDEX idx_hist_itens_produto ON public.historico_itens_venda USING btree (produto_id);

-- indexes
CREATE INDEX idx_hist_vendas_cliente ON public.historico_vendas USING btree (lower(cliente));

-- indexes
CREATE INDEX idx_hist_vendas_data ON public.historico_vendas USING btree (data);

-- indexes
CREATE INDEX idx_hist_vendas_vendedor ON public.historico_vendas USING btree (vendedor);

-- indexes
CREATE INDEX idx_ml_anuncios_conexao ON public.integracoes_mercado_livre_anuncios USING btree (conexao_id);

-- indexes
CREATE INDEX idx_ml_anuncios_produto ON public.integracoes_mercado_livre_anuncios USING btree (produto_id);

-- indexes
CREATE INDEX idx_ml_mensagens_conexao ON public.integracoes_mercado_livre_mensagens USING btree (conexao_id);

-- indexes
CREATE INDEX idx_ml_pedidos_pendentes_conexao ON public.integracoes_mercado_livre_pedidos_pendentes USING btree (conexao_id);

-- indexes
CREATE INDEX idx_ml_perguntas_conexao ON public.integracoes_mercado_livre_perguntas USING btree (conexao_id);

-- indexes
CREATE UNIQUE INDEX itens_tabela_preco_faixa_unica ON public.itens_tabela_preco USING btree (tabela_id, produto_id, quantidade_minima);

-- indexes
CREATE INDEX idx_itens_venda_venda_id ON public.itens_venda USING btree (venda_id);

-- indexes
CREATE INDEX idx_lancamentos_devolucao ON public.lancamentos USING btree (devolucao_id) WHERE (devolucao_id IS NOT NULL);

-- indexes
CREATE INDEX lancamentos_loja_id_idx ON public.lancamentos USING btree (loja_id);

-- indexes
CREATE INDEX lancamentos_loja_idx ON public.lancamentos USING btree (loja_id) WHERE (loja_id IS NOT NULL);

-- indexes
CREATE INDEX lancamentos_pessoa_id_idx ON public.lancamentos USING btree (pessoa_id) WHERE (status = 'pendente'::text);

-- indexes
CREATE INDEX idx_lembretes_ativo ON public.lembretes USING btree (ativo);

-- indexes
CREATE INDEX idx_feitos_data ON public.lembretes_feitos USING btree (data);

-- indexes
CREATE INDEX idx_logs_acao_data ON public.logs_atividade USING btree (tipo_acao, created_at DESC);

-- indexes
CREATE INDEX idx_logs_contexto ON public.logs_atividade USING gin (contexto);

-- indexes
CREATE INDEX idx_logs_usuario ON public.logs_atividade USING btree (usuario_id, created_at DESC);

-- indexes
CREATE INDEX idx_metas_faixas_meta ON public.metas_faixas USING btree (meta_id);

-- indexes
CREATE INDEX idx_movimentacoes_created_at ON public.movimentacoes_estoque USING btree (created_at DESC);

-- indexes
CREATE INDEX idx_movimentacoes_produto ON public.movimentacoes_estoque USING btree (produto_id);

-- indexes
CREATE INDEX idx_movimentos_caixa_caixa_id ON public.movimentos_caixa USING btree (caixa_id);

-- indexes
CREATE INDEX movimentos_caixa_lancamento_id_idx ON public.movimentos_caixa USING btree (lancamento_id);

-- indexes
CREATE INDEX idx_numeros_serie_produto ON public.numeros_serie USING btree (produto_id);

-- indexes
CREATE INDEX idx_numeros_serie_status ON public.numeros_serie USING btree (status);

-- indexes
CREATE INDEX idx_os_checklists_os ON public.os_checklists USING btree (os_id);

-- indexes
CREATE INDEX idx_pagamentos_venda_venda_id ON public.pagamentos_venda USING btree (venda_id);

-- indexes
CREATE INDEX pedidos_app_credito_fila_pendentes ON public.pedidos_app_credito_fila USING btree (proxima_tentativa) WHERE (estado = 'pendente'::text);

-- indexes
CREATE UNIQUE INDEX perfis_username_key ON public.perfis USING btree (username) WHERE (username IS NOT NULL);

-- indexes
CREATE INDEX idx_pessoas_nao_vender ON public.pessoas USING btree (nao_vender) WHERE nao_vender;

-- indexes
CREATE INDEX idx_pessoas_nome_norm ON public.pessoas USING btree (nome_norm text_pattern_ops);

-- indexes
CREATE UNIQUE INDEX pessoas_cpf_cnpj_unique ON public.pessoas USING btree (cpf_cnpj) WHERE (cpf_cnpj IS NOT NULL);

-- indexes
CREATE INDEX idx_pix_periodos_aberto ON public.pix_periodos USING btree (telegram_chat_id, fechado_em);

-- indexes
CREATE INDEX idx_pontos_criado_em ON public.pontos USING btree (criado_em);

-- indexes
CREATE INDEX idx_pontos_usuario ON public.pontos USING btree (usuario_id, criado_em);

-- indexes
CREATE INDEX idx_produtos_busca_norm ON public.produtos USING btree (busca_norm text_pattern_ops);

-- indexes
CREATE UNIQUE INDEX produtos_codigo_ativo_unique ON public.produtos USING btree (codigo) WHERE ((ativo = true) AND (codigo IS NOT NULL));

-- indexes
CREATE INDEX idx_promocao_tabelas_promocao ON public.promocao_tabelas USING btree (promocao_id);

-- indexes
CREATE UNIQUE INDEX idx_rascunhos_ml_ativo_unico ON public.rascunhos_anuncio_ml USING btree (produto_id, conexao_id) WHERE (status <> 'publicado'::text);

-- indexes
CREATE INDEX idx_rascunhos_ml_conexao ON public.rascunhos_anuncio_ml USING btree (conexao_id);

-- indexes
CREATE INDEX idx_rascunhos_ml_produto ON public.rascunhos_anuncio_ml USING btree (produto_id);

-- indexes
CREATE INDEX idx_remessas_status ON public.remessas_estoque USING btree (status);

-- indexes
CREATE INDEX idx_remessas_itens_remessa ON public.remessas_estoque_itens USING btree (remessa_id);

-- indexes
CREATE UNIQUE INDEX tabelas_preco_unica_custo ON public.tabelas_preco USING btree (usa_preco_custo) WHERE usa_preco_custo;

-- indexes
CREATE INDEX idx_trocas_sp_status ON public.trocas_sp USING btree (status);

-- indexes
CREATE INDEX idx_vendas_caixa ON public.vendas USING btree (caixa_id);

-- indexes
CREATE INDEX idx_vendas_created_at ON public.vendas USING btree (created_at);

-- indexes
CREATE INDEX idx_vendas_ml_conexao ON public.vendas USING btree (ml_conexao_id) WHERE (ml_conexao_id IS NOT NULL);

-- indexes
CREATE INDEX idx_vendas_motivo_canc ON public.vendas USING btree (motivo_cancelamento);

-- indexes
CREATE INDEX idx_vendas_status ON public.vendas USING btree (status);

-- routines
CREATE OR REPLACE FUNCTION halloween_private.activation_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not new.test_mode and new.active and not old.active then
  insert into halloween_private.sale_windows(campaign_id) values(new.id);
 elsif not new.active and old.active then
  update halloween_private.sale_windows set ended_at=clock_timestamp() where campaign_id=new.id and ended_at is null;
 end if;
 return new;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.admin_state(p_campaign text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select halloween_private.admin_state_v2(p_campaign,'',0)$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.admin_state_for_store(p_campaign text, p_store uuid, p_search text, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c halloween_private.campaigns; clients jsonb; total integer;
begin
 perform halloween_private.require_staff();perform halloween_private.require_store(p_store);
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>80 then raise exception 'Busca ou página inválida.';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada.';end if;
 -- No campaign lock or cleanup on dashboard reads.
 select coalesce(jsonb_agg(to_jsonb(x)order by x.latest desc,x.client_key),'[]'::jsonb)into clients from(
 select coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)client_key,max(t.customer)customer,count(*)total,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at>clock_timestamp())available,
 count(*)filter(where t.revoked_at is null and r.id is not null and r.voided_at is null)used,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at<=clock_timestamp())expired,
 count(*)filter(where t.revoked_at is not null)revoked,max(t.created_at)latest
 from halloween_private.tickets t left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and (t.loja_id=p_store or c.test_mode) and position(lower(coalesce(p_search,''))in lower(t.customer))>0
 group by coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)order by latest desc,client_key limit 50 offset p_offset)x;
 select count(*)into total from(select distinct coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)k from halloween_private.tickets t
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and (t.loja_id=p_store or c.test_mode) and position(lower(coalesce(p_search,''))in lower(t.customer))>0)x;
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'stock_confirmed',c.stock_confirmed,'last_sync_at',c.last_sync_at,'sync_error',c.sync_error,
 'clients',clients,'clients_total',total,'pending',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from(
 select s.numero from public.vendas s where exists(select 1 from public.depositos d where d.id=s.deposito_id and d.loja_id=p_store) and not c.test_mode and c.active and s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null
 and s.created_at>clock_timestamp()-interval '48 hours'and(c.starts_at is null or s.created_at>=c.starts_at)and(c.ends_at is null or s.created_at<c.ends_at)
 and not exists(select 1 from public.pessoas p where p.id=s.pessoa_id and nullif(btrim(p.nome),'')is not null)
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and(w.ended_at is null or s.created_at<w.ended_at))
 and halloween_private.sale_paid(s.id)order by s.created_at desc limit 100)x),
 'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)order by nome),'[]'::jsonb)from public.lojas where ativa and id=p_store),
 'products',(select jsonb_agg(to_jsonb(p)order by p.id)from halloween_private.products p where campaign_id=c.id),
 'metrics',jsonb_build_object('tickets',(select count(*)from halloween_private.tickets where campaign_id=c.id and (loja_id=p_store or c.test_mode)),'spins',(select count(*)from halloween_private.coupons where campaign_id=c.id and (c.test_mode or ticket_id in(select id from halloween_private.tickets where campaign_id=c.id and loja_id=p_store)) and voided_at is null),'redeemed',(select count(*)from halloween_private.coupons where campaign_id=c.id and (c.test_mode or ticket_id in(select id from halloween_private.tickets where campaign_id=c.id and loja_id=p_store)) and redeemed_at is not null)));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.admin_state_v2(p_campaign text, p_search text, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c halloween_private.campaigns; clients jsonb; total integer;
begin
 perform halloween_private.require_staff();
 if p_offset is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>80 then raise exception 'Busca ou página inválida.';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada.';end if;
 -- No campaign lock or cleanup on dashboard reads.
 select coalesce(jsonb_agg(to_jsonb(x)order by x.latest desc,x.client_key),'[]'::jsonb)into clients from(
 select coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)client_key,max(t.customer)customer,count(*)total,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at>clock_timestamp())available,
 count(*)filter(where t.revoked_at is null and r.id is not null and r.voided_at is null)used,
 count(*)filter(where t.revoked_at is null and r.id is null and t.expires_at<=clock_timestamp())expired,
 count(*)filter(where t.revoked_at is not null)revoked,max(t.created_at)latest
 from halloween_private.tickets t left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and position(lower(coalesce(p_search,''))in lower(t.customer))>0
 group by coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)order by latest desc,client_key limit 50 offset p_offset)x;
 select count(*)into total from(select distinct coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)k from halloween_private.tickets t
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=c.id and position(lower(coalesce(p_search,''))in lower(t.customer))>0)x;
 return jsonb_build_object('campaign',halloween_private.catalog(c.id),'stock_confirmed',c.stock_confirmed,'last_sync_at',c.last_sync_at,'sync_error',c.sync_error,
 'clients',clients,'clients_total',total,'pending',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)from(
 select s.numero from public.vendas s where not c.test_mode and c.active and s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null
 and s.created_at>clock_timestamp()-interval '48 hours'and(c.starts_at is null or s.created_at>=c.starts_at)and(c.ends_at is null or s.created_at<c.ends_at)
 and not exists(select 1 from public.pessoas p where p.id=s.pessoa_id and nullif(btrim(p.nome),'')is not null)
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and s.created_at>=w.started_at and(w.ended_at is null or s.created_at<w.ended_at))
 and halloween_private.sale_paid(s.id)order by s.created_at desc limit 100)x),
 'stores',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome)order by nome),'[]'::jsonb)from public.lojas where ativa),
 'products',(select jsonb_agg(to_jsonb(p)order by p.id)from halloween_private.products p where campaign_id=c.id),
 'metrics',jsonb_build_object('tickets',(select count(*)from halloween_private.tickets where campaign_id=c.id),'spins',(select count(*)from halloween_private.coupons where campaign_id=c.id and voided_at is null),'redeemed',(select count(*)from halloween_private.coupons where campaign_id=c.id and redeemed_at is not null)));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.capture_os(p_campaign text, p_os uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare d jsonb; s jsonb; refs text[]; existing uuid;
begin
 select id into existing from halloween_private.tickets where campaign_id=p_campaign and os_id=p_os and replaces_coupon_id is null;if found then return existing;end if;
 d:=halloween_private.paid_os(p_os);s:=halloween_private.source_data('os',p_os);
 if d is null or s is null or halloween_private.proof_window(p_campaign,(s->>'created_at')::timestamptz,(d->>'received_at')::timestamptz)is distinct from true then return null;end if;
 select array_agg(l.id)into refs from public.lancamentos l join public.ordens_servico o on o.id=p_os where l.tipo='receber'and l.status='pago'and l.venda_id is null and l.valor>=o.total and l.descricao='Recebimento OS #'||o.numero::text and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id=(s->>'loja_id')::uuid and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes';
 if coalesce(cardinality(refs),0)<>1 or exists(select 1 from unnest(refs)r where halloween_private.receipt_claimed(p_campaign,r))then return null;end if;
 return halloween_private.issue_proof(p_campaign,'os',p_os,(d->>'received_at')::timestamptz,refs,'auto');
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.capture_sale(p_campaign text, p_sale jsonb, p_customer text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare d jsonb; existing uuid;
begin
 select id into existing from halloween_private.tickets where campaign_id=p_campaign and sale_id=(p_sale->>'id')::uuid and replaces_coupon_id is null;if found then return existing;end if;
 d:=halloween_private.sale_payment_proof((p_sale->>'id')::uuid);
 if d->>'status'<>'ready'or halloween_private.source_data('sale',(p_sale->>'id')::uuid)is null then return null;end if;
 if halloween_private.proof_window(p_campaign,(p_sale->>'created_at')::timestamptz,(d->>'paid_at')::timestamptz)is distinct from true then return null;end if;
 return halloween_private.issue_proof(p_campaign,'sale',(p_sale->>'id')::uuid,(d->>'paid_at')::timestamptz,array(select jsonb_array_elements_text(d->'receipt_ids')),'auto');
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.catalog(p_campaign text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select halloween_private.catalog_for(p_campaign,'{}')$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.catalog_for(p_campaign text, p_excluded integer[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',c.id,'title',c.title,'active',c.active,'test_mode',c.test_mode,'server_time',clock_timestamp(),'starts_at',c.starts_at,'ends_at',c.ends_at,
 'participation_open',c.active and(c.starts_at is null or clock_timestamp()>=c.starts_at)and(c.ends_at is null or clock_timestamp()<c.ends_at),
 'can_spin',exists(select 1 from halloween_private.draw_pool_for(c.id,p_excluded)),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'unlimited',p.unlimited,
 'chance_base',p.weight/100.0,'chance_current',coalesce(d.chance_bps/100.0,0),'available',p.enabled and(p.unlimited or p.remaining>0)and not(p.id=any(coalesce(p_excluded,'{}'))))order by p.id),'[]'::jsonb)
 from halloween_private.products p left join halloween_private.draw_pool_for(c.id,p_excluded)d on d.product_id=p.id where p.campaign_id=c.id))from halloween_private.campaigns c where c.id=p_campaign
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.catalog_for(p_campaign text, p_excluded integer[], p_store uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',c.id,'title',c.title,'active',c.active,'test_mode',c.test_mode,'server_time',clock_timestamp(),'starts_at',c.starts_at,'ends_at',c.ends_at,
 'participation_open',c.active and(c.starts_at is null or clock_timestamp()>=c.starts_at)and(c.ends_at is null or clock_timestamp()<c.ends_at),
 'can_spin',exists(select 1 from halloween_private.draw_pool_for(c.id,p_excluded,p_store)),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'unlimited',p.unlimited,
 'chance_base',p.weight/100.0,'chance_current',coalesce(d.chance_bps/100.0,0),'available',p.enabled and(p.unlimited or p.remaining>0)and not(p.id=any(coalesce(p_excluded,'{}'))))order by p.id),'[]'::jsonb)
 from halloween_private.products p left join halloween_private.draw_pool_for(c.id,p_excluded,p_store)d on d.product_id=p.id where p.campaign_id=c.id))from halloween_private.campaigns c where c.id=p_campaign
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.client_tickets(p_campaign text, p_customer text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; data jsonb;
begin
 v_user:=halloween_private.require_staff();if p_offset<0 or p_offset>100000 then raise exception 'Página inválida.';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id),'[]'::jsonb)into data from(
 select t.id,(select paid_at from halloween_private.payment_proofs where id=t.proof_id)paid_at,(select source_created_at from halloween_private.payment_proofs where id=t.proof_id)source_created_at,(select origin from halloween_private.payment_proofs where id=t.proof_id)emission_origin,t.customer,t.customer_id,t.purchase_ref,t.created_at,t.expires_at,t.amount_cents,t.loja_id,(select nome from public.lojas where id=t.loja_id)loja,t.replaces_coupon_id,
 case when not halloween_private.sale_valid(t.id)then 'revoked'when r.voided_at is not null then 'replaced'when r.id is not null then 'used'when t.expires_at<=clock_timestamp()then 'expired'else 'available'end status,
 halloween_private.coupon_json(r.id)result,encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex')token
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=p_campaign and coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)=p_customer order by t.created_at desc,t.id limit 50 offset p_offset)x;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(p_campaign,'client_links_view',p_customer,v_user);return data;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.client_tickets_for_store(p_campaign text, p_store uuid, p_customer text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; data jsonb;
begin
 v_user:=halloween_private.require_staff();perform halloween_private.require_store(p_store);if p_offset<0 or p_offset>100000 then raise exception 'Página inválida.';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id),'[]'::jsonb)into data from(
 select t.id,(select paid_at from halloween_private.payment_proofs where id=t.proof_id)paid_at,(select source_created_at from halloween_private.payment_proofs where id=t.proof_id)source_created_at,(select origin from halloween_private.payment_proofs where id=t.proof_id)emission_origin,t.customer,t.customer_id,t.purchase_ref,t.created_at,t.expires_at,t.amount_cents,t.loja_id,(select nome from public.lojas where id=t.loja_id)loja,t.replaces_coupon_id,
 case when not halloween_private.sale_valid(t.id)then 'revoked'when r.voided_at is not null then 'replaced'when r.id is not null then 'used'when t.expires_at<=clock_timestamp()then 'expired'else 'available'end status,
 halloween_private.coupon_json(r.id)result,encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex')token
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id left join halloween_private.coupons r on r.ticket_id=t.id
 left join halloween_private.coupons previous on previous.id=t.replaces_coupon_id left join halloween_private.tickets parent on parent.id=previous.ticket_id
 where t.campaign_id=p_campaign and (t.loja_id=p_store or c.test_mode) and coalesce(t.customer_id,'test:'||coalesce(parent.id,t.id)::text)=p_customer order by t.created_at desc,t.id limit 50 offset p_offset)x;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(p_campaign,'client_links_view',p_customer,v_user);return data;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.configure(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid; c halloween_private.campaigns; e jsonb; p halloween_private.products; v_qty integer; v_weight integer;
begin
 uid:=halloween_private.require_staff();select * into c from halloween_private.campaigns where id=p_campaign for update;if not found then raise exception 'Campanha não encontrada.';end if;
 if jsonb_typeof(p_products)is distinct from 'array'or jsonb_array_length(p_products)<>(select count(*)from halloween_private.products where campaign_id=c.id)
 or(select count(distinct(x->>'id')::integer)from jsonb_array_elements(p_products)x)<>jsonb_array_length(p_products)then raise exception 'Envie todos os produtos, sem duplicar.';end if;
 perform halloween_private.release_expired(c.id);
 for e in select * from jsonb_array_elements(p_products)loop
  select * into p from halloween_private.products where campaign_id=c.id and id=(e->>'id')::integer;
  if not found or e->>'quantity'is null or e->>'weight'is null or(e->>'quantity')!~'^\d{1,6}$'or(e->>'weight')!~'^\d{1,5}$'then raise exception 'Configuração inválida.';end if;
  v_qty:=(e->>'quantity')::integer;v_weight:=(e->>'weight')::integer;
  if(p.id in(12,13)and v_weight<>50)or v_qty>100000 or v_weight>10000 or(not p.unlimited and v_qty<p.quantity-p.remaining)then raise exception 'Confira quantidades; os raros mantêm chance de0,5 por cento.';end if;
  update halloween_private.products set quantity=case when p.unlimited then quantity else v_qty end,remaining=case when p.unlimited then remaining else remaining+v_qty-quantity end,weight=v_weight,enabled=coalesce((e->>'enabled')::boolean,p.enabled)where campaign_id=c.id and id=p.id;
 end loop;
 if(select sum(prize.weight)from halloween_private.products prize where prize.campaign_id=c.id)<>10000 then raise exception 'As chances base devem somar100 por cento.';end if;
 if p_active and(not coalesce(p_confirm,false)or not exists(select 1 from halloween_private.draw_pool(c.id)))then raise exception 'Confirme disponibilidade e quantidades antes de ativar.';end if;
 update halloween_private.campaigns set active=coalesce(p_active,false),stock_confirmed=coalesce(p_confirm,false)where id=c.id;
 insert into halloween_private.audit(campaign_id,action,actor)values(c.id,'configure',uid);return halloween_private.admin_state(c.id);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.confirm_sale_time(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid; d jsonb; t uuid; c halloween_private.campaigns;
begin
 u:=halloween_private.require_staff();if p_confirm is distinct from true then raise exception 'Confirme o horário do comprovante';end if;
 d:=halloween_private.sale_payment_proof(p_sale);if d->>'status'<>'needs_time'then raise exception 'Esta compra não precisa de conferência de horário ou não está quitada';end if;
 t:=halloween_private.issue_proof(p_campaign,'sale',p_sale,p_paid_at,array(select jsonb_array_elements_text(d->'receipt_ids')),'manual_time',u,btrim(p_reason));select * into c from halloween_private.campaigns where id=p_campaign;
 return jsonb_build_object('id',t,'expires_at',(select expires_at from halloween_private.tickets where id=t),'token',encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.coupon_json(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'id',r.id,'code',r.code,'offer',r.offer,'created_at',r.created_at,
  'expires_at',r.expires_at,'redeemed_at',r.redeemed_at,
  'pickup_store',case when l.id is not null then jsonb_build_object('name',l.nome,'whatsapp',l.whatsapp)else null end,
  'status',case when r.voided_at is not null then 'replaced'
   when not halloween_private.sale_valid(r.ticket_id)then 'revoked'
   when r.redeemed_at is not null then 'redeemed'
   when r.released_at is not null or r.expires_at<=clock_timestamp()then 'expired'
   else 'available'end)
 from halloween_private.coupons r
 join halloween_private.tickets t on t.id=r.ticket_id
 left join public.lojas l on l.id=t.loja_id
 where r.id=p_id
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.draw_pool(p_campaign text)
 RETURNS TABLE(product_id integer, chance_bps numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select * from halloween_private.draw_pool_for(p_campaign,'{}')$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.draw_pool_for(p_campaign text, p_excluded integer[])
 RETURNS TABLE(product_id integer, chance_bps numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$select * from halloween_private.draw_pool_for(p_campaign,p_excluded,null)$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.draw_pool_for(p_campaign text, p_excluded integer[], p_store uuid)
 RETURNS TABLE(product_id integer, chance_bps numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
with available as(select p.id,p.weight from halloween_private.products p where p.campaign_id=p_campaign and(p.id in(12,13)or(p.enabled and p.weight>0)) and not(p.id=any(coalesce(p_excluded,'{}')))and
case when p.id in(12,13)then exists(select 1 from halloween_private.store_prizes sp join halloween_private.margin_stores ms on ms.campaign_id=sp.campaign_id and ms.store_id=sp.store_id where sp.campaign_id=p_campaign and sp.store_id=p_store and sp.slot=p.id and sp.enabled and sp.remaining>0 and ms.unlocked_at is not null)else p.unlimited or p.remaining>0 end),totals as(select coalesce(sum(weight)filter(where id not in(12,13)),0)::numeric common,count(*)filter(where id in(12,13))*50 rare from available)
select a.id,case when a.id in(12,13)then 50::numeric else a.weight*(10000-t.rare)/nullif(t.common,0)end from available a cross join totals t where t.common>0
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.issue(p_campaign text, p_ref text, p_customer text, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid; t halloween_private.tickets; c halloween_private.campaigns; v_id uuid; v_token text; v_now timestamptz; v_ref text;
begin
 v_user:=halloween_private.require_staff();
 if not coalesce((select test_mode from halloween_private.campaigns where id=p_campaign),false) then raise exception 'Na campanha real, os giros são liberados automaticamente pelas vendas do Cloud.'; end if;
 if p_ref is null or length(btrim(p_ref)) not between 1 and 100 or p_customer is null or length(btrim(p_customer)) not between 1 and 80 or p_amount is null or p_amount<20000 or p_amount>100000000 then raise exception 'Informe compra, cliente e valor de pelo menos R$ 200.'; end if;
 v_ref:=regexp_replace(upper(btrim(p_ref)),'[^A-Z0-9]','','g');
 if length(v_ref)=0 then raise exception 'Informe um identificador válido para a compra.'; end if;
 select * into c from halloween_private.campaigns where id=p_campaign for update;
 if not found then raise exception 'Campanha não encontrada.'; end if;
 select * into t from halloween_private.tickets where campaign_id=c.id and purchase_ref=v_ref;
 if found then
  if t.customer<>btrim(p_customer) or t.amount_cents<>p_amount then raise exception 'Esta compra já foi cadastrada com outros dados.'; end if;
  insert into halloween_private.audit(campaign_id,action,object_id,actor) values(c.id,'issue_replay',t.id::text,v_user);
 else
  if not c.active then raise exception 'Ative a campanha antes de liberar giros.'; end if;
  v_id:=gen_random_uuid(); v_now:=clock_timestamp();
  v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
  insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,amount_cents,token_hash,created_at,expires_at,created_by)
  values(v_id,c.id,v_ref,btrim(p_customer),p_amount,encode(extensions.digest(v_token,'sha256'),'hex'),v_now,v_now+interval '48 hours',v_user) returning * into t;
  insert into halloween_private.audit(campaign_id,action,object_id,actor) values(c.id,'issue',t.id::text,v_user);
 end if;
 v_token:=encode(extensions.hmac(convert_to(t.id::text,'UTF8'),c.secret,'sha256'),'hex');
 return jsonb_build_object('id',t.id,'token',v_token,'expires_at',t.expires_at,'customer',t.customer,'test_mode',c.test_mode);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.issue_os_manual(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare u uuid; t uuid; c halloween_private.campaigns;
begin
 u:=halloween_private.require_staff();if p_confirm is distinct from true then raise exception 'Confirme a conferência dos recebimentos';end if;
 t:=halloween_private.issue_proof(p_campaign,'os',p_os,p_paid_at,p_receipts,'manual_os',u,btrim(p_reason));select * into c from halloween_private.campaigns where id=p_campaign;
 return jsonb_build_object('id',t,'expires_at',(select expires_at from halloween_private.tickets where id=t),'token',encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.issue_proof(p_campaign text, p_kind text, p_id uuid, p_paid timestamp with time zone, p_receipts text[], p_origin text, p_actor uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare c halloween_private.campaigns; d jsonb; p uuid; t uuid; token text; refs text[]; row_count integer; total numeric; day date;
begin
 select * into c from halloween_private.campaigns where id=p_campaign for update;if not found then raise exception 'Campanha não encontrada';end if;
 select id into t from halloween_private.tickets where campaign_id=c.id and replaces_coupon_id is null and(case when p_kind='sale'then sale_id=p_id else os_id=p_id end);if found then return t;end if;
 d:=halloween_private.source_data(p_kind,p_id);if d is null then raise exception 'Compra/OS sem cliente, loja ou estado elegível';end if;
 if halloween_private.proof_window(c.id,(d->>'created_at')::timestamptz,p_paid)is distinct from true then raise exception 'Compra e quitação precisam estar no período; as48h desde a quitação não podem ter terminado';end if;
 if p_origin<>'auto'and(p_actor is null or p_reason is null or length(btrim(p_reason))not between 5 and 300)then raise exception 'Informe motivo e operador';end if;
 select coalesce(array_agg(distinct x order by x),'{}')into refs from unnest(coalesce(p_receipts,'{}'))x;
 if cardinality(refs)<>coalesce(cardinality(p_receipts),0)or cardinality(refs)>20 then raise exception 'Recebimentos duplicados ou acima do limite20';end if;
 perform halloween_private.lock_financial(p_kind,p_id,refs);
 if halloween_private.source_data(p_kind,p_id)is distinct from d then raise exception 'Compra/OS alterada durante a conferência. Consulte novamente';end if;
 -- Locks prevent the selected receipts changing during issuance. Never write ERP.
 perform 1 from public.lancamentos where id=any(refs)order by id for share;
 if p_kind='sale'then
  if not halloween_private.sale_paid(p_id)then raise exception 'Compra ainda não quitada';end if;
  select count(*),max(halloween_private.receipt_day(data_pagamento))into row_count,day from public.lancamentos where id=any(refs)and venda_id=p_id and tipo='receber'and status='pago'and valor>0;
 else
  select count(*),sum(valor),max(halloween_private.receipt_day(data_pagamento))into row_count,total,day from public.lancamentos where id=any(refs)and venda_id is null and loja_id=(d->>'loja_id')::uuid and tipo='receber'and status='pago'and valor>0;
  if cardinality(refs)=0 or coalesce(total,0)<(d->>'amount')::numeric then raise exception 'Selecione recebimentos pagos suficientes da loja da OS';end if;
 end if;
 if row_count<>cardinality(refs)then raise exception 'Recebimento inexistente, cancelado ou incompatível';end if;
 if exists(select 1 from unnest(refs)r where halloween_private.receipt_claimed(c.id,r))then raise exception 'Recebimento já vinculado a outra participação nesta campanha';end if;
 if p_origin<>'auto'and(day is null or(p_paid at time zone 'America/Sao_Paulo')::date<>day)then raise exception 'Horário precisa corresponder ao dia registrado da quitação';end if;
 insert into halloween_private.payment_proofs(campaign_id,kind,source_id,source_created_at,paid_at,origin,loja_id,customer_id,amount,receipt_ids,evidence,actor,reason)
 values(c.id,p_kind,p_id,(d->>'created_at')::timestamptz,p_paid,p_origin,(d->>'loja_id')::uuid,d->>'customer_id',(d->>'amount')::numeric,refs,
 halloween_private.proof_evidence(p_kind,p_id,refs),p_actor,p_reason)returning id into p;
 insert into halloween_private.payment_claims(campaign_id,receipt_id,proof_id)select c.id,x,p from unnest(refs)x;
 t:=gen_random_uuid();token:=encode(extensions.hmac(convert_to(t::text,'UTF8'),c.secret,'sha256'),'hex');
 insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,os_id,loja_id,amount_cents,token_hash,created_at,expires_at,created_by,proof_id)
 values(t,c.id,upper(p_kind)||replace(p_id::text,'-',''),left(d->>'customer',80),d->>'customer_id',case when p_kind='sale'then p_id end,case when p_kind='os'then p_id end,(d->>'loja_id')::uuid,least(round((d->>'amount')::numeric*100),2147483647)::integer,encode(extensions.digest(token,'sha256'),'hex'),clock_timestamp(),p_paid+interval '48 hours',p_actor,p);
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,p_origin||'_'||p_kind||'_issue',t::text,p_actor);return t;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.link_store_prize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
begin if new.product_id in(12,13)then insert into halloween_private.store_reservations(coupon_id,campaign_id,store_id,slot)select new.id,new.campaign_id,t.loja_id,new.product_id from halloween_private.tickets t where t.id=new.ticket_id;end if;return new;end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.lock_financial(p_kind text, p_source uuid, p_refs text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
begin
 if p_kind='sale'then
  perform 1 from public.vendas where id=p_source for share;
  perform 1 from public.pagamentos_venda pv where venda_id=p_source order by created_at,valor,status,to_jsonb(pv)->>'id'for share;
 else
  perform 1 from public.ordens_servico where id=p_source for share;
 end if;
 perform 1 from public.lancamentos l where case when p_refs is not null then l.id=any(p_refs)
 when p_kind='sale'then l.venda_id=p_source else exists(select 1 from public.ordens_servico o where o.id=p_source and l.venda_id is null and l.descricao='Recebimento OS #'||o.numero::text)end order by l.id for share;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.lookup(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r halloween_private.coupons; t halloween_private.tickets; v_test boolean;
begin
 perform halloween_private.require_staff();
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));
 if not found then raise exception 'Código não encontrado.'; end if;
 select * into t from halloween_private.tickets where id=r.ticket_id;
 select test_mode into v_test from halloween_private.campaigns where id=r.campaign_id;
 return jsonb_build_object('customer',t.customer,'purchase_ref',t.purchase_ref,'test_mode',v_test,'result',halloween_private.coupon_json(r.id));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.margin_effective(p_campaign text)
 RETURNS TABLE(sale_id uuid, item_id uuid, store_id uuid, product_id text, quantity numeric, revenue numeric, cost numeric, margin numeric, pending boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
with source as(select m.*,v.status,
coalesce((select sum(i.quantidade)from public.devolucoes d join public.itens_devolucao i on i.devolucao_id=d.id where d.venda_id=m.sale_id and d.status='concluida'and i.produto_id=m.product_id),0) returned,
exists(select 1 from public.devolucoes d where d.venda_id=m.sale_id and d.status='concluida'and not exists(select 1 from public.itens_devolucao i where i.devolucao_id=d.id)) unknown_return
from halloween_private.margin_items m join public.vendas v on v.id=m.sale_id where m.campaign_id=p_campaign),amounts as(select *,case when status in('cancelada','cancelado') then 0 else greatest(0,quantity-returned)end qty from source),net as(select *,case when qty=0 then 0 else revenue-round(revenue*(quantity-qty)/quantity,2)end rev,case when qty=0 then 0 else round(unit_cost*quantity,2)-round(round(unit_cost*quantity,2)*(quantity-qty)/quantity,2)end cmv from amounts)
select sale_id,item_id,store_id,product_id,qty,rev,cmv,rev-cmv,(unit_cost is null or unit_cost<=0 or returned>quantity or returned<0 or unknown_return or status not in('concluida','cancelada','cancelado')or(status not in('cancelada','cancelado')and not halloween_private.sale_paid(sale_id)))from net
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.margin_reconcile(p_campaign text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
begin
 perform pg_advisory_xact_lock(hashtext('halloween-margin:'||p_campaign));
 insert into halloween_private.margin_stores(campaign_id,store_id,total,pending,last_sync_at)
 select p_campaign,l.id,coalesce(sum(e.margin)filter(where not e.pending),0),count(e.item_id)filter(where e.pending),clock_timestamp()from public.lojas l left join halloween_private.margin_effective(p_campaign)e on e.store_id=l.id group by l.id
 on conflict(campaign_id,store_id)do update set total=excluded.total,pending=excluded.pending,last_sync_at=excluded.last_sync_at;
 update halloween_private.margin_stores set unlocked_at=clock_timestamp(),unlocked_margin=total where campaign_id=p_campaign and unlocked_at is null and total>=700 and pending=0;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.margin_window(p_campaign text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
select coalesce((select c.active and (c.starts_at is null or clock_timestamp()>=c.starts_at)and(c.ends_at is null or clock_timestamp()<c.ends_at+interval '48 hours' or exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.revoked_at is null and t.expires_at>clock_timestamp())or exists(select 1 from halloween_private.coupons r where r.campaign_id=c.id and r.voided_at is null and r.redeemed_at is null and r.released_at is null and r.expires_at>clock_timestamp()))from halloween_private.campaigns c where c.id=p_campaign),false)
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.paid_os(p_os uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',o.id,'customer_id',o.pessoa_id,'customer',p.nome,'amount',o.total,'received_at',o.recebido_em,'loja_id',receipt.loja_id)
 from public.ordens_servico o join public.pessoas p on p.id=o.pessoa_id and nullif(btrim(p.nome),'')is not null
 cross join lateral(select min(l.loja_id::text)::uuid loja_id from public.lancamentos l
 where l.tipo='receber'and l.status='pago'and l.valor>=o.total and l.descricao='Recebimento OS #'||o.numero::text
 and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id is not null
 and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes'
 having count(*)=1)receipt
 join public.lojas loja on loja.id=receipt.loja_id and loja.ativa
 where o.id=p_os and o.status='entregue'and o.recebido_em is not null and o.total>=200
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.payment_pending(p_campaign text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c halloween_private.campaigns; rows jsonb;
begin
 perform halloween_private.require_staff();if p_offset<0 or p_offset>10000 then raise exception 'Página inválida';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at,x.id),'[]')into rows from(
 select v.id,v.numero,v.created_at,pr.data->>'payment_day'payment_day from public.vendas v
 cross join lateral(select halloween_private.sale_payment_proof(v.id)data)pr
 where v.created_at>=coalesce(c.starts_at,clock_timestamp()-interval '7 days')and v.created_at<coalesce(c.ends_at,clock_timestamp()+interval '1 second')
 and pr.data->>'status'='needs_time'and halloween_private.source_data('sale',v.id)is not null
 and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=v.id and t.replaces_coupon_id is null)
 order by v.created_at,v.id limit 51 offset p_offset)x;
 return rows;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.payment_review(p_campaign text, p_kind text, p_number integer, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare c halloween_private.campaigns; src uuid; d jsonb; receipts jsonb; proof jsonb;
begin
 perform halloween_private.require_staff();
 if p_kind not in('sale','os')or p_number is null or p_number<1 or p_offset<0 or p_offset>10000 then raise exception 'Informe tipo, número e página válidos';end if;
 select * into c from halloween_private.campaigns where id=p_campaign;if not found then raise exception 'Campanha não encontrada';end if;
 if p_kind='sale'then select id into src from public.vendas where numero=p_number;else select id into src from public.ordens_servico where numero=p_number;end if;
 d:=halloween_private.source_data(p_kind,src);if d is null then raise exception 'Compra/OS inexistente ou sem cliente, loja ou situação elegível';end if;
 if(c.starts_at is not null and(d->>'created_at')::timestamptz<c.starts_at)or(c.ends_at is not null and(d->>'created_at')::timestamptz>=c.ends_at)then raise exception 'A abertura/compra está fora do período da campanha';end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at,x.id),'[]')into receipts from(
 select l.id,l.valor,l.descricao,l.created_at,halloween_private.receipt_day(l.data_pagamento)payment_day,
 halloween_private.receipt_claimed(c.id,l.id)claimed
 from public.lancamentos l where l.tipo='receber'and l.status='pago'and l.valor>0
 and(case when p_kind='sale'then l.venda_id=src else l.venda_id is null and l.loja_id=(d->>'loja_id')::uuid end)
 and halloween_private.receipt_day(l.data_pagamento)>=((coalesce(c.starts_at,clock_timestamp()-interval '7 days'))at time zone 'America/Sao_Paulo')::date
 and halloween_private.receipt_day(l.data_pagamento)<=((coalesce(c.ends_at,clock_timestamp()+interval '1 day')-interval '1 microsecond')at time zone 'America/Sao_Paulo')::date
 order by l.created_at,l.id limit 51 offset p_offset)x;
 if p_kind='sale'then proof:=halloween_private.sale_payment_proof(src);end if;
 return jsonb_build_object('source',d,'payment',proof,'receipts',receipts,'offset',p_offset,'existing_ticket',(
 select t.id from halloween_private.tickets t where t.campaign_id=c.id and t.replaces_coupon_id is null and(case when p_kind='sale'then t.sale_id=src else t.os_id=src end)));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.payment_timestamp(p_value text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 if p_value is null or p_value!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'then return null;end if;
 if p_value~'(Z|[+-]\d{2}:?\d{2})$'then return p_value::timestamptz;end if;
 return p_value::timestamp at time zone 'America/Sao_Paulo';
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.proof_evidence(p_kind text, p_source uuid, p_refs text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'amount',l.valor,'payment_date_epoch',extract(epoch from l.data_pagamento),'history',l.historico_pagamentos)order by l.id),'[]')from public.lancamentos l where l.id=any(p_refs)),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(pv)->>'id','amount',pv.valor,'fee',pv.taxa,'status',pv.status,'created_at_epoch',extract(epoch from pv.created_at))order by pv.created_at,pv.valor,pv.status,to_jsonb(pv)->>'id'),'[]')from public.pagamentos_venda pv where p_kind='sale'and pv.venda_id=p_source),
 'source_received_epoch',(select extract(epoch from o.recebido_em) from public.ordens_servico o where p_kind='os'and o.id=p_source))
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.proof_valid(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p halloween_private.payment_proofs; d jsonb; receipts_ok boolean;
begin
 select * into p from halloween_private.payment_proofs where id=p_id;if not found then return false;end if;
 d:=halloween_private.source_data(p.kind,p.source_id);
 if d is null or d->>'customer_id'<>p.customer_id or(d->>'amount')::numeric<>p.amount or(d->>'loja_id')::uuid<>p.loja_id or(d->>'created_at')::timestamptz is distinct from p.source_created_at then return false;end if;
 if halloween_private.proof_evidence(p.kind,p.source_id,p.receipt_ids)is distinct from p.evidence then return false;end if;
 select count(*)=cardinality(p.receipt_ids)into receipts_ok from public.lancamentos l where l.id=any(p.receipt_ids)and l.tipo='receber'and l.status='pago'and l.valor>0
 and(case when p.kind='sale'then l.venda_id=p.source_id else l.venda_id is null and l.loja_id=p.loja_id end);
 if not receipts_ok then return false;end if;
 if p.kind='sale'then return halloween_private.sale_paid(p.source_id);end if;
 return cardinality(p.receipt_ids)>0 and(select coalesce(sum(valor),0)>=p.amount from public.lancamentos where id=any(p.receipt_ids));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.proof_window(p_campaign text, p_created timestamp with time zone, p_paid timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(c.active and c.stock_confirmed and p_paid>=p_created and p_paid<=p_now and p_paid+interval '48 hours'>p_now
 and(c.starts_at is null or(p_created>=c.starts_at and p_paid>=c.starts_at))and(c.ends_at is null or(p_created<c.ends_at and p_paid<c.ends_at))
 and exists(select 1 from halloween_private.sale_windows w where w.campaign_id=c.id and p_created>=w.started_at and(w.ended_at is null or p_created<w.ended_at)),false)
 from halloween_private.campaigns c where c.id=p_campaign
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.receipt_claimed(p_campaign text, p_receipt text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from halloween_private.payment_claims where campaign_id=p_campaign and receipt_id=p_receipt)
 or exists(select 1 from halloween_private.tickets t join public.ordens_servico o on o.id=t.os_id join public.lancamentos l on l.id=p_receipt
 where t.campaign_id=p_campaign and t.proof_id is null and t.replaces_coupon_id is null and l.venda_id is null
 and l.descricao='Recebimento OS #'||o.numero::text and l.pessoa_nome is not distinct from o.pessoa_nome
 and l.loja_id=t.loja_id and l.valor>=o.total and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes')
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.receipt_day(p_value timestamp with time zone)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when(p_value at time zone 'UTC')::time='00:00:00'then(p_value at time zone 'UTC')::date else(p_value at time zone 'America/Sao_Paulo')::date end
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.redeem(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$select halloween_private.redeem_at(p_code,null)$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.redeem_at(p_code text, p_loja uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare v_user uuid; r halloween_private.coupons; t halloween_private.tickets; c halloween_private.campaigns;
begin
 v_user:=halloween_private.require_staff();select * into r from halloween_private.coupons where code=upper(btrim(p_code));if not found then raise exception 'Código não encontrado.';end if;
 -- A short shared read lock keeps cancellation from racing this redemption.
 -- No payment, till or ERP stock record is changed.
 
 select * into c from halloween_private.campaigns where id=r.campaign_id for update;
perform 1 from public.vendas v join halloween_private.tickets source on source.sale_id=v.id where source.id=r.ticket_id for share of v;
 perform 1 from public.ordens_servico o join halloween_private.tickets source on source.os_id=o.id where source.id=r.ticket_id for share of o;
 select * into r from halloween_private.coupons where id=r.id for update;select * into t from halloween_private.tickets where id=r.ticket_id;
 if r.voided_at is not null then raise exception 'Este cupom foi cancelado para devolver um giro e não pode ser usado.';end if;
 if not c.test_mode and(t.loja_id is null or p_loja is distinct from t.loja_id)then raise exception 'Resgate permitido somente na loja da compra. Confira a unidade.';end if;
 perform halloween_private.lock_financial(case when t.sale_id is not null then 'sale' else 'os' end,coalesce(t.sale_id,t.os_id),(select receipt_ids from halloween_private.payment_proofs where id=t.proof_id));
if not halloween_private.sale_valid(t.id)then raise exception 'Compra não paga ou inelegível. Vale bloqueado.';end if;
 if r.redeemed_at is not null then return halloween_private.coupon_json(r.id);end if;
 if r.expires_at<=clock_timestamp()or r.released_at is not null then raise exception 'Este vale venceu e não pode ser resgatado.';end if;
 update halloween_private.coupons set redeemed_at=clock_timestamp(),redeemed_by=v_user where id=r.id;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,'redeem',r.id::text,v_user);return halloween_private.coupon_json(r.id);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.reissue(p_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare v_user uuid; r halloween_private.coupons; t halloween_private.tickets; child halloween_private.tickets; c halloween_private.campaigns; v_id uuid; v_token text; v_now timestamptz;
begin
 v_user:=halloween_private.require_staff();
 if p_reason is null or length(btrim(p_reason))not between 5 and 300 then raise exception 'Informe o motivo da indisponibilidade (5 a 300 caracteres).';end if;
 select * into r from halloween_private.coupons where code=upper(btrim(p_code));if not found then raise exception 'Código não encontrado.';end if;
 select * into c from halloween_private.campaigns where id=r.campaign_id for update;
 select * into r from halloween_private.coupons where id=r.id for update;
 select * into t from halloween_private.tickets where id=r.ticket_id for update;
 select * into child from halloween_private.tickets where replaces_coupon_id=r.id;
 if not found then
  if r.redeemed_at is not null then raise exception 'Vale já resgatado. Não é possível devolver este giro.';end if;
  if r.voided_at is not null or r.released_at is not null or r.expires_at<=clock_timestamp()then raise exception 'Vale cancelado ou vencido. Solicite revisão à administração.';end if;
  perform halloween_private.lock_financial(case when t.sale_id is not null then 'sale' else 'os' end,coalesce(t.sale_id,t.os_id),(select receipt_ids from halloween_private.payment_proofs where id=t.proof_id));
if not halloween_private.sale_valid(t.id)then raise exception 'Compra inelegível. Não é possível devolver este giro.';end if;
  v_now:=clock_timestamp();v_id:=gen_random_uuid();v_token:=encode(extensions.hmac(convert_to(v_id::text,'UTF8'),c.secret,'sha256'),'hex');
  update halloween_private.coupons set voided_at=v_now,voided_by=v_user,void_reason=btrim(p_reason),released_at=v_now where id=r.id;
  if not coalesce((r.offer->>'unlimited_units')::boolean,false) and r.released_at is null and not exists(select 1 from halloween_private.store_reservations s where s.coupon_id=r.id)then
   update halloween_private.products set remaining=remaining+1 where campaign_id=c.id and id=r.product_id and not unlimited;
  end if;
  insert into halloween_private.tickets(id,campaign_id,purchase_ref,customer,customer_id,sale_id,os_id,loja_id,amount_cents,token_hash,created_at,expires_at,created_by,replaces_coupon_id,excluded_products,proof_id)
  values(v_id,c.id,'RETRY'||replace(r.id::text,'-',''),t.customer,coalesce(t.customer_id,'test:'||t.id::text),t.sale_id,t.os_id,t.loja_id,t.amount_cents,encode(extensions.digest(v_token,'sha256'),'hex'),v_now,v_now+interval '48 hours',v_user,r.id,
  array(select distinct unnest(t.excluded_products||r.product_id)),t.proof_id)returning * into child;
  insert into halloween_private.audit(campaign_id,action,object_id,actor)values(c.id,'coupon_replaced',r.id::text,v_user);
 end if;
 return jsonb_build_object('id',child.id,'expires_at',child.expires_at,'customer',child.customer,'token',encode(extensions.hmac(convert_to(child.id::text,'UTF8'),c.secret,'sha256'),'hex'),'test_mode',c.test_mode);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.release_expired(p_campaign text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
begin
 with released as(update halloween_private.coupons set released_at=clock_timestamp() where campaign_id=p_campaign and redeemed_at is null and released_at is null and expires_at<=clock_timestamp()returning id,product_id),counts as(select product_id,count(*)::integer qty from released r where not exists(select 1 from halloween_private.store_reservations s where s.coupon_id=r.id)group by product_id)
 update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=p_campaign and p.id=x.product_id and not p.unlimited;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.require_staff()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_user uuid:=auth.uid();
begin
 if v_user is null or not exists(select 1 from halloween_private.staff s join public.perfis p on p.id=s.user_id where s.user_id=v_user and s.enabled and p.ativo is distinct from false)
 or not exists(select 1 from auth.sessions s where s.user_id=v_user and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then
  raise exception 'Acesso restrito à equipe autorizada.' using errcode='42501';
 end if;
 return v_user;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.require_store(p_store uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid; profile jsonb; allowed jsonb;
begin
 actor:=halloween_private.require_staff();
  if p_store is null or not exists(select 1 from public.lojas where id=p_store and ativa)then raise exception 'Selecione uma loja ativa.' using errcode='42501';end if;
   select to_jsonb(p)into profile from public.perfis p where id=actor;allowed:=coalesce(nullif(profile->'lojas_permitidas','null'::jsonb),'[]'::jsonb);
    if not coalesce((profile->>'is_master')::boolean,false)and coalesce(jsonb_array_length(allowed),0)>0 and not(allowed ? p_store::text)then raise exception 'Sem acesso a esta loja.' using errcode='42501';end if;
    end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.reserve_store_prize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare store uuid;s halloween_private.store_prizes;
begin
 if new.product_id not in(12,13)then return new;end if;
 select loja_id into store from halloween_private.tickets where id=new.ticket_id;
 select * into s from halloween_private.store_prizes where campaign_id=new.campaign_id and store_id=store and slot=new.product_id for update;
 if not found or not s.enabled or s.remaining<1 or not exists(select 1 from halloween_private.margin_stores where campaign_id=new.campaign_id and store_id=store and unlocked_at is not null)then raise exception 'Prêmio indisponível nesta loja';end if;
 update halloween_private.store_prizes set remaining=remaining-1 where campaign_id=s.campaign_id and store_id=s.store_id and slot=s.slot;
 new.offer:=jsonb_build_object('id',s.slot,'name',s.name,'code',s.code,'benefit_type','percent','benefit_value',100,'unlimited_units',false,'loja_id',store,'loja',(select nome from public.lojas where id=store));
 return new;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.resolve_ticket(p_token text)
 RETURNS halloween_private.tickets
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t halloween_private.tickets; next_ticket halloween_private.tickets; n integer:=0;
begin
 if p_token is null or p_token!~'^[a-f0-9]{64}$'then raise exception 'Link de giro inválido.';end if;
 select * into t from halloween_private.tickets where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Link de giro inválido.';end if;
 loop
  select child.* into next_ticket from halloween_private.tickets child join halloween_private.coupons r on r.id=child.replaces_coupon_id where r.ticket_id=t.id;
  exit when not found;
  t:=next_ticket;n:=n+1;if n>100 then raise exception 'Solicite à loja uma revisão deste giro.';end if;
 end loop;
 return t;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.return_store_prize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare r halloween_private.store_reservations;
begin
 if old.released_at is null and new.released_at is not null and new.redeemed_at is null then
 update halloween_private.store_reservations set released_at=new.released_at where coupon_id=new.id and released_at is null returning * into r;
 if found then update halloween_private.store_prizes set remaining=remaining+1 where campaign_id=r.campaign_id and store_id=r.store_id and slot=r.slot;end if;
 end if;return new;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.sale_paid(p_sale uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.vendas v where v.id=p_sale and v.status='concluida'
 and not exists(select 1 from public.lancamentos l where l.venda_id=v.id and l.tipo='receber' and l.status is distinct from 'cancelado' and l.status is distinct from 'pago' and round(coalesce(l.valor,0)-coalesce(l.valor_pago,0),2)>0)
 -- Credit is consumed separately. Payments and ledger receipts describe the
 -- same money, so use their maximum rather than counting both copies.
 and coalesce((select sum(p.valor) from public.pagamentos_venda p where p.venda_id=v.id and p.status='vale'),0)
 +greatest(coalesce((select sum(p.valor+coalesce(p.taxa,0)) from public.pagamentos_venda p where p.venda_id=v.id and p.status='pago'),0),
 coalesce((select sum(case when l.status='pago' then l.valor else coalesce(l.valor_pago,0) end) from public.lancamentos l where l.venda_id=v.id and l.tipo='receber' and l.status is distinct from 'cancelado'),0))>=v.total)
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.sale_payment_proof(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.vendas; l record; e record; money numeric; credit numeric; covered numeric; accum numeric; at_time timestamptz; event_at timestamptz; paid timestamptz; refs text[]; day date; ambiguous boolean:=false;
begin
 select * into v from public.vendas where id=p_id;
 if not found or not halloween_private.sale_paid(p_id)then return jsonb_build_object('status','unpaid');end if;
 select coalesce(sum(valor)filter(where status='vale'),0),coalesce(sum(valor+coalesce(taxa,0))filter(where status='pago'),0),max(created_at)filter(where status in('vale','pago'))into credit,money,paid from public.pagamentos_venda where venda_id=p_id;
 select coalesce(array_agg(id order by id),'{}'),max(halloween_private.receipt_day(data_pagamento))into refs,day from public.lancamentos where venda_id=p_id and tipo='receber'and status='pago'and valor>0;
 if exists(select 1 from public.pagamentos_venda where venda_id=p_id and status in('vale','pago')and created_at is null)then ambiguous:=true;end if;
 if money+credit<v.total then
  covered:=credit;
  for l in select * from public.lancamentos where venda_id=p_id and tipo='receber'and status='pago'and valor>0 order by created_at,id loop
   accum:=0;at_time:=null;
   for e in select (x->>'valor')::numeric amount,halloween_private.payment_timestamp(x->>'data')ts from jsonb_array_elements(case when jsonb_typeof(l.historico_pagamentos)='array'then l.historico_pagamentos else '[]'::jsonb end)x where coalesce(x->>'valor','')~'^\d+(\.\d+)?$'order by halloween_private.payment_timestamp(x->>'data')nulls last loop
    if accum>=l.valor then exit;end if;
    if e.amount>0 then accum:=accum+e.amount;if e.ts is null then ambiguous:=true;else at_time:=greatest(at_time,e.ts);end if;end if;
   end loop;
   if accum<l.valor then
    -- An initial receipt may be duplicated in the checkout payment rows.
    if accum=0 and coalesce(l.valor_pago,0)=0 and money>=l.valor and l.created_at between v.created_at and v.created_at+interval '10 minutes'then
     money:=money-l.valor;at_time:=paid;
    else ambiguous:=true;end if;
   end if;
   covered:=covered+l.valor;paid:=greatest(paid,at_time);
  end loop;
  if covered<v.total then return jsonb_build_object('status','unpaid');end if;
 end if;
 if paid is null or paid<v.created_at or paid>clock_timestamp()then ambiguous:=true;end if;
 return jsonb_build_object('status',case when ambiguous then 'needs_time'else 'ready'end,'paid_at',case when not ambiguous then paid end,'receipt_ids',refs,'payment_day',day);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.sale_valid(p_ticket uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select t.revoked_at is null and case when t.proof_id is null then halloween_private.sale_valid_legacy(t.id)else halloween_private.proof_valid(t.proof_id)end from halloween_private.tickets t where t.id=p_ticket
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.sale_valid_legacy(p_ticket uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select t.revoked_at is null and (c.test_mode or(t.sale_id is not null and halloween_private.sale_paid(t.sale_id) and exists(
 select 1 from public.vendas v where v.id=t.sale_id and v.status='concluida' and v.total>=200 and v.pessoa_id=t.customer_id and not coalesce(v.uso_interno,false) and v.ml_order_id is null))
 or coalesce(t.os_id is not null and halloween_private.paid_os(t.os_id)->>'customer_id'=t.customer_id,false))
 from halloween_private.tickets t join halloween_private.campaigns c on c.id=t.campaign_id where t.id=p_ticket
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.set_coupon_validity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 new.expires_at:=new.created_at+interval '168 hours';
 return new;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.source_data(p_kind text, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',s.id,'kind','sale','created_at',s.created_at,'customer_id',s.pessoa_id,'customer',p.nome,'amount',s.total,'loja_id',l.id,'loja',l.nome,'status',s.status)
 from public.vendas s join public.pessoas p on p.id=s.pessoa_id join public.depositos d on d.id=s.deposito_id join public.lojas l on l.id=d.loja_id and l.ativa
 where p_kind='sale'and s.id=p_id and s.status='concluida'and s.total>=200 and not coalesce(s.uso_interno,false)and s.ml_order_id is null and nullif(btrim(p.nome),'')is not null
 union all
 select jsonb_build_object('id',o.id,'kind','os','created_at',o.created_at,'customer_id',o.pessoa_id,'customer',p.nome,'amount',o.total,'loja_id',l.id,'loja',l.nome,'status',o.status)
 from public.ordens_servico o join public.pessoas p on p.id=o.pessoa_id join public.depositos d on d.id=o.deposito_id join public.lojas l on l.id=d.loja_id and l.ativa
 where p_kind='os'and o.id=p_id and o.status='entregue'and o.total>=200 and nullif(btrim(p.nome),'')is not null
$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.spin(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid; p halloween_private.products; v_pick record; v_ticket double precision; v_total numeric; v_now timestamptz;
begin
 t:=halloween_private.resolve_ticket(p_token);
 -- Campaign mutex precedes bounded shared locks on financial evidence.
 select * into c from halloween_private.campaigns where id=t.campaign_id for update;
 t:=halloween_private.resolve_ticket(p_token);
 perform 1 from halloween_private.tickets where id=t.id for update;
 perform halloween_private.lock_financial(case when t.sale_id is not null then 'sale' else 'os' end,coalesce(t.sale_id,t.os_id),(select receipt_ids from halloween_private.payment_proofs where id=t.proof_id));
if not halloween_private.sale_valid(t.id)then raise exception 'Esta compra não está paga ou deixou de atender às regras. Consulte a loja.';end if;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 if r is not null then return halloween_private.coupon_json(r);end if;
 v_now:=clock_timestamp();
 if t.expires_at<=v_now then raise exception 'Seu prazo para girar terminou.';end if;
 if not c.active or(c.starts_at is not null and v_now<c.starts_at)then raise exception 'A campanha ainda não está liberada. Consulte a loja.';end if;
 perform halloween_private.release_expired(c.id);
 select coalesce(sum(chance_bps),0)into v_total from halloween_private.draw_pool_for(c.id,t.excluded_products,t.loja_id);
 if v_total=0 then raise exception 'Sem ofertas disponíveis para este giro. Ele não foi consumido; consulte a loja.';end if;
 v_ticket:=('x'||encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint/4294967296.0*v_total;
 for v_pick in select * from halloween_private.draw_pool_for(c.id,t.excluded_products,t.loja_id)order by product_id loop
  v_ticket:=v_ticket-v_pick.chance_bps;
  if v_ticket<0 then select * into p from halloween_private.products where campaign_id=c.id and id=v_pick.product_id;exit;end if;
 end loop;
 if not p.unlimited and p.id not in(12,13)then update halloween_private.products set remaining=remaining-1 where campaign_id=c.id and id=p.id;end if;
 insert into halloween_private.coupons(ticket_id,campaign_id,product_id,offer,code,created_at,expires_at)
 values(t.id,c.id,p.id,jsonb_build_object('id',p.id,'name',p.name,'benefit_type',p.benefit_type,'benefit_value',p.benefit_value,'unlimited_units',p.unlimited,'loja_id',t.loja_id,'loja',(select nome from public.lojas where id=t.loja_id)),
 'TC-'||upper(encode(extensions.gen_random_bytes(12),'hex')),v_now,v_now+interval '48 hours')returning id into r;
 insert into halloween_private.audit(campaign_id,action,object_id)values(c.id,'spin',r::text);
 return halloween_private.coupon_json(r);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.surprise_catalog(p_catalog jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select p_catalog||jsonb_build_object('products',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id'))from jsonb_array_elements(p_catalog->'products')x),'[]'))$function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.sync_sales()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
AS $function$
declare c halloween_private.campaigns; s record; n integer:=0;
begin
 for c in select * from halloween_private.campaigns where not test_mode for update skip locked loop
  begin
   update halloween_private.tickets t set revoked_at=clock_timestamp(),revoked_reason='Compra ou comprovação financeira inválida'where t.campaign_id=c.id and t.revoked_at is null and not halloween_private.sale_valid(t.id);
   with released as(update halloween_private.coupons r set released_at=clock_timestamp()from halloween_private.tickets t where r.ticket_id=t.id and t.campaign_id=c.id and t.revoked_at is not null and r.redeemed_at is null and r.released_at is null returning r.id,r.product_id),
   counts as(select product_id,count(*)::integer qty from released r where not exists(select 1 from halloween_private.store_reservations sr where sr.coupon_id=r.id)group by product_id)
   update halloween_private.products p set remaining=p.remaining+x.qty from counts x where p.campaign_id=c.id and p.id=x.product_id and not p.unlimited;
   perform halloween_private.release_expired(c.id);
   if c.active and c.stock_confirmed then
    for s in select to_jsonb(v)data,p.nome from public.vendas v join public.pessoas p on p.id=v.pessoa_id
    cross join lateral(select halloween_private.sale_payment_proof(v.id)proof)pr
    where v.status='concluida'and v.total>=200 and(c.starts_at is null or v.created_at>=c.starts_at)and(c.ends_at is null or v.created_at<c.ends_at)
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.sale_id=v.id and t.replaces_coupon_id is null)
    and pr.proof->>'status'='ready'and halloween_private.proof_window(c.id,v.created_at,(pr.proof->>'paid_at')::timestamptz)
    and halloween_private.source_data('sale',v.id)is not null order by v.created_at,v.id limit 200 loop
     if halloween_private.capture_sale(c.id,s.data,s.nome)is not null then n:=n+1;end if;
    end loop;
    for s in select o.id from public.ordens_servico o where o.status='entregue'and o.total>=200
    and(c.starts_at is null or o.created_at>=c.starts_at)and(c.ends_at is null or o.created_at<c.ends_at)
    and not exists(select 1 from halloween_private.tickets t where t.campaign_id=c.id and t.os_id=o.id and t.replaces_coupon_id is null)
    and halloween_private.source_data('os',o.id)is not null
    and exists(select 1 from public.lancamentos l where l.venda_id is null and l.tipo='receber'and l.status='pago'and l.descricao='Recebimento OS #'||o.numero::text and l.valor>=o.total and l.pessoa_nome is not distinct from o.pessoa_nome and l.loja_id=(halloween_private.source_data('os',o.id)->>'loja_id')::uuid and l.created_at between o.recebido_em-interval '1 minute'and o.recebido_em+interval '10 minutes'and not halloween_private.receipt_claimed(c.id,l.id))
    and halloween_private.proof_window(c.id,o.created_at,(halloween_private.paid_os(o.id)->>'received_at')::timestamptz)
    order by o.created_at,o.id limit 200 loop
     if halloween_private.capture_os(c.id,s.id)is not null then n:=n+1;end if;
    end loop;
   end if;
   update halloween_private.campaigns set last_sync_at=clock_timestamp(),sync_error=null where id=c.id;
  exception when others then update halloween_private.campaigns set sync_error='Falha na conferência. Tente novamente ou solicite revisão.'where id=c.id;end;
 end loop;return n;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION halloween_private.ticket(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t halloween_private.tickets; c halloween_private.campaigns; r uuid;
begin
 t:=halloween_private.resolve_ticket(p_token); select * into c from halloween_private.campaigns where id=t.campaign_id;
 select id into r from halloween_private.coupons where ticket_id=t.id;
 return jsonb_build_object('campaign',halloween_private.catalog_for(c.id,t.excluded_products,t.loja_id),'customer',t.customer,'expires_at',t.expires_at,'server_time',clock_timestamp(),'loja_id',t.loja_id,
 'loja',(select nome from public.lojas where id=t.loja_id),'replacement',t.replaces_coupon_id is not null,
 'status',case when not halloween_private.sale_valid(t.id)then 'revoked' when r is not null then 'used' when t.expires_at<=clock_timestamp()then 'expired' when not c.active or(c.starts_at is not null and clock_timestamp()<c.starts_at)then 'paused' else 'available'end,'result',halloween_private.coupon_json(r));
end $function$;

-- routines
CREATE OR REPLACE FUNCTION public._audit_teste()
 RETURNS integer
 LANGUAGE sql
AS $function$ select 1 $function$;

-- routines
CREATE OR REPLACE FUNCTION public.aplicar_caixa_sige(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text DEFAULT 'Dinheiro'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_caixa_id uuid;
  v_mov_id   uuid;
begin
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'caixa' and sige_id = p_sige_id and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  if p_tipo = 'abertura' then
    if exists (select 1 from caixas where loja_id = p_loja_id and status = 'aberto') then
      raise exception 'caixa aberto já existe nesta loja (duplicado de abertura)';
    end if;
    insert into caixas (sige_caixa_id, status, valor_abertura, loja_id, aberto_em, obs_abertura)
    values (p_caixa_sige, 'aberto', coalesce(p_valor, 0), p_loja_id, coalesce(p_data, now()), 'SIGE')
    returning id into v_caixa_id;

  elsif p_tipo = 'fechamento' then
    select id into v_caixa_id
    from caixas
    where sige_caixa_id = p_caixa_sige and status = 'aberto'
    order by aberto_em desc
    limit 1
    for update;
    if v_caixa_id is null then
      raise exception 'caixa aberto não encontrado para fechar (ordem trocada?)';
    end if;
    update caixas
    set status = 'fechado', fechado_em = coalesce(p_data, now()), obs_fechamento = 'SIGE'
    where id = v_caixa_id;

  elsif p_tipo in ('sangria', 'reforco') then
    select id into v_caixa_id
    from caixas
    where sige_caixa_id = p_caixa_sige and status = 'aberto'
    order by aberto_em desc
    limit 1
    for update;
    if v_caixa_id is null then
      raise exception 'caixa aberto não encontrado para movimento (ordem trocada?)';
    end if;
    insert into movimentos_caixa (caixa_id, tipo, motivo, forma_pagamento, valor)
    values (
      v_caixa_id,
      case when p_tipo = 'sangria' then 'retirada' else 'reforco' end,
      nullif(p_motivo, ''),
      coalesce(nullif(p_forma, ''), 'Dinheiro'),
      coalesce(p_valor, 0)
    )
    returning id into v_mov_id;

  else
    raise exception 'tipo de caixa desconhecido: %', p_tipo;
  end if;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('caixa', p_sige_id, p_loja, coalesce(v_caixa_id, v_mov_id)::text, coalesce(p_sequencia, 0), now());

  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'caixa', p_sige_id, p_loja, p_tipo, 'ok', coalesce(p_motivo, ''));

  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'caixa_id', v_caixa_id);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.aplicar_desconto_fiado(p_lancamento_id text, p_desconto numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valor numeric;
  v_pago numeric;
  v_restante numeric;
  v_aplicado numeric;
  v_novo numeric;
  v_quitado boolean;
begin
  select valor, coalesce(valor_pago, 0) into v_valor, v_pago
  from lancamentos where id = p_lancamento_id and tipo = 'receber' and status = 'pendente' for update;
  if not found then raise exception 'Lançamento não encontrado ou já quitado.'; end if;
  v_restante := round(v_valor - v_pago, 2);
  v_aplicado := least(round(p_desconto, 2), v_restante);
  if v_aplicado <= 0 then raise exception 'Desconto inválido.'; end if;
  v_novo := round(v_valor - v_aplicado, 2);
  v_quitado := v_pago >= v_novo;
  update lancamentos set
    valor = v_novo,
    status = case when v_quitado then 'pago' else status end,
    data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
    historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'valor', v_aplicado, 'forma', case when nullif(trim(p_motivo), '') is not null then 'Desconto — ' || trim(p_motivo) else 'Desconto' end, 'data', now(), 'tipo', 'desconto')),
    updated_at = now()
  where id = p_lancamento_id;
  return jsonb_build_object('quitado', v_quitado, 'novo_valor', v_novo, 'desconto_aplicado', v_aplicado);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.aplicar_movimento_estoque_sige(p_evento_id uuid, p_loja text, p_sequencia bigint, p_movimentos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_mov jsonb;
begin
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'movimento_estoque' and sige_id = p_evento_id::text and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  for v_mov in select value from jsonb_array_elements(p_movimentos) loop
    perform public.movimentar_estoque(
      v_mov->>'produto_id',
      v_mov->>'deposito_id',
      v_mov->>'operacao',
      (v_mov->>'quantidade')::numeric,
      '[]'::jsonb,
      v_mov->>'observacao',
      null,
      (v_mov->>'data')::timestamptz
    );
  end loop;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('movimento_estoque', p_evento_id::text, p_loja, null, coalesce(p_sequencia, 0), now());
  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'movimento_estoque', p_evento_id::text, p_loja, 'aplicar', 'ok', jsonb_array_length(p_movimentos) || ' movimento(s)');
  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'movimentos', jsonb_array_length(p_movimentos));
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.aplicar_transferencia_sige(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_origem text, p_destino text, p_observacao text, p_itens jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_item jsonb;
begin
  if exists (
    select 1 from sinc_mapeamento
    where entidade = 'transferencia' and sige_id = p_sige_id and loja = p_loja
  ) then
    update sinc_inbox set estado = 'aplicado', aplicado_em = now() where id = p_evento_id;
    return jsonb_build_object('duplicado', true);
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    perform public.transferir_estoque(
      v_item->>'produto_id',
      p_origem,
      p_destino,
      (v_item->>'quantidade')::numeric,
      coalesce(v_item->'series', '[]'::jsonb),
      p_observacao,
      null
    );
  end loop;

  insert into sinc_mapeamento (entidade, sige_id, loja, tecno_id, ultima_sequencia, atualizado_em)
  values ('transferencia', p_sige_id, p_loja, null, coalesce(p_sequencia, 0), now());
  insert into sinc_auditoria (evento_id, entidade, sige_id, loja, acao, resultado, detalhe)
  values (p_evento_id, 'transferencia', p_sige_id, p_loja, 'transferir', 'ok', p_origem || ' -> ' || p_destino);
  update sinc_inbox set estado = 'aplicado', aplicado_em = now(), erro = null where id = p_evento_id;

  return jsonb_build_object('duplicado', false, 'itens', jsonb_array_length(p_itens));
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.atualizar_cancelamento_venda_pedido_app()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido uuid;
begin
  if new.status<>'cancelada' or old.status is not distinct from new.status then return new; end if;
  select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.id;
  if v_pedido is null then return new; end if;
  update public.pedidos_app p set status=case when exists (
      select 1 from public.pedidos_app_atendimentos a join public.vendas v on v.id=a.venda_id
      where a.pedido_id=p.id and v.status='concluida') then 'pendente' else 'cancelado' end,
    status_pagamento='pendente' where p.id=v_pedido;
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.atualizar_devolucao_pedido_app()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido uuid;
begin
  select a.pedido_id into v_pedido from public.devolucoes d
    join public.pedidos_app_atendimentos a on a.venda_id=d.venda_id
    where d.id=new.devolucao_id;
  if v_pedido is not null then perform public.sincronizar_estado_pedido_app(v_pedido); end if;
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.atualizar_pagamento_pedido_app()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido uuid;
begin
  if new.venda_id is null or new.status is not distinct from old.status then return new; end if;
  select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a
    where a.venda_id=new.venda_id;
  if v_pedido is null then return new; end if;
  update public.pedidos_app p set status_pagamento=case when
    not exists (select 1 from jsonb_array_elements(p.itens) i where not exists (
      select 1 from public.pedidos_app_atendimentos a join public.vendas v on v.id=a.venda_id
      where a.pedido_id=p.id and a.unidade=i->>'loja' and v.status='concluida'))
    and not exists (select 1 from public.pedidos_app_atendimentos a
      join public.lancamentos l on l.venda_id=a.venda_id
      where a.pedido_id=p.id and l.tipo='receber' and l.status='pendente')
    then 'pago' else 'pendente' end
    where p.id=v_pedido and p.status<>'cancelado';
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.bater_ponto(p_usuario_id uuid, p_tipo text, p_loja_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo  text;
begin
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de batida inválido: %', p_tipo;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_usuario_id::text));

  select tipo into v_ultimo
  from pontos
  where usuario_id = p_usuario_id
    and criado_em >= (v_hoje::text || 'T00:00:00-03:00')::timestamptz
  order by criado_em desc
  limit 1;

  if p_tipo = 'entrada' and v_ultimo in ('entrada', 'retorno') then
    return jsonb_build_object('ok', false, 'erro', 'Você já está em operação.');
  end if;
  if p_tipo = 'saida' and coalesce(v_ultimo, '') not in ('entrada', 'retorno') then
    return jsonb_build_object('ok', false, 'erro', 'Você não está em operação.');
  end if;

  insert into pontos (usuario_id, tipo, loja_id) values (p_usuario_id, p_tipo, p_loja_id);
  return jsonb_build_object('ok', true);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.cancelar_pedido_app(p_pedido uuid, p_operador uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido public.pedidos_app%rowtype; v_unidade text;
begin
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if jsonb_array_length(v_pedido.itens)=0 then raise exception 'Pedido sem unidade.'; end if;
  for v_unidade in select distinct i->>'loja' from jsonb_array_elements(v_pedido.itens) i loop
    perform public.validar_operador_pedido_app(p_operador,v_unidade);
  end loop;
  if exists (select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido and a.venda_id is not null) then
    raise exception 'Pedido com venda: use cancelamento/devolução do PDV.';
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' then
    raise exception 'Pedido com pagamento exige análise financeira separada.';
  end if;
  update public.pedidos_app set status='cancelado' where id=p_pedido and status<>'cancelado';
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.cancelar_remessa_estoque(p_remessa_id uuid, p_motivo text, p_user text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_r record;
  v_item record;
  v_antes numeric;
  v_imei jsonb;
  v_nome_d text;
begin
  select * into v_r from remessas_estoque where id = p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if v_r.status <> 'em_transito' then raise exception 'Só dá pra cancelar remessa em trânsito (status: %)', v_r.status; end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo do cancelamento'; end if;

  select nome into v_nome_d from depositos where id = v_r.destino;

  for v_item in select * from remessas_estoque_itens where remessa_id = p_remessa_id loop
    -- serializado: IMEI volta pra "em_estoque" (continua na origem)
    if jsonb_array_length(coalesce(v_item.series, '[]'::jsonb)) > 0 then
      for v_imei in select * from jsonb_array_elements(v_item.series) loop
        update numeros_serie set status = 'em_estoque', updated_at = now()
        where produto_id = v_item.produto_id and serie = (v_imei->>'serie') and status = 'em_transito';
      end loop;
    end if;

    -- devolve o estoque pra origem
    select quantidade into v_antes from estoque
      where produto_id = v_item.produto_id and deposito_id = v_r.origem for update;
    if found then
      update estoque set quantidade = v_antes + v_item.quantidade, updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_r.origem;
    else
      v_antes := 0;
      insert into estoque (produto_id, deposito_id, quantidade) values (v_item.produto_id, v_r.origem, v_item.quantidade);
    end if;

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_item.produto_id, v_r.origem, 'entrada', round(v_item.quantidade)::int, round(v_antes)::int, round(v_antes + v_item.quantidade)::int,
            'Cancelamento de remessa p/ ' || coalesce(v_nome_d, v_r.destino) || ' | Motivo: ' || p_motivo, p_user, now());
  end loop;

  update remessas_estoque set status = 'cancelada', motivo_cancelamento = p_motivo, cancelada_em = now(), cancelada_por = p_user where id = p_remessa_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.cancelar_venda(p_venda_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status      text;
  v_deposito    text;
  v_numero      integer;
  v_pessoa_id   text;
  v_item        record;
  v_est_id      uuid;
  v_now         timestamptz := now();
  v_devolvido   numeric := 0;
  v_imeis       int := 0;
  v_lancs       int := 0;
  v_credito     numeric := 0;
  v_ja_devolvido numeric;
  v_a_devolver   numeric;
begin
  -- 1. trava a venda
  select status, deposito_id, numero, pessoa_id
    into v_status, v_deposito, v_numero, v_pessoa_id
  from vendas where id = p_venda_id
  for update;

  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v_status = 'cancelada' then
    return jsonb_build_object('ja_cancelada', true, 'venda_numero', v_numero);
  end if;

  -- 2. devolve o estoque dos itens (só a parte que ainda não voltou via devolução parcial)
  for v_item in
    select produto_id, quantidade from itens_venda where venda_id = p_venda_id
  loop
    if v_item.produto_id is null then
      continue;  -- item avulso: não tem estoque pra devolver
    end if;
    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = v_item.produto_id;

    v_a_devolver := greatest(0, v_item.quantidade - v_ja_devolvido);
    if v_a_devolver > 0 then
      select id into v_est_id from estoque
      where produto_id = v_item.produto_id and deposito_id = v_deposito
      for update;

      if found then
        update estoque
          set quantidade = quantidade + v_a_devolver, updated_at = v_now
        where id = v_est_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade, updated_at)
        values (v_item.produto_id, v_deposito, v_a_devolver, v_now);
      end if;
      v_devolvido := v_devolvido + v_a_devolver;
    end if;
  end loop;

  -- 3. IMEIs vendidos voltam pro estoque
  update numeros_serie
    set status = 'em_estoque', venda_id = null, deposito_id = v_deposito, updated_at = v_now
  where venda_id = p_venda_id::text and status = 'vendido';
  get diagnostics v_imeis = row_count;

  -- 4. lançamentos da venda saem do financeiro
  delete from lancamentos where venda_id = p_venda_id;
  get diagnostics v_lancs = row_count;

  -- 5. crédito de cliente usado na venda volta pro saldo dele
  select coalesce(sum(valor), 0) into v_credito
  from creditos_clientes
  where venda_id = p_venda_id::text and tipo = 'uso';

  if v_credito > 0 then
    delete from creditos_clientes
    where venda_id = p_venda_id::text and tipo = 'uso';
  end if;

  -- 6. marca como cancelada (NÃO apaga — o histórico fica)
  update vendas
    set status = 'cancelada',
        observacoes = coalesce(observacoes || ' | ', '') || 'CANCELADA' ||
                      coalesce(': ' || nullif(trim(p_motivo), ''), '')
  where id = p_venda_id;

  return jsonb_build_object(
    'venda_numero',      v_numero,
    'estoque_devolvido', v_devolvido,
    'imeis_devolvidos',  v_imeis,
    'lancamentos_removidos', v_lancs,
    'credito_estornado', v_credito
  );
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.confirmar_pedido_app_unidade(p_pedido uuid, p_unidade text, p_operador uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_pedido public.pedidos_app%rowtype;
begin
  perform public.validar_operador_pedido_app(p_operador,p_unidade);
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado' or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido não disponível nesta unidade.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem aprovação válida.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade) values(p_pedido,p_unidade)
    on conflict(pedido_id,unidade) do nothing;
  if not exists (
    select 1 from jsonb_array_elements(v_pedido.itens) i
    where not exists (select 1 from public.pedidos_app_atendimentos a
      where a.pedido_id=p_pedido and a.unidade=i->>'loja')
  ) then
    update public.pedidos_app set status='confirmado' where id=p_pedido;
  end if;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.confirmar_recebimento_remessa(p_remessa_id uuid, p_user text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_r record;
  v_item record;
  v_antes numeric;
  v_imei jsonb;
  v_nome_o text;
begin
  select * into v_r from remessas_estoque where id = p_remessa_id for update;
  if not found then raise exception 'Remessa não encontrada'; end if;
  if v_r.status <> 'em_transito' then raise exception 'Remessa já finalizada (status: %)', v_r.status; end if;

  select nome into v_nome_o from depositos where id = v_r.origem;

  for v_item in select * from remessas_estoque_itens where remessa_id = p_remessa_id loop
    if jsonb_array_length(coalesce(v_item.series, '[]'::jsonb)) > 0 then
      for v_imei in select * from jsonb_array_elements(v_item.series) loop
        update numeros_serie set deposito_id = v_r.destino, status = 'em_estoque', updated_at = now()
        where produto_id = v_item.produto_id and serie = (v_imei->>'serie') and status = 'em_transito';
      end loop;
    end if;

    select quantidade into v_antes from estoque
      where produto_id = v_item.produto_id and deposito_id = v_r.destino for update;
    if found then
      update estoque set quantidade = v_antes + v_item.quantidade, updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_r.destino;
    else
      v_antes := 0;
      insert into estoque (produto_id, deposito_id, quantidade) values (v_item.produto_id, v_r.destino, v_item.quantidade);
    end if;

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_item.produto_id, v_r.destino, 'entrada', round(v_item.quantidade)::int, round(v_antes)::int, round(v_antes + v_item.quantidade)::int,
            'Recebimento de ' || coalesce(v_nome_o, v_r.origem) || coalesce(' | ' || nullif(v_r.observacao, ''), ''), p_user, now());
  end loop;

  update remessas_estoque set status = 'recebida', recebida_em = now(), recebida_por = p_user where id = p_remessa_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.consulta_ia(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q text := trim(p_query);
  r jsonb;
BEGIN
  IF q IS NULL OR q = '' THEN
    RAISE EXCEPTION 'consulta vazia';
  END IF;
  -- permite ponto-e-vírgula final, rejeita o resto (bloqueia múltiplas instruções)
  q := regexp_replace(q, ';\s*$', '');
  IF q ~ ';' THEN
    RAISE EXCEPTION 'múltiplas instruções não permitidas';
  END IF;
  -- só SELECT
  IF q !~* '^\s*select\y' THEN
    RAISE EXCEPTION 'apenas consulta SELECT é permitida';
  END IF;
  -- bloqueia escrita/DDL
  IF q ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|reindex|into|set|reset)\y' THEN
    RAISE EXCEPTION 'consulta bloqueada';
  END IF;
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (' || q || ') sub LIMIT 200) t' INTO r;
  RETURN coalesce(r, '[]'::jsonb);
END;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.conta_pix_da_venda(p_venda uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_conta uuid; v_contas uuid[]; v_explicitas uuid[]; v_sem_rota boolean;
begin
  -- Quitação posterior (F9) pode ter conta explícita que deve ser preservada.
  select array_agg(distinct conta_id) into v_explicitas from public.lancamentos
    where venda_id=p_venda and tipo='receber' and status='pago'
      and forma_pagamento ilike '%pix%' and conta_id is not null;
  -- Mesma precedência do saldo do PDV: rota forma/loja, depois destino da forma.
  select array_agg(distinct coalesce(r.conta_id,f.conta_destino_id)),
    bool_or(coalesce(r.conta_id,f.conta_destino_id) is null)
    into v_contas,v_sem_rota
  from public.pagamentos_venda pv
  join public.formas_pagamento f on f.id=pv.forma_pagamento_id and f.tipo='pix'
  join public.vendas v on v.id=pv.venda_id
  join public.depositos d on d.id=v.deposito_id
  left join public.forma_conta_loja r on r.forma_id=f.id and r.loja_id=d.loja_id
  where pv.venda_id=p_venda and pv.status='pago';
  select array_agg(distinct c) into v_contas
    from unnest(coalesce(v_contas,'{}'::uuid[]) || coalesce(v_explicitas,'{}'::uuid[])) c where c is not null;
  if cardinality(v_contas)>1 or (cardinality(v_contas)>0 and v_sem_rota) then
    raise exception 'Pix recebido em contas diferentes. Escolha a conta no reembolso dividido.';
  end if;
  v_conta := v_contas[1];
  if v_conta is not null and not exists(select 1 from public.contas where id=v_conta and ativa is true) then
    raise exception 'Conta de reembolso inexistente ou inativa.';
  end if;
  return v_conta; -- sem configuração: conserva NULL; não inventa conta por nome.
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.criar_pedido_app(p_itens jsonb, p_chave text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_pessoa_id text;
  v_id uuid;
  v_item record;
  v_nome text;
  v_preco numeric;
  v_estoque integer;
  v_itens jsonb := '[]'::jsonb;
  v_total numeric(12,2) := 0;
begin
  if v_user is null then raise exception 'Entre na sua conta para pedir.'; end if;
  if p_chave is null or length(p_chave) < 8 or length(p_chave) > 80 then
    raise exception 'Identificador de envio inválido.';
  end if;

  select id into v_id from public.pedidos_app
   where user_id = v_user and chave_envio = p_chave;
  if v_id is not null then return v_id; end if;

  select c.pessoa_id into v_pessoa_id
    from public.cadastros_clientes c
    join public.pessoas p on p.id = c.pessoa_id and p.ativo is true
   where c.user_id = v_user and c.status = 'aprovado';
  if not found then
    raise exception 'Cadastro ainda não aprovado para compras.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) not between 1 and 50 then
    raise exception 'O pedido deve conter entre 1 e 50 peças.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_itens) as x(id text, loja text, quantidade numeric)
    where nullif(trim(x.id), '') is null or nullif(trim(x.loja), '') is null
       or x.quantidade is null or x.quantidade <> trunc(x.quantidade)
       or x.quantidade not between 1 and 100
  ) then raise exception 'Peça, unidade ou quantidade inválida.'; end if;

  for v_item in
    select x.id, x.loja, sum(x.quantidade)::integer as quantidade
      from jsonb_to_recordset(p_itens) as x(id text, loja text, quantidade numeric)
     group by x.id, x.loja
  loop
    if v_item.quantidade > 100 then
      raise exception 'Quantidade acima do limite por peça.';
    end if;
    select c.nome, c.preco, c.estoque
      into v_nome, v_preco, v_estoque
      from public.catalogo_app c
     where c.id = v_item.id and c.loja = v_item.loja;
    if not found or v_preco is null or v_preco <= 0
       or v_estoque is null or v_estoque < v_item.quantidade then
      raise exception 'Preço ou estoque mudou. Revise o carrinho.';
    end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'id', v_item.id, 'nome', v_nome, 'loja', v_item.loja,
      'quantidade', v_item.quantidade, 'preco', v_preco));
    v_total := v_total + v_preco * v_item.quantidade;
  end loop;

  insert into public.pedidos_app (user_id, pessoa_id, chave_envio, itens, total)
  values (v_user, v_pessoa_id, p_chave, v_itens, v_total)
  on conflict (user_id, chave_envio) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.pedidos_app
     where user_id = v_user and chave_envio = p_chave;
  end if;
  return v_id;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.criar_remessa_estoque(p_origem text, p_destino text, p_itens jsonb, p_obs text DEFAULT NULL::text, p_user text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_remessa uuid := gen_random_uuid();
  v_item jsonb;
  v_produto_id text;
  v_qtd numeric;
  v_series jsonb;
  v_est_id uuid;
  v_disp numeric;
  v_nome text;
  v_custo numeric;
  v_nome_d text;
  v_imei jsonb;
begin
  if p_origem is null or p_destino is null then raise exception 'Selecione origem e destino'; end if;
  if p_origem = p_destino then raise exception 'Origem e destino devem ser diferentes'; end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then raise exception 'Adicione ao menos um item'; end if;

  select nome into v_nome_d from depositos where id = p_destino;
  insert into remessas_estoque (id, origem, destino, observacao, criado_por)
  values (v_remessa, p_origem, p_destino, p_obs, p_user);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_produto_id := v_item->>'produto_id';
    v_qtd := coalesce((v_item->>'quantidade')::numeric, 0);
    v_series := coalesce(v_item->'series', '[]'::jsonb);

    if jsonb_array_length(v_series) > 0 then
      v_qtd := jsonb_array_length(v_series);
      for v_imei in select * from jsonb_array_elements(v_series) loop
        update numeros_serie set status = 'em_transito', updated_at = now()
        where produto_id = v_produto_id and serie = (v_imei->>'serie')
          and deposito_id = p_origem and status = 'em_estoque';
        if not found then raise exception 'IMEI % não está em estoque na origem', v_imei->>'serie'; end if;
      end loop;
    end if;

    if v_qtd is null or v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select nome, preco_custo into v_nome, v_custo from produtos where id = v_produto_id;

    select id, quantidade into v_est_id, v_disp from estoque
      where produto_id = v_produto_id and deposito_id = p_origem for update;
    if not found or v_disp < v_qtd then
      raise exception 'Estoque insuficiente na origem para % (disponível: %)', coalesce(v_nome, v_produto_id), coalesce(v_disp, 0);
    end if;
    update estoque set quantidade = v_disp - v_qtd, updated_at = now() where id = v_est_id;

    insert into remessas_estoque_itens (remessa_id, produto_id, nome, quantidade, custo_unitario, series)
    values (v_remessa, v_produto_id, coalesce(v_nome, v_produto_id), v_qtd, coalesce(v_custo, 0), v_series);

    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (v_produto_id, p_origem, 'saida', round(v_qtd)::int, round(v_disp)::int, round(v_disp - v_qtd)::int,
            'Remessa p/ ' || coalesce(v_nome_d, p_destino) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, now());
  end loop;

  return v_remessa;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.dashboard_faturamento_metas(p_de date, p_ate date)
 RETURNS TABLE(loja_id uuid, dia date, valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  -- vendas do sistema: TOTAL VENDIDO (inclui fiado), por loja e dia
  select
    coalesce(cx.loja_id, dp.loja_id)                as loja_id,
    (v.data at time zone 'America/Sao_Paulo')::date as dia,
    sum(v.total)::numeric                            as valor
  from vendas v
  left join caixas cx      on cx.id = v.caixa_id
  left join depositos dp   on dp.id = v.deposito_id
  where v.status = 'concluida'
    and v.uso_interno is not true
    and (v.data at time zone 'America/Sao_Paulo')::date between p_de and p_ate
    and coalesce(cx.loja_id, dp.loja_id) is not null
  group by 1, 2

  union all

  -- histórico do SIGE: "Pedido Faturado", por loja e dia
  select
    l.id                                            as loja_id,
    (h.data at time zone 'UTC')::date               as dia,
    sum(h.valor_final)::numeric                      as valor
  from historico_vendas h
  join lojas l on upper(trim(regexp_replace(h.loja, '^TECNOCELL\s+', '', 'i'))) = upper(trim(l.nome))
  where h.status = 'Pedido Faturado'
    and (h.data at time zone 'UTC')::date between p_de and p_ate
  group by 1, 2;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.dashboard_resumo(p_de date, p_ate date, p_loja text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  with param as (
    select p_de as de,
           coalesce(p_ate, current_date) as ate,
           nullif(upper(trim(coalesce(p_loja, ''))), '') as loja
  ),
  hist as (
    select coalesce(h.valor_final, 0) as valor_final, h.cliente, h.vendedor, h.loja,
           (h.data at time zone 'UTC')::date as dia
    from historico_vendas h, param
    where (h.data at time zone 'UTC')::date between param.de and param.ate
      and h.status = 'Pedido Faturado'
      and (param.loja is null
           or upper(trim(regexp_replace(coalesce(h.loja, ''), '^TECNOCELL\s+', '', 'i'))) = param.loja)

    union all

    select coalesce(v.total, 0), pe.nome, v.vendedor_nome, l.nome,
           (v.data at time zone 'America/Sao_Paulo')::date
    from vendas v
    left join pessoas   pe on pe.id = v.pessoa_id
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    cross join param
    where (v.data at time zone 'America/Sao_Paulo')::date between param.de and param.ate
      and v.status = 'concluida'
      and v.uso_interno is not true
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
  ),
  dias as (
    select generate_series(param.de, param.ate, interval '1 day')::date as dia from param
  ),
  fluxo as (
    select ds.dia, coalesce(sum(h.valor_final), 0) as valor, count(h.dia) as n
    from dias ds left join hist h on h.dia = ds.dia
    group by ds.dia
  ),
  status_hist as (
    select
      count(*) filter (where h.status = 'Pedido Faturado')  as faturados,
      count(*) filter (where h.status = 'Pedido Cancelado') as cancelados,
      count(*) filter (where h.status ilike '%Aprovado%')   as aprovados,
      count(*) filter (where h.status = 'Pedido')           as abertos
    from historico_vendas h, param
    where (h.data at time zone 'UTC')::date between param.de and param.ate
      and (param.loja is null
           or upper(trim(regexp_replace(coalesce(h.loja, ''), '^TECNOCELL\s+', '', 'i'))) = param.loja)
  ),
  status_novo as (
    select
      count(*) filter (where v.status = 'concluida') as faturados,
      count(*) filter (where v.status = 'cancelada') as cancelados,
      count(*) filter (where v.status = 'aberta')    as abertos
    from vendas v
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    cross join param
    where (v.data at time zone 'America/Sao_Paulo')::date between param.de and param.ate
      and v.uso_interno is not true
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
  ),
  saldo as (
    select e.produto_id, sum(e.quantidade) as qtd
    from estoque e
    left join depositos d on d.id = e.deposito_id
    left join lojas     l on l.id = d.loja_id
    cross join param
    where e.quantidade > 0
      and (param.loja is null or upper(trim(coalesce(l.nome, ''))) = param.loja)
    group by e.produto_id
  ),
  est as (
    select
      coalesce(sum(s.qtd), 0)                                                     as unidades,
      count(*)                                                                    as pecas_com_estoque,
      coalesce(sum(s.qtd * coalesce(p.preco_custo, 0)) filter (where p.ativo), 0) as valor_estoque
    from saldo s left join produtos p on p.id = s.produto_id
  ),
  abaixo as (
    select p.id, p.nome, coalesce(s.qtd, 0) as saldo, p.estoque_minimo as minimo
    from produtos p left join saldo s on s.produto_id = p.id
    where p.ativo and coalesce(p.estoque_minimo, 0) > 0
      and coalesce(s.qtd, 0) < p.estoque_minimo
  ),
  top_cli as (
    select trim(cliente) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(cliente, '')) <> ''
      and cliente !~* 'consumidor|n(a|ã)o identif'
    group by trim(cliente) order by v desc limit 6
  ),
  top_vend as (
    select trim(vendedor) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(vendedor, '')) <> ''
    group by trim(vendedor) order by v desc limit 5
  ),
  top_loja as (
    select upper(trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i'))) as k,
           sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i')) <> ''
    group by 1 order by v desc limit 3
  ),
  repor as (
    select nome, saldo, minimo from abaixo order by (saldo - minimo) asc limit 12
  )
  select jsonb_build_object(
    'n_vendas',      (select count(*)                      from hist),
    'faturamento',   (select coalesce(sum(valor_final), 0) from hist),
    'unidades',           (select unidades           from est),
    'pecas_com_estoque',  (select pecas_com_estoque  from est),
    'valor_estoque',      (select valor_estoque      from est),
    'abaixo_min',    (select count(*) from abaixo),
    'top_clientes',  (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_cli),
    'top_vendedores',(select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_vend),
    'lojas',         (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_loja),
    'lista_repor',   (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor),
    'fluxo_diario',  (select coalesce(jsonb_agg(jsonb_build_object(
                         'dia', to_char(dia, 'DD'), 'valor', valor, 'n', n) order by dia), '[]'::jsonb) from fluxo),
    'fluxo_total',   (select coalesce(sum(valor), 0) from fluxo),
    'status_pedidos',(select jsonb_build_object(
                         'faturados',  coalesce((select faturados  from status_hist), 0) + coalesce((select faturados  from status_novo), 0),
                         'cancelados', coalesce((select cancelados from status_hist), 0) + coalesce((select cancelados from status_novo), 0),
                         'aprovados',  coalesce((select aprovados  from status_hist), 0),
                         'abertos',    coalesce((select abertos    from status_hist), 0) + coalesce((select abertos    from status_novo), 0)
                       ))
  );
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.dashboard_resumo(p_de30 date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  with hist as (
    -- SIGE (o passado): só o que faturou de verdade.
    -- Cancelado e "aprovado sem faturamento" NÃO são faturamento.
    select coalesce(valor_final, 0) as valor_final, cliente, vendedor, loja
    from historico_vendas
    where data >= p_de30
      and status = 'Pedido Faturado'

    union all

    -- TecnoCell (o presente): sem isto o dashboard congela em 13/07.
    select coalesce(v.total, 0), pe.nome, v.vendedor_nome, l.nome
    from vendas v
    left join pessoas   pe on pe.id = v.pessoa_id
    left join caixas    cx on cx.id = v.caixa_id
    left join depositos d  on d.id  = v.deposito_id
    left join lojas     l  on l.id  = coalesce(cx.loja_id, d.loja_id)
    where v.created_at >= p_de30
      and v.status = 'concluida'
  ),
  saldo as (
    select produto_id, sum(quantidade) as qtd
    from estoque where quantidade > 0 group by produto_id
  ),
  est as (
    select
      coalesce(sum(s.qtd), 0)                                                     as unidades,
      count(*)                                                                    as pecas_com_estoque,
      coalesce(sum(s.qtd * coalesce(p.preco_custo, 0)) filter (where p.ativo), 0) as valor_estoque
    from saldo s left join produtos p on p.id = s.produto_id
  ),
  abaixo as (
    select p.id, p.nome, coalesce(s.qtd, 0) as saldo, p.estoque_minimo as minimo
    from produtos p left join saldo s on s.produto_id = p.id
    where p.ativo and coalesce(p.estoque_minimo, 0) > 0
      and coalesce(s.qtd, 0) < p.estoque_minimo
  ),
  top_cli as (
    select trim(cliente) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(cliente, '')) <> ''
      and cliente !~* 'consumidor|n(a|ã)o identif'
    group by trim(cliente) order by v desc limit 6
  ),
  top_vend as (
    select trim(vendedor) as k, sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(coalesce(vendedor, '')) <> ''
    group by trim(vendedor) order by v desc limit 5
  ),
  top_loja as (
    -- upper() obrigatório: SIGE grava "TECNOCELL PETRÓPOLIS", lojas.nome grava
    -- "Petrópolis". Sem normalizar, a MESMA loja vira duas linhas no ranking.
    select upper(trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i'))) as k,
           sum(coalesce(valor_final, 0)) as v
    from hist
    where trim(regexp_replace(coalesce(loja, ''), 'TECNOCELL ', '', 'i')) <> ''
    group by 1 order by v desc limit 3
  ),
  repor as (
    select nome, saldo, minimo from abaixo order by (saldo - minimo) asc limit 12
  )
  select jsonb_build_object(
    'n_vendas',      (select count(*)                      from hist),
    'faturamento',   (select coalesce(sum(valor_final), 0) from hist),
    'unidades',           (select unidades           from est),
    'pecas_com_estoque',  (select pecas_com_estoque  from est),
    'valor_estoque',      (select valor_estoque      from est),
    'abaixo_min',    (select count(*) from abaixo),
    'top_clientes',  (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_cli),
    'top_vendedores',(select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_vend),
    'lojas',         (select coalesce(jsonb_agg(jsonb_build_array(k, v)), '[]'::jsonb) from top_loja),
    'lista_repor',   (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'saldo', saldo, 'min', minimo)), '[]'::jsonb) from repor)
  );
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.definir_loja_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.loja_id is null and new.venda_id is not null then
    select d.loja_id into new.loja_id
    from vendas v
    join depositos d on d.id = v.deposito_id
    where v.id = new.venda_id;
  end if;
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.encaminhar_pedido_app_pdv(p_pedido uuid, p_unidade text, p_operador uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido public.pedidos_app%rowtype;
begin
  perform public.validar_operador_pedido_app(p_operador, p_unidade);
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado'
    or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido indisponível nesta unidade.';
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' and not exists (
    select 1 from public.pedidos_app_atendimentos a
    where a.pedido_id=p_pedido and a.unidade=p_unidade and a.venda_id is not null
  ) then
    raise exception 'Pedido com pagamento anterior exige análise financeira.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem vínculo ativo e aprovado.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade,confirmado_em,encaminhado_em)
    values(p_pedido,p_unidade,null,now())
    on conflict(pedido_id,unidade) do update
      set encaminhado_em=coalesce(pedidos_app_atendimentos.encaminhado_em, excluded.encaminhado_em);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.enfileirar_pedido_app_credito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u record; cx uuid;
begin
 for u in select distinct m.unidade,m.loja_id from public.pedidos_app_unidades m
 join public.lojas l on l.id=m.loja_id and l.ativa is true and l.pedidos_app_auto_credito
 where new.itens @> jsonb_build_array(jsonb_build_object('loja',m.unidade)) loop
   select case when count(*)=1 then (array_agg(c.id))[1] end into cx
     from public.caixas c where c.loja_id=u.loja_id and c.status='aberto';
   insert into public.pedidos_app_credito_fila(pedido_id,unidade,caixa_id,estado,motivo)
   values(new.id,u.unidade,cx,case when cx is null then 'manual' else 'pendente' end,
     case when cx is null then 'Caixa fechado na chegada. Atenda no PDV.' end)
   on conflict do nothing;
 end loop;
 return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.estornar_credito_cliente(p_credito_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c            record;
  v_saldo        numeric;
  v_venda_numero integer;
  v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lanc_id      text := null;
begin
  select id, pessoa_id, pessoa_nome, valor, tipo, devolucao_id, loja_id
    into v_c from creditos_clientes where id = p_credito_id;
  if not found or v_c.tipo <> 'credito' then
    raise exception 'Movimento não é um crédito estornável.';
  end if;

  perform 1 from pessoas where id = v_c.pessoa_id for update;

  -- saldo DA MESMA LOJA do crédito (não o saldo global do cliente)
  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = v_c.pessoa_id and loja_id = v_c.loja_id;
  if v_saldo - v_c.valor < -0.01 then
    raise exception 'SALDO_INSUFICIENTE:%:%', v_saldo, v_c.valor;
  end if;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, estorna_credito_id, loja_id)
  values (v_c.pessoa_id, v_c.pessoa_nome, v_c.valor, 'estorno',
          'Estorno de crédito #' || p_credito_id, p_credito_id, v_c.loja_id);

  if v_c.devolucao_id is not null then
    select v.numero into v_venda_numero
      from devolucoes d left join vendas v on v.id = d.venda_id
     where d.id = v_c.devolucao_id;

    v_lanc_id := gen_random_uuid()::text;
    insert into lancamentos (id, descricao, valor, tipo, categoria,
                             data_competencia, data_vencimento, status, valor_pago,
                             pessoa_nome, loja_id, updated_at)
    values (v_lanc_id,
            'Estorno de crédito — devolução da venda #'
              || coalesce(v_venda_numero::text, '?') || ' — '
              || coalesce(v_c.pessoa_nome, 'Cliente'),
            v_c.valor, 'pagar', 'Estorno de crédito',
            v_today, v_today, 'pendente', 0,
            v_c.pessoa_nome, v_c.loja_id, now());
  end if;

  return jsonb_build_object('lancamento_id', v_lanc_id, 'valor', v_c.valor);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.estornar_nota_entrada(p_nota_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status         text;
  v_item           record;
  v_controla_serie boolean;
  v_serie          text;
  v_revertidos     int;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  -- Nota que não existe não pode terminar em silêncio: o operador achava que tinha
  -- estornado (achado dos testes de 27/10).
  if v_status is null then
    raise exception 'Nota de entrada não encontrada.';
  end if;
  if v_status <> 'recebida' then return; end if;

  for v_item in
    select produto_id, deposito_id, quantidade, series
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    select controla_serie into v_controla_serie from produtos where id = v_item.produto_id;

    if v_controla_serie then
      v_revertidos := 0;
      for v_serie in select * from jsonb_array_elements_text(coalesce(v_item.series, '[]'::jsonb))
      loop
        delete from numeros_serie
          where produto_id = v_item.produto_id and serie = v_serie and status = 'em_estoque';
        if found then
          v_revertidos := v_revertidos + 1;
        end if;
      end loop;
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_revertidos), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    else
      update estoque set quantidade = greatest(0, coalesce(quantidade, 0) - v_item.quantidade), updated_at = now()
        where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    end if;
  end loop;

  update notas_entrada set status = 'cancelada' where id = p_nota_id;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.finalizar_pedido_app_pdv(p_pedido uuid, p_unidade text, p_operador uuid, p_deposito text, p_pagamentos jsonb, p_series jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pedido public.pedidos_app%rowtype;
  v_loja uuid;
  v_caixa uuid;
  v_venda uuid;
  v_resultado jsonb;
  v_itens jsonb;
  v_nome text;
  v_total numeric;
  v_item jsonb;
  v_qtd numeric;
  v_master boolean;
  v_permissoes text[];
begin
  perform public.validar_operador_pedido_app(p_operador,p_unidade);
  -- Mesmo lock do cancelamento: duas abas e uma resposta perdida retornam a venda original.
  select * into v_pedido from public.pedidos_app where id=p_pedido for update;
  if not found or v_pedido.status='cancelado'
    or not (v_pedido.itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade))) then
    raise exception 'Pedido indisponível nesta unidade.';
  end if;
  select venda_id into v_venda from public.pedidos_app_atendimentos
    where pedido_id=p_pedido and unidade=p_unidade;
  if v_venda is not null then
    select jsonb_build_object('venda_id',v.id,'venda_numero',v.numero,'total',v.total,'ja_existia',true)
      into v_resultado from public.vendas v where v.id=v_venda;
    if v_resultado is null then raise exception 'Vínculo da venda inconsistente.'; end if;
    return v_resultado;
  end if;
  if v_pedido.status_pagamento is distinct from 'pendente' then
    raise exception 'Pedido com pagamento anterior exige análise financeira.';
  end if;
  perform 1 from public.cadastros_clientes c join public.pessoas p on p.id=c.pessoa_id
    where c.user_id=v_pedido.user_id and c.pessoa_id=v_pedido.pessoa_id
      and c.status='aprovado' and p.ativo is true and p.nao_vender is not true
    for share of c,p;
  if not found then raise exception 'Cadastro sem vínculo ativo e aprovado.'; end if;
  select u.loja_id into v_loja from public.pedidos_app_unidades u where u.unidade=p_unidade;
  perform 1 from public.depositos d where d.id=p_deposito and d.loja_id=v_loja and d.ativo is true;
  if not found then raise exception 'Depósito não pertence à unidade.'; end if;
  select c.id into v_caixa from public.caixas c where c.loja_id=v_loja and c.status='aberto'
    order by c.id limit 1 for update;
  if v_caixa is null then raise exception 'Caixa da unidade fechado.'; end if;
  select p.nome into v_nome from public.perfis p where p.id=p_operador and p.ativo is true;
  if v_nome is null then raise exception 'Operador inativo.'; end if;
  select case when c.id is not null then coalesce(c.is_master,false) else coalesce(p.is_master,false) end,
    coalesce(p.permissoes,'{}'::text[]) || coalesce(c.permissoes,'{}'::text[])
    into v_master,v_permissoes from public.perfis p
    left join public.cargos c on c.id=p.cargo_id and c.ativo is not false
    where p.id=p_operador;

  if jsonb_typeof(v_pedido.itens) <> 'array' or jsonb_typeof(p_pagamentos) <> 'array'
    or jsonb_array_length(p_pagamentos)=0 then raise exception 'Itens ou pagamentos inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade and (
        nullif(i->>'id','') is null or (i->>'quantidade')::numeric <> trunc((i->>'quantidade')::numeric)
        or (i->>'quantidade')::numeric not between 1 and 100
        or (i->>'preco')::numeric <= 0)) then raise exception 'Item inválido no pedido.'; end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade group by i->>'id' having count(*)>1) then
    raise exception 'Peça duplicada no pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      left join public.produtos p on p.id=i->>'id'
      where i->>'loja'=p_unidade and (p.id is null or p.ativo is not true
        or (not v_master and (i->>'preco')::numeric <= coalesce(p.preco_custo,0))
        or (not v_master and not ('venda_abaixo_minimo'=any(v_permissoes))
          and coalesce(p.preco_minimo,0)>0 and (i->>'preco')::numeric < p.preco_minimo))) then
    raise exception 'Peça inativa ou preço abaixo do piso/custo. Revise o pedido.';
  end if;
  select jsonb_agg(jsonb_build_object('produto_id',i->>'id','nome',i->>'nome',
      'quantidade',(i->>'quantidade')::numeric,'preco_unitario',(i->>'preco')::numeric,'desconto_item',0)),
    sum((i->>'quantidade')::numeric * (i->>'preco')::numeric)
    into v_itens,v_total from jsonb_array_elements(v_pedido.itens) i where i->>'loja'=p_unidade;
  if v_itens is null or v_total <= 0 then raise exception 'Pedido sem peças nesta unidade.'; end if;
  if jsonb_typeof(coalesce(p_series,'[]'::jsonb)) <> 'array' then raise exception 'IMEIs inválidos.'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
      left join public.produtos p on p.id=s->>'produto_id'
      where nullif(s->>'serie','') is null or p.controla_serie is not true
        or not exists (select 1 from jsonb_array_elements(v_pedido.itens) i
          where i->>'loja'=p_unidade and i->>'id'=s->>'produto_id'))
    or exists (select 1 from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
      group by s->>'produto_id',s->>'serie' having count(*)>1)
    or exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      join public.produtos p on p.id=i->>'id' and p.controla_serie is true
      where i->>'loja'=p_unidade and
        (select count(*) from jsonb_array_elements(coalesce(p_series,'[]'::jsonb)) s
          where s->>'produto_id'=i->>'id') <> (i->>'quantidade')::numeric) then
    raise exception 'IMEIs não correspondem às peças do pedido.';
  end if;
  -- O PDV genérico permite estoque negativo em serviços; pedido do App exige saldo real.
  for v_item in select i from jsonb_array_elements(v_pedido.itens) i
      where i->>'loja'=p_unidade order by i->>'id' loop
    select e.quantidade into v_qtd from public.estoque e
      where e.produto_id=v_item->>'id' and e.deposito_id=p_deposito for update;
    if not found or v_qtd < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente no depósito para %.',v_item->>'nome';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      left join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      where f.id is null or f.ativo is not true or f.tipo is null or (f.loja_id is not null and f.loja_id<>v_loja)
        or (pag->>'status') is null or (pag->>'status') not in ('pago','pendente')
        or (f.tipo='fiado') <> (pag->>'status'='pendente')
        or f.tipo='vale_credito'
        or (pag->>'valor')::numeric <= 0
        or (pag->>'valor')::numeric <> round((pag->>'valor')::numeric,2)
        or (pag->>'taxa')::numeric < 0
        or (pag->>'taxa')::numeric <> round((pag->>'taxa')::numeric,2)
        or (pag->>'parcelas')::int not between 1 and 24
        or (f.tipo not in ('cartao_credito','cartao_debito') and
          (coalesce(pag->>'maquina','')<>'' or (pag->>'taxa')::numeric<>0 or (pag->>'parcelas')::int<>1))) then
    raise exception 'Forma de pagamento indisponível nesta loja.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      left join public.maquinas_cartao m on m.nome=pag->>'maquina' and m.ativo is true
      where f.tipo in ('cartao_credito','cartao_debito') and
        (m.id is null or (f.maquina_id is not null and f.maquina_id<>m.id)
          or (pag->>'parcelas')::int > m.max_parcelas
          or (f.tipo='cartao_debito' and (pag->>'parcelas')::int<>1)
          or (f.tipo='cartao_credito' and m.taxas_credito->>((pag->>'parcelas')::int-1) is null)
          or (pag->>'taxa')::numeric <> round((pag->>'valor')::numeric *
            (case when f.tipo='cartao_debito' then m.taxa_debito
              else (m.taxas_credito->>((pag->>'parcelas')::int-1))::numeric end) / 100,2))) then
    raise exception 'Taxa, máquina ou parcelas do cartão inválidas.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pagamentos) pag
      join public.formas_pagamento f on f.id=pag->>'forma_pagamento_id'
      where f.tipo='fiado') then
    perform 1 from public.pessoas p where p.id=v_pedido.pessoa_id and p.permite_fiado is true;
    if not found then raise exception 'Cliente sem fiado liberado.'; end if;
  end if;

  -- A chamada, a amarração ao caixa e o vínculo pertencem à mesma transação PostgreSQL.
  v_resultado := public.finalizar_venda_com_desconto_item(
    v_itens,p_pagamentos,v_pedido.pessoa_id,0,
    'Origem: Aplicativo · Pedido ' || p_pedido::text,
    p_deposito,coalesce(p_series,'[]'::jsonb),p_operador,v_nome,0,'retirada',null);
  v_venda := (v_resultado->>'venda_id')::uuid;
  if v_venda is null then raise exception 'PDV não retornou venda.'; end if;
  update public.vendas set caixa_id=v_caixa where id=v_venda;
  if not found then raise exception 'Venda não localizada para vínculo ao caixa.'; end if;
  insert into public.pedidos_app_atendimentos(pedido_id,unidade,encaminhado_em,confirmado_em,venda_id)
    values(p_pedido,p_unidade,now(),now(),v_venda)
    on conflict(pedido_id,unidade) do update
      set confirmado_em=now(),venda_id=excluded.venda_id;
  if not exists (select 1 from jsonb_array_elements(v_pedido.itens) i
      where not exists (select 1 from public.pedidos_app_atendimentos a
        where a.pedido_id=p_pedido and a.unidade=i->>'loja' and a.venda_id is not null)) then
    update public.pedidos_app set status='confirmado',
      status_pagamento=case when not exists (
        select 1 from public.pedidos_app_atendimentos a
        join public.pagamentos_venda pv on pv.venda_id=a.venda_id
        where a.pedido_id=p_pedido and pv.status='pendente'
      ) then 'pago' else 'pendente' end
      where id=p_pedido;
  end if;
  return v_resultado || jsonb_build_object('ja_existia',false);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.finalizar_venda(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb DEFAULT '[]'::jsonb, p_vendedor_id uuid DEFAULT NULL::uuid, p_vendedor_nome text DEFAULT NULL::text, p_credito_valor numeric DEFAULT 0, p_tipo_entrega text DEFAULT 'retirada'::text, p_endereco_entrega text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_subtotal           numeric := 0;
  v_total_produtos     numeric;
  v_total_taxas        numeric := 0;
  v_total              numeric;
  v_forma_pag_id       text;
  v_venda_id           uuid;
  v_venda_numero       integer;
  v_item               jsonb;
  v_pag                jsonb;
  v_estoque_id         uuid;
  v_qtd_disponivel     numeric;
  v_nova_qtd           numeric;
  v_pago_total         numeric := 0;
  v_fiado_total        numeric := 0;
  v_pessoa_nome        text;
  v_saldo_credito      numeric;
  v_loja_id            uuid;
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
  v_soma_pagamentos    numeric := 0;
  v_permite_negativo   boolean;
  v_eh_servico         boolean;
begin
  v_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_now   := now();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if (v_item->>'quantidade')::numeric <> trunc((v_item->>'quantidade')::numeric) then
      raise exception 'Quantidade precisa ser numero inteiro (veio "%") em "%"',
        v_item->>'quantidade', coalesce(v_item->>'nome', v_item->>'produto_id');
    end if;
    v_subtotal := v_subtotal + (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  select coalesce(sum((pag->>'valor')::numeric), 0) into v_soma_pagamentos
  from jsonb_array_elements(p_pagamentos) as pag;

  if exists (select 1 from jsonb_array_elements(p_pagamentos) as pag
             where (pag->>'valor')::numeric < 0 or (pag->>'taxa')::numeric < 0) then
    raise exception 'Pagamento com valor ou taxa negativa nao e permitido';
  end if;
  if coalesce(p_credito_valor, 0) < 0 then
    raise exception 'Credito com valor negativo nao e permitido';
  end if;

  if abs((v_soma_pagamentos + coalesce(p_credito_valor, 0)) - v_total_produtos) > 0.01 then
    raise exception 'Os pagamentos nao fecham com a venda: pagamentos R$ % + credito R$ % = R$ %, mas a venda e R$ %',
      round(v_soma_pagamentos, 2),
      round(coalesce(p_credito_valor, 0), 2),
      round(v_soma_pagamentos + coalesce(p_credito_valor, 0), 2),
      round(v_total_produtos, 2);
  end if;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'produto_id', '') is null then
      continue;
    end if;

    select servico into v_eh_servico from produtos where id = (v_item->>'produto_id');
    if coalesce(v_eh_servico, false) then
      continue;
    end if;

    select id, quantidade into v_estoque_id, v_qtd_disponivel
    from estoque
    where deposito_id = p_deposito_id and produto_id = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" nao encontrado no estoque do deposito', v_item->>'nome';
    end if;
    select permite_estoque_negativo into v_permite_negativo from produtos where id = (v_item->>'produto_id');
    if not coalesce(v_permite_negativo, false) and v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponivel: %)', v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;
    update estoque set quantidade = v_nova_qtd, updated_at = v_now where id = v_estoque_id;
    v_estoque_atualizado := v_estoque_atualizado || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  v_venda_numero := nextval('venda_numero_seq');

  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status, deposito_id, vendedor_id, vendedor_nome, tipo_entrega, endereco_entrega)
  values (v_venda_numero, v_total, p_desconto, v_forma_pag_id, p_pessoa_id, nullif(p_observacoes, ''), 'concluida', p_deposito_id, p_vendedor_id, p_vendedor_nome, coalesce(p_tipo_entrega, 'retirada'), nullif(p_endereco_entrega, ''))
  returning id into v_venda_id;

  insert into itens_venda (venda_id, produto_id, nome, quantidade, preco_unitario, desconto_item, total_item)
  select v_venda_id,
         nullif(item->>'produto_id', ''),
         case when nullif(item->>'produto_id', '') is null then nullif(item->>'nome', '') else null end,
         (item->>'quantidade')::numeric, (item->>'preco_unitario')::numeric,
         0, (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  select loja_id into v_loja_id from depositos where id = p_deposito_id;

  if p_credito_valor > 0 and p_pessoa_id is not null then
    perform 1 from pessoas where id = p_pessoa_id for update;
    select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0) into v_saldo_credito
    from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = v_loja_id;
    if v_saldo_credito < p_credito_valor then
      raise exception 'Saldo de credito insuficiente nesta loja (disponivel: %)', v_saldo_credito;
    end if;
    select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, venda_id, loja_id)
    values (p_pessoa_id, v_pessoa_nome, p_credito_valor, 'uso', 'Usado na venda #' || v_venda_numero, v_venda_id::text, v_loja_id);

    insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
    values (v_venda_id, 'FP_VALE', p_credito_valor, 0, null, 1, 'vale');
  end if;

  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie
      set status = 'vendido', venda_id = v_venda_id::text, updated_at = v_now
      where produto_id = (v_item->>'produto_id')
        and serie = (v_item->>'serie')
        and deposito_id = p_deposito_id
        and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % indisponivel no estoque deste deposito', v_item->>'serie';
      end if;
    end loop;
  end if;

  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select v_venda_id, pag->>'forma_pagamento_id', (pag->>'valor')::numeric, (pag->>'taxa')::numeric,
         nullif(pag->>'maquina', ''), (pag->>'parcelas')::int, pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  select
    coalesce(sum(case when pag->>'status' = 'pago' then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente' then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  if v_pago_total > 0 then
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, valor_pago, categoria, subcategoria, loja_id, updated_at, venda_id)
    values ('Venda #' || v_venda_numero, v_pago_total, 'receber', v_today, v_today, 'pago', v_today, v_pago_total, 'Vendas', 'Loja', v_loja_id, v_now, v_venda_id);
  end if;

  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    end if;
    insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_id, pessoa_nome, categoria, loja_id, updated_at, venda_id)
    values ('A Receber — Fiado #' || v_venda_numero, v_fiado_total, 'receber', v_today, v_today, 'pendente', p_pessoa_id, v_pessoa_nome, 'Fiado (a receber)', v_loja_id, v_now, v_venda_id);
  end if;

  return jsonb_build_object(
    'venda_id', v_venda_id, 'venda_numero', v_venda_numero,
    'total', v_total, 'estoque_atualizado', v_estoque_atualizado
  );
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.finalizar_venda_com_desconto_item(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb DEFAULT '[]'::jsonb, p_vendedor_id uuid DEFAULT NULL::uuid, p_vendedor_nome text DEFAULT NULL::text, p_credito_valor numeric DEFAULT 0, p_tipo_entrega text DEFAULT 'retirada'::text, p_endereco_entrega text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_itens_liquidos jsonb;
  v_resultado jsonb;
  v_venda_id uuid;
begin
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where coalesce((i->>'desconto_item')::numeric, 0) < 0
       or coalesce((i->>'desconto_item')::numeric, 0) > (i->>'preco_unitario')::numeric
  ) then raise exception 'Desconto unitário inválido'; end if;

  select coalesce(jsonb_agg(i || jsonb_build_object(
    'preco_unitario', (i->>'preco_unitario')::numeric - coalesce((i->>'desconto_item')::numeric, 0)
  )), '[]'::jsonb) into v_itens_liquidos
  from jsonb_array_elements(p_itens) i;

  v_resultado := public.finalizar_venda(
    v_itens_liquidos, p_pagamentos, p_pessoa_id, p_desconto, p_observacoes,
    p_deposito_id, p_series, p_vendedor_id, p_vendedor_nome, p_credito_valor,
    p_tipo_entrega, p_endereco_entrega
  );
  v_venda_id := (v_resultado->>'venda_id')::uuid;

  update itens_venda iv set
    preco_unitario = (i.item->>'preco_unitario')::numeric,
    desconto_item = coalesce((i.item->>'desconto_item')::numeric, 0),
    total_item = (i.item->>'quantidade')::numeric *
      ((i.item->>'preco_unitario')::numeric - coalesce((i.item->>'desconto_item')::numeric, 0))
  from jsonb_array_elements(p_itens) i(item)
  where iv.venda_id = v_venda_id and iv.produto_id = i.item->>'produto_id';

  return v_resultado;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.finalizar_venda_halloween(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text, p_operation uuid, p_tabela_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
#variable_conflict use_column
declare payload jsonb; prior halloween_private.margin_operations; x jsonb; rule halloween_private.margin_rules; product public.produtos; base numeric; store uuid; v_result jsonb; sid uuid; selected integer:=0;
begin
 if p_operation is null then raise exception 'Operação obrigatória';end if;
 payload:=jsonb_build_array(p_itens,p_pagamentos,p_pessoa_id,p_desconto,p_observacoes,p_deposito_id,p_series,p_vendedor_id,p_vendedor_nome,p_credito_valor,p_tipo_entrega,p_endereco_entrega,p_tabela_id);
 insert into halloween_private.margin_operations(operation_id,payload)values(p_operation,payload)on conflict do nothing;
 select * into strict prior from halloween_private.margin_operations where operation_id=p_operation for update;
 if prior.payload<>payload then raise exception 'Operação reutilizada com dados diferentes';end if;
 if prior.result is not null then return prior.result||jsonb_build_object('jaExistia',true,'vendedor_nome',prior.payload->8);end if;
 if jsonb_typeof(p_itens)<>'array'or jsonb_array_length(p_itens)=0 then raise exception 'Itens obrigatórios';end if;
 if exists(select 1 from jsonb_array_elements(p_itens)x group by x->>'produto_id'having count(*)>1)then raise exception 'Produto repetido';end if;
 select d.loja_id into store from public.depositos d join public.lojas l on l.id=d.loja_id and l.ativa where d.id=p_deposito_id;
 for x in select value from jsonb_array_elements(p_itens)loop
 if nullif(x->>'halloween_rule_id','')is not null then
 selected:=selected+1;
 if store is null or not halloween_private.margin_window('halloween-2026')then raise exception 'Halloween indisponível para esta loja/data';end if;
 select * into product from public.produtos where id=x->>'produto_id'and ativo for share;
 select * into rule from halloween_private.margin_rules where rule_id=x->>'halloween_rule_id'and code=product.codigo and version=(x->>'halloween_version')::integer;
 if not found or (select count(*)from public.produtos where codigo=rule.code and ativo)<>1 then raise exception 'Regra Halloween inválida';end if;
 if (x->>'quantidade')::numeric<=0 then raise exception 'Quantidade inválida';end if;
 base:=product.preco;
 if nullif(p_tabela_id,'')is not null then
 if not exists(select 1 from public.tabelas_preco where id::text=p_tabela_id and ativa and not usa_preco_custo)then raise exception 'Tabela inválida';end if;
 select coalesce((select t.preco from public.itens_tabela_preco t where t.tabela_id::text=p_tabela_id and t.produto_id=product.id and coalesce(t.quantidade_minima,1)<=(x->>'quantidade')::numeric order by coalesce(t.quantidade_minima,1) desc limit 1),product.preco)into base;
 end if;
 if base is null or base<=0 or (x->>'preco_unitario')::numeric is distinct from base or (x->>'desconto_item')::numeric is distinct from round(base*rule.percent/100,2)then raise exception 'Preço/desconto Halloween divergente';end if;
 end if;end loop;
 if selected=0 then raise exception 'Selecione ao menos um item Halloween';end if;
 if exists(select 1 from jsonb_array_elements(p_itens)x where coalesce((x->>'promotion_discount_total')::numeric,0)<0 or coalesce((x->>'promotion_discount_total')::numeric,0)>(x->>'quantidade')::numeric*((x->>'preco_unitario')::numeric-coalesce((x->>'desconto_item')::numeric,0)) or (nullif(x->>'halloween_rule_id','')is not null and coalesce((x->>'promotion_discount_total')::numeric,0)<>0)) or coalesce(p_desconto,0) is distinct from (select coalesce(sum(coalesce((x->>'promotion_discount_total')::numeric,0)),0)from jsonb_array_elements(p_itens)x where nullif(x->>'halloween_rule_id','')is null)then raise exception 'Halloween não acumula desconto geral';end if;
 v_result:=public.finalizar_venda_com_desconto_item(p_itens,p_pagamentos,p_pessoa_id,p_desconto,p_observacoes,p_deposito_id,p_series,p_vendedor_id,p_vendedor_nome,p_credito_valor,p_tipo_entrega,p_endereco_entrega);
 sid:=(v_result->>'venda_id')::uuid;
 if sid is null or not exists(select 1 from public.vendas where id=sid and status='concluida'and deposito_id=p_deposito_id)then raise exception 'Venda não concluída';end if;
 -- Normalize existing other-product promotions into their original lines. The ERP
 -- return RPC prorates header desconto; leaving it here would discount Halloween twice.
 update public.itens_venda i set desconto_item=coalesce(i.desconto_item,0)+round(coalesce((x->>'promotion_discount_total')::numeric,0)/nullif(i.quantidade,0),2),total_item=i.total_item-coalesce((x->>'promotion_discount_total')::numeric,0)
 from jsonb_array_elements(p_itens)x where i.venda_id=sid and i.produto_id=x->>'produto_id'and nullif(x->>'halloween_rule_id','')is null;
 update public.vendas set desconto=0 where id=sid;
 if (select round(sum(total_item),2)from public.itens_venda where venda_id=sid)is distinct from(select total-coalesce((select sum(coalesce((p->>'taxa')::numeric,0))from jsonb_array_elements(p_pagamentos)p),0)from public.vendas where id=sid)then raise exception 'Normalização de desconto divergente';end if;
 insert into halloween_private.margin_items(campaign_id,sale_id,item_id,store_id,product_id,rule_id,version,quantity,revenue,unit_cost)
 select 'halloween-2026',sid,i.id,store,i.produto_id,x->>'halloween_rule_id',(x->>'halloween_version')::integer,i.quantidade,i.total_item,case when p.preco_custo>0 then p.preco_custo end from jsonb_array_elements(p_itens)x join public.itens_venda i on i.venda_id=sid and i.produto_id=x->>'produto_id'join public.produtos p on p.id=i.produto_id where nullif(x->>'halloween_rule_id','')is not null;
 if (select count(*)from halloween_private.margin_items where sale_id=sid)<>selected then raise exception 'Falha ao vincular itens Halloween';end if;
 update halloween_private.margin_operations set result=v_result where operation_id=p_operation;
 -- Checkout persists attribution only; cron/staff state performs campaign aggregation.
 return v_result;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_admin_state(p_campaign text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.admin_state(p_campaign)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_admin_state_for_store(p_campaign text, p_store uuid, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select halloween_private.admin_state_for_store(p_campaign,p_store,p_search,p_offset)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_admin_state_v2(p_campaign text, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.admin_state_v2(p_campaign,p_search,p_offset)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_catalog(p_campaign text DEFAULT 'halloween-2026'::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$select halloween_private.surprise_catalog(halloween_private.catalog(p_campaign))$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_client_tickets(p_campaign text, p_customer text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$ select halloween_private.client_tickets(p_campaign,p_customer,p_offset) $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_client_tickets_for_store(p_campaign text, p_store uuid, p_customer text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select halloween_private.client_tickets_for_store(p_campaign,p_store,p_customer,p_offset)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_configure(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.configure(p_campaign,p_products,p_confirm,p_active)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_configure_store_prize(p_campaign text, p_store uuid, p_slot integer, p_quantity integer, p_confirm boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare actor uuid;s halloween_private.store_prizes;used integer;
begin
 actor:=halloween_private.require_staff();
 perform 1 from halloween_private.campaigns where id=p_campaign for update;
 select * into strict s from halloween_private.store_prizes where campaign_id=p_campaign and store_id=p_store and slot=p_slot for update;
 if p_quantity is null or p_quantity<0 or p_quantity>100000 or p_confirm is distinct from true then raise exception 'Confirme a quantidade física reservada';end if;
 used:=s.quantity-s.remaining;
 if p_quantity<used then raise exception 'Quantidade inferior aos prêmios reservados/entregues';end if;
 update halloween_private.store_prizes set quantity=p_quantity,remaining=p_quantity-used,enabled=p_quantity>0 where campaign_id=p_campaign and store_id=p_store and slot=p_slot;
 insert into halloween_private.audit(campaign_id,action,object_id,actor)values(p_campaign,'store_prize_configured',jsonb_build_object('store',p_store,'slot',p_slot,'before',s.quantity,'after',p_quantity)::text,actor);
end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_confirm_sale_time(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.confirm_sale_time(p_campaign,p_sale,p_paid_at,p_reason,p_confirm)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_issue(p_campaign text, p_ref text, p_customer text, p_amount integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.issue(p_campaign,p_ref,p_customer,p_amount)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_issue_os_manual(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.issue_os_manual(p_campaign,p_os,p_receipts,p_paid_at,p_reason,p_confirm)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_lookup(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.lookup(p_code)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_margin_correct_cost(p_campaign text, p_item uuid, p_cost numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare actor uuid; old numeric;
begin actor:=halloween_private.require_staff();if p_cost is null or p_cost<=0 or p_cost<>round(p_cost,2)or length(btrim(coalesce(p_reason,'')))not between 10 and 500 then raise exception 'Custo e justificativa obrigatórios';end if;select unit_cost into strict old from halloween_private.margin_items where campaign_id=p_campaign and item_id=p_item for update;insert into halloween_private.margin_cost_audit(campaign_id,item_id,actor,old_cost,new_cost,reason)values(p_campaign,p_item,actor,old,p_cost,p_reason);update halloween_private.margin_items set unit_cost=p_cost where campaign_id=p_campaign and item_id=p_item;perform halloween_private.margin_reconcile(p_campaign);end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_margin_reconcile(p_campaign text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$select halloween_private.margin_reconcile(p_campaign)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_margin_replay(p_operation uuid, p_actor uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare op halloween_private.margin_operations;
begin
 if p_operation is null or p_actor is null or jsonb_typeof(p_request)is distinct from 'array'or jsonb_array_length(p_request)<>13 or (p_request->>7)::uuid is distinct from p_actor then raise exception 'Operação/operador inválido';end if;
 select * into op from halloween_private.margin_operations where operation_id=p_operation;
 if not found then return null;end if;
 if op.payload<>p_request or (op.payload->>7)::uuid is distinct from p_actor then raise exception 'Operação reutilizada com dados diferentes';end if;
 return case when op.result is null then null else op.result||jsonb_build_object('jaExistia',true,'vendedor_nome',op.payload->8)end;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_margin_state(p_campaign text, p_store uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_product text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
declare output jsonb;
begin
 perform halloween_private.require_staff();perform halloween_private.margin_reconcile(p_campaign);
 with e as(select e.*,v.numero,v.status,v.created_at,l.nome store_name,p.nome name from halloween_private.margin_effective(p_campaign)e join public.vendas v on v.id=e.sale_id join public.lojas l on l.id=e.store_id join public.produtos p on p.id=e.product_id where(p_store is null or e.store_id=p_store)and(p_product is null or e.product_id=p_product)and(p_from is null or (v.created_at at time zone 'America/Sao_Paulo')::date>=p_from)and(p_to is null or (v.created_at at time zone 'America/Sao_Paulo')::date<=p_to)),products as(select product_id,max(name)name,store_id,sum(quantity)quantity,sum(revenue)revenue,case when bool_or(pending or cost is null)then null else sum(cost)end cost,case when bool_or(pending or cost is null)then null else sum(margin)end margin from e group by product_id,store_id),sales as(select sale_id,max(numero)number,store_id,max(store_name)store_name,max(created_at)created_at,max(status)status,sum(quantity)quantity,sum(revenue)revenue,case when bool_or(pending or cost is null)then null else sum(cost)end cost,case when bool_or(pending or cost is null)then null else sum(margin)end margin,bool_or(pending)pending from e group by sale_id,store_id)
 select jsonb_build_object('stores',(select coalesce(jsonb_agg(jsonb_build_object('id',s.store_id,'name',l.nome,'total',s.total,'pending',s.pending,'unlocked_at',s.unlocked_at,'unlocked_margin',s.unlocked_margin)),'[]')from halloween_private.margin_stores s join public.lojas l on l.id=s.store_id where s.campaign_id=p_campaign and(p_store is null or s.store_id=p_store)),'products',(select coalesce(jsonb_agg(to_jsonb(p)),'[]')from products p),'sales',(select coalesce(jsonb_agg(to_jsonb(s)),'[]')from sales s),'last_sync_at',(select max(last_sync_at)from halloween_private.margin_stores where campaign_id=p_campaign),'sync_error',case when exists(select 1 from pg_extension where extname='pg_cron')then null else 'pg_cron ausente: reconciliação automática indisponível'end)into output;
 return output;
end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_payment_pending(p_campaign text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.payment_pending(p_campaign,p_offset)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_payment_review(p_campaign text, p_kind text, p_number integer, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.payment_review(p_campaign,p_kind,p_number,p_offset)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_pdv_rules(p_campaign text DEFAULT 'halloween-2026'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
select coalesce(jsonb_agg(jsonb_build_object('product_id',p.id,'rule_id',r.rule_id,'campaign_id',p_campaign,'percent',r.percent,'version',r.version)),'[]')from public.produtos p join halloween_private.margin_rules r on p.codigo=r.code where p_campaign='halloween-2026' and halloween_private.margin_window(p_campaign)and p.ativo and (select count(*)from public.produtos z where z.codigo=r.code and z.ativo)=1
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_redeem(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.redeem(p_code)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_redeem_at(p_code text, p_loja uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.redeem_at(p_code,p_loja)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_reissue(p_code text, p_reason text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.reissue(p_code,p_reason)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_spin(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$select halloween_private.spin(p_token)$function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_store_prizes_state(p_campaign text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$
begin perform halloween_private.require_staff();return(select coalesce(jsonb_agg(jsonb_build_object('store_id',s.store_id,'store_name',l.nome,'slot',s.slot,'code',s.code,'name',s.name,'quantity',s.quantity,'remaining',s.remaining,'enabled',s.enabled)order by l.nome,s.slot),'[]')from halloween_private.store_prizes s join public.lojas l on l.id=s.store_id where s.campaign_id=p_campaign);end $function$;

-- routines
CREATE OR REPLACE FUNCTION public.halloween_ticket(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '3s'
 SET statement_timeout TO '10s'
AS $function$select jsonb_set(t,'{campaign}',halloween_private.surprise_catalog(t->'campaign'))from(select halloween_private.ticket(p_token)t)x$function$;

-- routines
CREATE OR REPLACE FUNCTION public.limpar_obs_cobranca()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  p_id text := coalesce(new.pessoa_id, old.pessoa_id);
begin
  if p_id is not null then
    if not exists (
      select 1 from lancamentos l
      where l.pessoa_id = p_id
        and l.tipo = 'receber'
        and l.status = 'pendente'
        and coalesce(l.valor, 0) - coalesce(l.valor_pago, 0) > 0.01
    ) then
      update pessoas set obs_cobranca = null where id = p_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.marcar_lembrete_feito(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_ja record;
begin
  select f.perfil_id, f.feito_em into v_ja
  from lembretes_feitos f
  where f.lembrete_id = p_lembrete_id and f.data = p_data;

  if found then
    return jsonb_build_object('ja_feito', true, 'perfil_id', v_ja.perfil_id, 'feito_em', v_ja.feito_em);
  end if;

  insert into lembretes_feitos (lembrete_id, data, perfil_id, comprovante_url)
  values (p_lembrete_id, p_data, p_perfil_id, p_comprovante_url)
  on conflict (lembrete_id, data) do nothing;

  return jsonb_build_object('ja_feito', false);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.movimentar_estoque(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb DEFAULT '[]'::jsonb, p_observacao text DEFAULT NULL::text, p_user text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_controla boolean;
  v_permite  boolean := false;
  v_ant      numeric := 0;
  v_nova     numeric;
  v_est_id   uuid;
  v_qtd      int := 0;
  v_novos    int := 0;
  v_dup      int := 0;
  v_s        jsonb;
  v_now      timestamptz := coalesce(p_created_at, now());
  v_upd      timestamptz := now();
  v_nome     text;
  v_custo    numeric := 0;
  v_loja     uuid;
begin
  select controla_serie, nome, preco_custo into v_controla, v_nome, v_custo from produtos where id = p_produto_id;
  if v_controla is null then
    raise exception 'Produto não encontrado';
  end if;
  select permite_estoque_negativo into v_permite from produtos where id = p_produto_id;
  select loja_id into v_loja from depositos where id = p_deposito_id;

  -- TRAVA (19/09): quantidade negativa não pode inverter a operação.
  if not v_controla and p_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa';
  end if;

  select id, quantidade into v_est_id, v_ant from estoque
    where produto_id = p_produto_id and deposito_id = p_deposito_id
    for update;
  v_ant := coalesce(v_ant, 0);

  if p_operacao = 'entrada' then
    if v_controla then
      if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) = 0 then
        raise exception 'Produto serializado: informe os IMEIs na entrada';
      end if;
      for v_s in select * from jsonb_array_elements(p_series) loop
        insert into numeros_serie (produto_id, deposito_id, serie, status)
        values (p_produto_id, p_deposito_id, v_s->>'serie', 'em_estoque')
        on conflict (produto_id, serie) do nothing;
        if found then v_novos := v_novos + 1; else v_dup := v_dup + 1; end if;
      end loop;
      v_qtd := v_novos;
    else
      v_qtd := round(p_quantidade)::int;
    end if;
    v_nova := v_ant + v_qtd;

  elsif p_operacao in ('saida', 'perda', 'uso_interno') then
    if v_controla then
      if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) = 0 then
        raise exception 'Produto serializado: escolha os IMEIs para dar baixa';
      end if;
      for v_s in select * from jsonb_array_elements(p_series) loop
        update numeros_serie set status = 'defeito', updated_at = v_upd
        where produto_id = p_produto_id and serie = (v_s->>'serie')
          and deposito_id = p_deposito_id and status = 'em_estoque';
        if not found then
          raise exception 'IMEI % não está em estoque neste depósito', v_s->>'serie';
        end if;
        v_qtd := v_qtd + 1;
      end loop;
    else
      v_qtd := round(p_quantidade)::int;
      if not v_permite and v_qtd > v_ant then
        raise exception 'Estoque insuficiente para dar baixa (disponível: %, tentando tirar: %)', v_ant, v_qtd;
      end if;
    end if;
    if v_permite then
      v_nova := v_ant - v_qtd;
    else
      v_nova := greatest(0, v_ant - v_qtd);
    end if;

  elsif p_operacao = 'ajuste' then
    if v_controla then
      raise exception 'Ajuste manual não é permitido para produto serializado — a contagem vem dos IMEIs';
    end if;
    v_qtd := round(p_quantidade)::int;
    v_nova := v_qtd;

  else
    raise exception 'Operação inválida: %', p_operacao;
  end if;

  if v_est_id is not null then
    update estoque set quantidade = v_nova, updated_at = v_upd where id = v_est_id;
  else
    insert into estoque (produto_id, deposito_id, quantidade, updated_at)
    values (p_produto_id, p_deposito_id, v_nova, v_upd);
  end if;

  if p_operacao in ('perda', 'uso_interno') then
    insert into lancamentos (descricao, valor, tipo, status, valor_pago, categoria, data_competencia, data_vencimento, data_pagamento, created_at, updated_at, loja_id)
    values (
      case when p_operacao = 'perda' then 'Perda' else 'Uso interno' end || ': ' || coalesce(v_nome, p_produto_id) || case when v_qtd > 1 then ' (x' || v_qtd || ')' else '' end,
      coalesce(v_custo, 0) * v_qtd,
      'pagar', 'pago', coalesce(v_custo, 0) * v_qtd,
      case when p_operacao = 'perda' then 'Perda' else 'Uso interno' end,
      v_now, v_now, v_now, v_now, v_now, v_loja
    );
  end if;

  if p_operacao <> 'entrada' or v_qtd > 0 then
    insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
    values (p_produto_id, p_deposito_id, p_operacao, v_qtd, round(v_ant)::int, round(v_nova)::int, p_observacao, p_user, v_now);
  end if;

  return jsonb_build_object('qtd_nova', v_nova, 'novos', v_novos, 'duplicados', v_dup);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.pedido_app_venda_revertida(p_venda uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists(select 1 from public.vendas v where v.id=p_venda and v.status='cancelada')
    or (exists(select 1 from public.itens_venda i where i.venda_id=p_venda)
      and not exists (
        select 1 from public.itens_venda i where i.venda_id=p_venda
        group by i.produto_id having sum(i.quantidade) > coalesce((
          select sum(d.quantidade) from public.itens_devolucao d
          join public.devolucoes h on h.id=d.devolucao_id
          where h.venda_id=p_venda and h.status='concluida' and d.produto_id=i.produto_id
        ),0)
      ));
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.pessoas_set_nome_norm()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.nome_norm := lower(unaccent(coalesce(new.nome, '')));
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.processar_pedidos_app_credito(p_limite integer DEFAULT 5)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '2s'
AS $function$
declare q record; loja uuid; dep text; operador uuid; forma text; formas text[];
 total numeric; venda uuid; n integer:=0; resultado jsonb;
begin
 for q in select * from public.pedidos_app_credito_fila
   where estado='pendente' and proxima_tentativa<=now()
   order by criado_em,pedido_id,unidade limit greatest(1,least(coalesce(p_limite,5),5))
   for update skip locked loop
   begin
     -- A trava do pedido é a mesma da venda manual/cancelamento.
     perform 1 from public.pedidos_app where id=q.pedido_id for update;
     select venda_id into venda from public.pedidos_app_atendimentos where pedido_id=q.pedido_id and unidade=q.unidade;
     if venda is not null then
       update public.pedidos_app_credito_fila set estado='concluido',motivo=null,atualizado_em=now() where pedido_id=q.pedido_id and unidade=q.unidade;
       continue;
     end if;
     select l.id,l.deposito_padrao_id into loja,dep from public.lojas l
       join public.pedidos_app_unidades u on u.loja_id=l.id
       where u.unidade=q.unidade and l.ativa is true and l.pedidos_app_auto_credito;
     if not found then raise exception using errcode='P0001',message='Automação desativada nesta loja. Atenda no PDV.'; end if;
     select c.aberto_por into operador from public.caixas c
       where c.id=q.caixa_id and c.loja_id=loja and c.status='aberto' for update;
     if not found or operador is null then raise exception using errcode='P0001',message='Caixa fechado ou abertura sem funcionário identificado. Atenda no PDV.'; end if;
     if (select count(*) from public.caixas where loja_id=loja and status='aberto')<>1 then
       raise exception using errcode='P0001',message='Configuração de caixas ambígua. Atenda no PDV.';
     end if;
     perform public.validar_operador_pedido_app(operador,q.unidade);
     if not exists(select 1 from public.depositos d where d.id=dep and d.loja_id=loja and d.ativo is true) then
       raise exception using errcode='P0001',message='Confira o depósito padrão da loja no PDV.';
     end if;
     if not exists(select 1 from public.pedidos_app p join public.pessoas c on c.id=p.pessoa_id
       where p.id=q.pedido_id and p.status<>'cancelado' and c.permite_fiado is true) then
       raise exception using errcode='P0001',message='Pedido cancelado ou cliente sem Crédito Loja autorizado. Atenda no PDV.';
     end if;
     if exists(select 1 from public.pedidos_app p cross join lateral jsonb_array_elements(p.itens) i
       join public.produtos pr on pr.id=i->>'id' where p.id=q.pedido_id and i->>'loja'=q.unidade and pr.controla_serie is true) then
       raise exception using errcode='P0001',message='Escolha os IMEIs no PDV antes de vender.';
     end if;
     select array_agg(f.id) into formas from public.formas_pagamento f
       where f.ativo is true and f.tipo='fiado' and f.loja_id=loja;
     if coalesce(cardinality(formas),0)=0 then
       select array_agg(f.id) into formas from public.formas_pagamento f where f.ativo is true and f.tipo='fiado' and f.loja_id is null;
     end if;
     if coalesce(cardinality(formas),0)<>1 then raise exception using errcode='P0001',message='Confira a forma Crédito Loja da unidade no PDV.'; end if;
     forma:=formas[1];
     select sum((i->>'quantidade')::numeric*(i->>'preco')::numeric) into total
       from public.pedidos_app p cross join lateral jsonb_array_elements(p.itens) i where p.id=q.pedido_id and i->>'loja'=q.unidade;
     resultado:=public.finalizar_pedido_app_pdv(q.pedido_id,q.unidade,operador,dep,
       jsonb_build_array(jsonb_build_object('forma_pagamento_id',forma,'valor',total,'taxa',0,'maquina','','parcelas',1,'status','pendente')),'[]'::jsonb);
     if resultado->>'venda_id' is null then raise exception 'Finalizador não confirmou a venda.'; end if;
     update public.pedidos_app_credito_fila set estado='concluido',automatico=not coalesce((resultado->>'ja_existia')::boolean,false),motivo=null,tentativas=tentativas+1,atualizado_em=now()
       where pedido_id=q.pedido_id and unidade=q.unidade;
     n:=n+1;
   exception
     when sqlstate '40001' or sqlstate '40P01' or sqlstate '55P03' or sqlstate '57014' then
       update public.pedidos_app_credito_fila set tentativas=tentativas+1,
         estado=case when tentativas+1>=3 then 'manual' else 'pendente' end,
         motivo='Processamento interrompido. Confira o pedido no PDV.',proxima_tentativa=now()+interval '2 minutes',atualizado_em=now()
         where pedido_id=q.pedido_id and unidade=q.unidade;
     when others then
       -- Não expor erros internos nem repetir automaticamente bloqueios comerciais.
       update public.pedidos_app_credito_fila set estado='manual',tentativas=tentativas+1,
         motivo=case when sqlstate='P0001' and sqlerrm in(
           'Automação desativada nesta loja. Atenda no PDV.',
           'Caixa fechado ou abertura sem funcionário identificado. Atenda no PDV.',
           'Confira o depósito padrão da loja no PDV.',
           'Pedido cancelado ou cliente sem Crédito Loja autorizado. Atenda no PDV.',
           'Escolha os IMEIs no PDV antes de vender.',
           'Confira a forma Crédito Loja da unidade no PDV.') then sqlerrm else 'Revisão necessária no PDV: confira cadastro, estoque e condições da venda.' end,
         atualizado_em=now() where pedido_id=q.pedido_id and unidade=q.unidade;
   end;
 end loop;
 return n;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.produtos_set_busca_norm()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.busca_norm := lower(unaccent(
    coalesce(new.nome, '') || ' ' || coalesce(new.codigo, '') || ' ' || coalesce(new.marca, '')
  ));
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.receber_fiado_reais(p_lancamento_id text, p_valor numeric, p_forma text, p_historico jsonb DEFAULT '[]'::jsonb, p_conta_id uuid DEFAULT NULL::uuid, p_loja_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_valor numeric;
  v_valor_pago numeric;
  v_loja uuid;
  v_quitado boolean;
begin
  select valor, coalesce(valor_pago, 0), loja_id into v_valor, v_valor_pago, v_loja
  from lancamentos where id = p_lancamento_id and tipo = 'receber' and status = 'pendente' for update;
  if not found then raise exception 'Lançamento não encontrado ou já quitado.'; end if;
  if v_loja is not null and v_loja is distinct from p_loja_id then
    raise exception 'Dívida pertence a outra loja.';
  end if;
  if p_valor <= 0 then
    raise exception 'Valor deve ser positivo.';
  end if;
  if p_valor > round(v_valor - v_valor_pago, 2) then
    raise exception 'Valor maior que o saldo devedor.';
  end if;
  v_quitado := v_valor_pago + p_valor >= v_valor;
  update lancamentos set
    valor_pago = coalesce(valor_pago, 0) + p_valor,
    forma_pagamento = p_forma,
    conta_id = case when v_quitado then p_conta_id else conta_id end,
    status = case when v_quitado then 'pago' else status end,
    data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
    historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || p_historico,
    updated_at = now()
  where id = p_lancamento_id;
  return jsonb_build_object('quitado', v_quitado, 'valor_pago', v_valor_pago + p_valor);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.receber_fiados_vale(p_pessoa_id text, p_alocacoes jsonb, p_operacao_id uuid, p_loja_id uuid, p_usuario text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aloc      jsonb;
  v_lanc      record;
  v_id        text;
  v_dono      text;
  v_loja_lanc uuid;
  v_valor     numeric;
  v_saldo     numeric;
  v_total     numeric := 0;
  v_quitado   boolean;
  v_resultado jsonb := '[]'::jsonb;
  v_pedido    jsonb;
  v_anterior  recebimentos_lote_operacoes%rowtype;
  v_nome      text;
  v_today     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora     timestamptz := now();
begin
  if p_operacao_id is null then raise exception 'Operação obrigatória.'; end if;
  if p_pessoa_id is null then raise exception 'Cliente não identificado para usar vale-crédito.'; end if;
  if p_loja_id is null then raise exception 'Loja não identificada para usar vale-crédito.'; end if;
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  v_pedido := jsonb_build_object(
    'tipo', 'vale', 'pessoa', p_pessoa_id, 'loja', p_loja_id,
    'alocacoes', (select coalesce(jsonb_agg(item order by item->>'id'), '[]'::jsonb)
                   from jsonb_array_elements(p_alocacoes) item),
    'usuario', p_usuario
  );
  insert into recebimentos_lote_operacoes(id, pedido) values(p_operacao_id, v_pedido) on conflict do nothing;
  select * into v_anterior from recebimentos_lote_operacoes where id = p_operacao_id for update;
  if v_anterior.pedido is distinct from v_pedido then raise exception 'Operação reutilizada com dados diferentes.'; end if;
  if v_anterior.resultado is not null then return v_anterior.resultado; end if;

  select nome into v_nome from pessoas where id = p_pessoa_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;

  select coalesce(sum(case when tipo in ('uso','estorno') then -valor else valor end), 0)
    into v_saldo from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = p_loja_id;

  select coalesce(sum(round(coalesce((item->>'valor')::numeric, 0), 2)), 0)
    into v_total from jsonb_array_elements(p_alocacoes) item
   where round(coalesce((item->>'valor')::numeric, 0), 2) > 0;

  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  if v_saldo < v_total then
    raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %).', v_saldo;
  end if;

  for v_aloc in select item from jsonb_array_elements(p_alocacoes) item order by item->>'id' loop
    v_id := v_aloc->>'id';
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;

    select l.id, l.valor, l.valor_pago, l.pessoa_nome, l.codigo, l.pessoa_id, l.venda_id, l.status, l.loja_id
      into v_lanc
      from lancamentos l
     where l.id = v_id and l.tipo = 'receber' and l.status = 'pendente'
     for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento com vale.', v_id; end if;

    -- dono da dívida (pessoa_id do lançamento, senão da venda)
    v_dono := v_lanc.pessoa_id;
    if v_dono is null and v_lanc.venda_id is not null then
      select pessoa_id into v_dono from vendas where id = v_lanc.venda_id;
    end if;
    if v_dono is null then
      raise exception 'Fiado % não tem cliente identificado para usar vale-crédito.', coalesce(v_lanc.codigo::text, v_id);
    end if;
    if v_dono is distinct from p_pessoa_id then
      raise exception 'Fiado % pertence a outro cliente.', coalesce(v_lanc.codigo::text, v_id);
    end if;

    -- loja da dívida (lançamento, senão venda→depósito)
    v_loja_lanc := v_lanc.loja_id;
    if v_loja_lanc is null and v_lanc.venda_id is not null then
      select d.loja_id into v_loja_lanc from vendas v join depositos d on d.id = v.deposito_id where v.id = v_lanc.venda_id;
    end if;
    if v_loja_lanc is distinct from p_loja_id then
      raise exception 'Fiado % pertence a outra loja — vale-crédito só quita fiado da MESMA loja.', coalesce(v_lanc.codigo::text, v_id);
    end if;

    if v_valor > round(v_lanc.valor - coalesce(v_lanc.valor_pago, 0), 2) then
      raise exception 'Valor maior que saldo da dívida %.', v_id;
    end if;

    v_quitado := coalesce(v_lanc.valor_pago, 0) + v_valor >= v_lanc.valor;

    update lancamentos set
      valor_pago = coalesce(valor_pago, 0) + v_valor,
      forma_pagamento = 'Vale Crédito',
      conta_id = null,
      status = case when v_quitado then 'pago' else status end,
      data_pagamento = case when v_quitado then v_today else data_pagamento end,
      historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'valor', v_valor, 'forma', 'Vale Crédito',
        'data', to_char(v_agora at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS'),
        'operacao_id', p_operacao_id::text, 'usuario', coalesce(p_usuario, '')
      )),
      updated_at = v_agora
    where id = v_lanc.id;

    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, lancamento_id, loja_id)
    values (p_pessoa_id, coalesce(v_lanc.pessoa_nome, v_nome, 'Cliente'), v_valor, 'uso',
            'Uso no fiado #' || coalesce(v_lanc.codigo::text, v_id), v_id, p_loja_id);

    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('id', v_id, 'valor', v_valor, 'quitado', v_quitado));
  end loop;

  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.receber_lancamentos_lote(p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid, p_operacao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_aloc jsonb;
  v_lanc lancamentos%rowtype;
  v_valor numeric;
  v_total numeric := 0;
  v_quitado boolean;
  v_resultado jsonb := '[]'::jsonb;
  v_caixa_id uuid;
  v_pedido jsonb;
  v_anterior recebimentos_lote_operacoes%rowtype;
  v_nomes text[] := '{}'::text[];
  v_motivo text;
begin
  if p_operacao_id is null then raise exception 'Operação obrigatória.'; end if;
  v_pedido := jsonb_build_object('alocacoes', p_alocacoes, 'forma', p_forma, 'conta', p_conta_id, 'loja', p_loja_id);
  insert into recebimentos_lote_operacoes(id, pedido) values(p_operacao_id, v_pedido) on conflict do nothing;
  select * into v_anterior from recebimentos_lote_operacoes where id = p_operacao_id for update;
  if v_anterior.pedido is distinct from v_pedido then raise exception 'Operação reutilizada com dados diferentes.'; end if;
  if v_anterior.resultado is not null then return v_anterior.resultado; end if;
  select id into v_caixa_id from caixas where status = 'aberto' and loja_id = p_loja_id order by aberto_em desc limit 1 for update;
  if v_caixa_id is null then raise exception 'Abra o caixa da loja antes de receber.'; end if;
  if nullif(trim(p_forma), '') is null then raise exception 'Escolha uma forma de pagamento.'; end if;
  if jsonb_array_length(coalesce(p_alocacoes, '[]'::jsonb)) = 0 then raise exception 'Nenhuma dívida selecionada.'; end if;
  if (select count(*) from jsonb_array_elements(p_alocacoes)) <>
     (select count(distinct item->>'id') from jsonb_array_elements(p_alocacoes) item) then
    raise exception 'Dívida repetida no lote.';
  end if;

  for v_aloc in select item from jsonb_array_elements(p_alocacoes) item order by item->>'id' loop
    v_valor := round(coalesce((v_aloc->>'valor')::numeric, 0), 2);
    if v_valor <= 0 then continue; end if;
    select * into v_lanc from lancamentos
      where id = v_aloc->>'id' and tipo = 'receber' and status = 'pendente' for update;
    if not found then raise exception 'Dívida % não está disponível para recebimento.', v_aloc->>'id'; end if;
    if v_lanc.loja_id is null or v_lanc.loja_id is distinct from p_loja_id then raise exception 'Dívida sem loja ou de outra loja — vincule a loja antes de receber.'; end if;
    if v_valor > round(v_lanc.valor - coalesce(v_lanc.valor_pago, 0), 2) then
      raise exception 'Valor maior que saldo da dívida %.', v_lanc.id;
    end if;
    if v_lanc.pessoa_nome is not null and v_lanc.pessoa_nome <> '' and not (v_lanc.pessoa_nome = any(v_nomes)) then
      v_nomes := v_nomes || v_lanc.pessoa_nome;
    end if;
    v_quitado := coalesce(v_lanc.valor_pago, 0) + v_valor >= v_lanc.valor;
    update lancamentos set
      valor_pago = coalesce(valor_pago, 0) + v_valor,
      forma_pagamento = p_forma,
      conta_id = case when v_quitado then p_conta_id else conta_id end,
      status = case when v_quitado then 'pago' else status end,
      data_pagamento = case when v_quitado then (now() at time zone 'America/Sao_Paulo')::date else data_pagamento end,
      historico_pagamentos = coalesce(historico_pagamentos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'valor', v_valor, 'forma', p_forma, 'data', now()
      )), updated_at = now()
    where id = v_lanc.id;
    v_total := v_total + v_valor;
    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object('id', v_lanc.id, 'valor', v_valor, 'quitado', v_quitado));
  end loop;

  v_motivo := case
    when array_length(v_nomes, 1) = 1 then 'Fiado recebido — ' || v_nomes[1]
    when coalesce(array_length(v_nomes, 1), 0) > 1 then 'Fiado recebido — ' || array_length(v_nomes, 1) || ' clientes'
    else 'Fiado recebido — lote'
  end;

  if v_caixa_id is not null and v_total > 0 then
    insert into movimentos_caixa(caixa_id, tipo, motivo, forma_pagamento, valor)
    values(v_caixa_id, 'recebimento', v_motivo, p_forma, v_total);
  end if;
  if v_total <= 0 then raise exception 'Valor deve ser positivo.'; end if;
  v_resultado := jsonb_build_object('total', v_total, 'pagamentos', v_resultado);
  update recebimentos_lote_operacoes set resultado = v_resultado where id = p_operacao_id;
  return v_resultado;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.receber_nota_entrada(p_nota_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_status         text;
  v_item           record;
  v_qtd_antes      numeric;
  v_custo_antes    numeric;
  v_novo_custo     numeric;
  v_controla_serie boolean;
  v_serie          text;
  v_qtd_series     int;
begin
  select status into v_status from notas_entrada where id = p_nota_id for update;
  if v_status is null then raise exception 'Nota não encontrada'; end if;
  if v_status = 'recebida' then return; end if;

  for v_item in
    select produto_id, deposito_id, quantidade, preco_unitario, series
    from itens_nota_entrada where nota_id = p_nota_id
  loop
    if v_item.produto_id is null or v_item.deposito_id is null then continue; end if;

    select controla_serie into v_controla_serie from produtos where id = v_item.produto_id;
    if v_controla_serie then
      v_qtd_series := jsonb_array_length(coalesce(v_item.series, '[]'::jsonb));
      if v_qtd_series <> v_item.quantidade then
        raise exception 'Produto "%" controla IMEI: % cadastrado(s), mas a quantidade da nota é %. Cadastre todos os IMEIs antes de confirmar.',
          v_item.produto_id, v_qtd_series, v_item.quantidade;
      end if;
    end if;

    if coalesce(v_item.preco_unitario, 0) > 0 then
      select coalesce(sum(quantidade), 0) into v_qtd_antes
        from estoque where produto_id = v_item.produto_id;
      select coalesce(preco_custo, 0) into v_custo_antes
        from produtos where id = v_item.produto_id;
      if v_qtd_antes > 0 and v_custo_antes > 0 then
        v_novo_custo := (v_custo_antes * v_qtd_antes + v_item.preco_unitario * v_item.quantidade)
                        / (v_qtd_antes + v_item.quantidade);
      else
        v_novo_custo := v_item.preco_unitario;
      end if;
    end if;

    update estoque set quantidade = coalesce(quantidade, 0) + v_item.quantidade, updated_at = now()
      where produto_id = v_item.produto_id and deposito_id = v_item.deposito_id;
    if not found then
      insert into estoque (produto_id, deposito_id, quantidade)
        values (v_item.produto_id, v_item.deposito_id, v_item.quantidade);
    end if;

    if v_controla_serie then
      for v_serie in select * from jsonb_array_elements_text(coalesce(v_item.series, '[]'::jsonb))
      loop
        insert into numeros_serie (produto_id, deposito_id, serie, status, custo)
        values (v_item.produto_id, v_item.deposito_id, v_serie, 'em_estoque', v_item.preco_unitario);
      end loop;
    end if;

    if coalesce(v_item.preco_unitario, 0) > 0 then
      update produtos set preco_custo = round(v_novo_custo, 4) where id = v_item.produto_id;
    end if;
  end loop;

  update notas_entrada set status = 'recebida' where id = p_nota_id;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.reclassificar_forma_lancamento(p_lancamento_id text, p_forma_nova text, p_motivo text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_forma_original text;
  v_valor numeric;
  v_id uuid;
begin
  select forma_pagamento, coalesce(valor_pago, valor)
    into v_forma_original, v_valor
  from lancamentos
  where id = p_lancamento_id
  for update;
  if not found then
    raise exception 'lançamento não encontrado';
  end if;
  if v_forma_original = p_forma_nova then
    raise exception 'forma já é %', p_forma_nova;
  end if;

  update lancamentos set forma_pagamento = p_forma_nova where id = p_lancamento_id;

  insert into reclassificacoes_forma (lancamento_id, forma_original, forma_nova, valor, motivo, usuario_id)
  values (p_lancamento_id, v_forma_original, p_forma_nova, v_valor, p_motivo, p_usuario_id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reclassificacao_id', v_id, 'lancamento_id', p_lancamento_id, 'de', v_forma_original, 'para', p_forma_nova);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.reclassificar_forma_venda(p_pagamento_id uuid, p_forma_nova text, p_motivo text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_forma_original text;
  v_venda_id uuid;
  v_valor numeric;
  v_id uuid;
begin
  select forma_pagamento_id, venda_id, valor
    into v_forma_original, v_venda_id, v_valor
  from pagamentos_venda
  where id = p_pagamento_id
  for update;
  if not found then
    raise exception 'pagamento não encontrado';
  end if;
  if v_forma_original = p_forma_nova then
    raise exception 'forma já é %', p_forma_nova;
  end if;

  update pagamentos_venda set forma_pagamento_id = p_forma_nova where id = p_pagamento_id;

  insert into reclassificacoes_forma (venda_id, pagamento_id, forma_original, forma_nova, valor, motivo, usuario_id)
  values (v_venda_id, p_pagamento_id, v_forma_original, p_forma_nova, v_valor, p_motivo, p_usuario_id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'reclassificacao_id', v_id, 'venda_id', v_venda_id, 'de', v_forma_original, 'para', p_forma_nova);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.reconferir_reversao_pedido_app()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pedido uuid;
begin
  if tg_table_name='vendas' then
    select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.id;
  else
    select a.pedido_id into v_pedido from public.pedidos_app_atendimentos a where a.venda_id=new.venda_id;
  end if;
  if v_pedido is not null then perform public.sincronizar_estado_pedido_app(v_pedido); end if;
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.registrar_devolucao(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb DEFAULT '[]'::jsonb, p_reembolsos jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_devolucao_id   uuid := gen_random_uuid();
  v_venda_status   text;
  v_valor_total    numeric := 0;
  v_item           jsonb;
  v_s              jsonb;
  v_deposito       text;
  v_loja_id        uuid;
  v_estoque_id     uuid;
  v_reaproveitavel boolean;
  v_today          date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now            timestamptz := now();
  v_fiado_lanc_id  text;
  v_fiado_restante numeric;
  v_abate_fiado    numeric := 0;
  v_reembolso      numeric := 0;
  v_vendido        numeric;
  v_ja_devolvido   numeric;
  v_r              jsonb;
  v_soma_reemb     numeric := 0;
  v_reemb_dinheiro numeric := 0;
  v_tipo_r         text;
  v_valor_r        numeric;
  v_conta_r        uuid;
  v_caixa_id       uuid;
  v_registro       jsonb;
begin
  -- Venda CANCELADA não devolve item: o cancelamento já devolveu o estoque e
  -- estornou o dinheiro. Deixar devolver de novo duplicava a entrada no estoque e
  -- gerava reembolso em cima de venda cancelada (achado dos testes de 27/10).
  select status into v_venda_status from vendas where id = p_venda_id for update;
  if v_venda_status is null then
    raise exception 'Venda não encontrada.';
  end if;
  if v_venda_status = 'cancelada' then
    raise exception 'Esta venda está cancelada — o cancelamento já devolveu o estoque. Não dá para registrar devolução de venda cancelada.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if (v_item->>'quantidade')::numeric <= 0 then
      raise exception 'Quantidade de devolução inválida para "%": %',
        coalesce(v_item->>'nome', v_item->>'produto_id'), v_item->>'quantidade';
    end if;

    select coalesce(sum(quantidade), 0) into v_vendido
    from itens_venda
    where venda_id = p_venda_id and produto_id = (v_item->>'produto_id');

    select coalesce(sum(idv.quantidade), 0) into v_ja_devolvido
    from itens_devolucao idv
    join devolucoes d on d.id = idv.devolucao_id
    where d.venda_id = p_venda_id and idv.produto_id = (v_item->>'produto_id');

    if v_ja_devolvido + (v_item->>'quantidade')::numeric > v_vendido + 0.001 then
      raise exception 'Não dá para devolver % de "%": foram vendidas % e já devolvidas % (restam %).',
        (v_item->>'quantidade')::numeric,
        coalesce(v_item->>'nome', v_item->>'produto_id'),
        v_vendido, v_ja_devolvido, greatest(v_vendido - v_ja_devolvido, 0);
    end if;
  end loop;

  -- ═══ VALOR REAL — nunca confia no total_item/preco_unitario do chamador ═══
  select coalesce(sum(round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2)), 0)
  into v_valor_total
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  v_deposito := p_deposito_id;
  if v_deposito is null then
    select id into v_deposito from depositos order by nome limit 1;
  end if;
  if v_deposito is null then
    raise exception 'Nenhum depósito cadastrado para retornar o estoque.';
  end if;
  select loja_id into v_loja_id from depositos where id = v_deposito;

  insert into devolucoes (id, venda_id, deposito_id, pessoa_nome, vendedor_nome, motivo, valor_total, tipo_credito, status)
  values (v_devolucao_id, p_venda_id, v_deposito, coalesce(p_pessoa_nome, 'Cliente Final'),
          p_vendedor_nome, nullif(p_motivo, ''), v_valor_total, p_tipo_credito, 'concluida');

  insert into itens_devolucao (devolucao_id, produto_id, nome, quantidade, preco_unitario, total_item, status_produto)
  select v_devolucao_id, item->>'produto_id', item->>'nome', (item->>'quantidade')::numeric,
         round(coalesce(iv.preco_medio, 0), 2),
         round(coalesce(iv.preco_medio, 0) * (item->>'quantidade')::numeric, 2),
         coalesce(item->>'status_produto', 'ok')
  from jsonb_array_elements(p_itens) as item
  left join lateral (
    select sum(total_item) / nullif(sum(quantidade), 0) * coalesce((select greatest(0, 1 - coalesce(v.desconto,0) / nullif((select sum(x.total_item) from public.itens_venda x where x.venda_id = p_venda_id),0)) from public.vendas v where v.id = p_venda_id),1) as preco_medio
    from itens_venda
    where venda_id = p_venda_id and produto_id = item->>'produto_id'
  ) iv on true;

  -- retorno ao estoque — só 'ok' volta ao vendável
  for v_item in select * from jsonb_array_elements(p_itens) loop
    if exists (select 1 from jsonb_array_elements(p_series) s where s->>'produto_id' = v_item->>'produto_id') then
      continue;
    end if;
    if coalesce(v_item->>'status_produto', 'ok') <> 'ok' then
      continue;
    end if;
    select id into v_estoque_id from estoque
    where produto_id = (v_item->>'produto_id') and deposito_id = v_deposito
    for update;
    if found then
      update estoque set quantidade = quantidade + (v_item->>'quantidade')::numeric, updated_at = v_now where id = v_estoque_id;
    else
      insert into estoque (produto_id, deposito_id, quantidade)
      values (v_item->>'produto_id', v_deposito, (v_item->>'quantidade')::numeric);
    end if;
  end loop;

  for v_s in select * from jsonb_array_elements(p_series) loop
    v_reaproveitavel := (coalesce(v_s->>'status_produto', 'ok') = 'ok');
    update numeros_serie
      set status     = case when v_reaproveitavel then 'em_estoque' else 'defeito' end,
          venda_id   = null,
          deposito_id = v_deposito,
          updated_at = v_now
    where produto_id = (v_s->>'produto_id') and serie = (v_s->>'serie')
      and venda_id = p_venda_id::text and status = 'vendido';
    if not found then
      raise exception 'IMEI % não consta como vendido nesta venda', v_s->>'serie';
    end if;
    if v_reaproveitavel then
      select id into v_estoque_id from estoque
      where produto_id = (v_s->>'produto_id') and deposito_id = v_deposito
      for update;
      if found then
        update estoque set quantidade = quantidade + 1, updated_at = v_now where id = v_estoque_id;
      else
        insert into estoque (produto_id, deposito_id, quantidade) values (v_s->>'produto_id', v_deposito, 1);
      end if;
    end if;
  end loop;

  -- FOR UPDATE: trava a linha do fiado — sem isso, recebimento e devolução
  -- concorrentes liam o mesmo valor_pago e o cliente podia pagar e perder.
  select id, (valor - coalesce(valor_pago, 0))
  into v_fiado_lanc_id, v_fiado_restante
  from lancamentos
  where venda_id = p_venda_id and status = 'pendente' and tipo = 'receber'
  order by created_at limit 1
  for update;

  v_fiado_restante := coalesce(v_fiado_restante, 0);
  v_abate_fiado    := least(v_valor_total, greatest(v_fiado_restante, 0));
  v_reembolso      := v_valor_total - v_abate_fiado;

  if v_abate_fiado > 0.005 and v_fiado_lanc_id is not null then
    if v_fiado_restante - v_abate_fiado <= 0.01 then
      update lancamentos set status = 'cancelado', updated_at = v_now where id = v_fiado_lanc_id;
    else
      update lancamentos set valor = round(valor - v_abate_fiado, 2), updated_at = v_now where id = v_fiado_lanc_id;
    end if;
  end if;

  -- A entrada é contabilizada por pagamentos_venda. Só o reembolso recebe conta_id.
  if v_reembolso > 0.005 and p_tipo_credito = 'pix' and
      (p_reembolsos is null or jsonb_array_length(p_reembolsos) = 0) then
    p_reembolsos := jsonb_build_array(jsonb_build_object('tipo','pix','valor',v_reembolso,
      'conta_id',public.conta_pix_da_venda(p_venda_id)));
  end if;

  v_registro := '[]'::jsonb;
  if v_reembolso > 0.005 then
    -- ═══ MODO MISTO: várias formas de reembolso numa devolução só ═══
    if p_reembolsos is not null and jsonb_array_length(p_reembolsos) > 0 then
      select coalesce(sum((r->>'valor')::numeric), 0) into v_soma_reemb
      from jsonb_array_elements(p_reembolsos) as r;

      if exists (select 1 from jsonb_array_elements(p_reembolsos) as r where (r->>'valor')::numeric < 0) then
        raise exception 'Reembolso com valor negativo não é permitido';
      end if;

      if abs(v_soma_reemb - v_reembolso) > 0.01 then
        raise exception 'As formas de reembolso não fecham: somaram R$ %, mas o reembolso é R$ %',
          round(v_soma_reemb, 2), round(v_reembolso, 2);
      end if;

      for v_r in select * from jsonb_array_elements(p_reembolsos) loop
        v_tipo_r  := v_r->>'tipo';
        v_valor_r := (v_r->>'valor')::numeric;
        v_conta_r := nullif(v_r->>'conta_id', '')::uuid;
        if v_tipo_r = 'pix' and v_conta_r is null then
          v_conta_r := public.conta_pix_da_venda(p_venda_id);
        end if;
        if v_conta_r is not null and not exists(select 1 from public.contas where id=v_conta_r and ativa is true) then
          raise exception 'Conta de reembolso inexistente ou inativa.';
        end if;
        if v_valor_r <= 0.005 then continue; end if;
        v_registro := v_registro || jsonb_build_array(jsonb_build_object(
          'tipo',v_tipo_r,'valor',v_valor_r,'conta_id',v_conta_r));

        if v_tipo_r = 'credito_conta' then
          if p_pessoa_id is not null then
            insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
            values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
          end if;
        elsif v_tipo_r = 'dinheiro' then
          -- dinheiro sai da GAVETA (movimento de caixa, registrado na action)
          v_reemb_dinheiro := v_reemb_dinheiro + v_valor_r;
        elsif v_tipo_r not in ('sem_reembolso', 'cancelamento_fiado') then
          insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, conta_id, loja_id, updated_at, devolucao_id)
          values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_valor_r, 'pagar', v_today, v_today, 'pago', v_today, v_tipo_r, p_pessoa_nome, v_conta_r, v_loja_id, v_now, v_devolucao_id);
        end if;
      end loop;

    -- ═══ MODO ANTIGO: uma forma só (segue idêntico) ═══
    else
      if p_tipo_credito = 'credito_conta' then
        if p_pessoa_id is not null then
          insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
          values (p_pessoa_id, coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'credito', 'Devolução de compra', v_devolucao_id, v_loja_id);
        end if;
      elsif p_tipo_credito = 'dinheiro' then
        v_reemb_dinheiro := v_reembolso;
      elsif p_tipo_credito not in ('sem_reembolso', 'cancelamento_fiado') then
        insert into lancamentos (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, forma_pagamento, pessoa_nome, loja_id, updated_at, devolucao_id)
        values ('Devolução — ' || coalesce(p_pessoa_nome, 'Cliente'), v_reembolso, 'pagar', v_today, v_today, 'pago', v_today, p_tipo_credito, p_pessoa_nome, v_loja_id, v_now, v_devolucao_id);
      end if;
    end if;
  end if;

  select id into v_caixa_id from public.caixas
    where loja_id=v_loja_id and status='aberto' order by aberto_em desc limit 1 for share;
  if v_reembolso > 0.005 and jsonb_array_length(v_registro)=0 then
    v_registro := jsonb_build_array(jsonb_build_object('tipo',p_tipo_credito,'valor',v_reembolso));
  end if;
  update public.devolucoes set caixa_id=v_caixa_id,abate_fiado=v_abate_fiado,reembolsos=v_registro
    where id=v_devolucao_id;

  return jsonb_build_object(
    'devolucao_id', v_devolucao_id,
    'abate_fiado', v_abate_fiado,
    'reembolso', v_reembolso,
    'reembolso_dinheiro', v_reemb_dinheiro
  );
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.registrar_operacao_pedido_app(p_pedido uuid, p_unidade text, p_operador uuid, p_versao integer, p_tipo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.pedidos_app_operacao%rowtype; v_venda uuid; v_status text;
begin
 perform public.validar_operador_pedido_app(p_operador,p_unidade);
 if p_tipo is null or p_tipo not in ('assumir','transferir','impressao_solicitada','papel_confirmado','separado','entregue') then
   raise exception 'Ação inválida.';
 end if;
 -- Mesmo lock usado na finalização: revalidar situação sem interferir no financeiro.
 select status into v_status from public.pedidos_app where id=p_pedido
   and itens @> jsonb_build_array(jsonb_build_object('loja',p_unidade)) for update;
 if not found or v_status='cancelado' then raise exception 'Pedido indisponível.'; end if;
 select venda_id into v_venda from public.pedidos_app_atendimentos
   where pedido_id=p_pedido and unidade=p_unidade;
 insert into public.pedidos_app_operacao(pedido_id,unidade) values(p_pedido,p_unidade) on conflict do nothing;
 select * into v from public.pedidos_app_operacao where pedido_id=p_pedido and unidade=p_unidade for update;
 if p_versao is distinct from v.versao then raise exception 'Atendimento atualizado por outra pessoa. Atualize a lista.'; end if;
 if v.entregue_em is not null then raise exception 'Entrega já registrada.'; end if;
 if p_tipo='assumir' and v.responsavel_id is not null and v.responsavel_id<>p_operador then
   raise exception 'Pedido já tem responsável. Confira antes de transferir.';
 end if;
 if p_tipo not in ('assumir','transferir') and v.responsavel_id is distinct from p_operador then
   raise exception 'Somente o responsável pode registrar esta etapa.';
 end if;
 if p_tipo='papel_confirmado' and not exists(select 1 from public.pedidos_app_operacao_eventos
   where pedido_id=p_pedido and unidade=p_unidade and tipo='impressao_solicitada') then
   raise exception 'Registre primeiro a solicitação de impressão.';
 end if;
 if p_tipo='entregue' and (v_venda is null or public.pedido_app_venda_revertida(v_venda) or not exists(select 1 from public.vendas where id=v_venda and status='concluida')) then
   raise exception 'Entrega exige venda ativa vinculada.';
 end if;
 if p_tipo='entregue' and v.separado_em is null then raise exception 'Confirme a separação antes da entrega.'; end if;
 update public.pedidos_app_operacao set
   responsavel_id=case when p_tipo in ('assumir','transferir') then p_operador else responsavel_id end,
   responsavel_em=case when p_tipo in ('assumir','transferir') then now() else responsavel_em end,
   solicitacoes_impressao=solicitacoes_impressao+case when p_tipo='impressao_solicitada' then 1 else 0 end,
   separado_em=case when p_tipo='separado' then coalesce(separado_em,now()) else separado_em end,
   entregue_em=case when p_tipo='entregue' then now() else entregue_em end,
   papel_confirmado_em=case when p_tipo='papel_confirmado' then now() else papel_confirmado_em end,
   versao=versao+1 where pedido_id=p_pedido and unidade=p_unidade;
 insert into public.pedidos_app_operacao_eventos(pedido_id,unidade,operador_id,versao,tipo)
   values(p_pedido,p_unidade,p_operador,v.versao+1,p_tipo);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.relatorio_lucro_mensal()
 RETURNS TABLE(mes text, loja_id text, loja_nome text, faturamento numeric, custo_vendido numeric, compras numeric, ciclo1 numeric, ciclo2 numeric, ciclo3 numeric, tem_itens boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with vendas_ok as (
    select id, deposito_id, created_at, total
    from vendas
    where status = 'concluida'
      and uso_interno = false
      and numero < 100000
      -- equivale ao dataValida do JS (/^20\d{2}-/): ano 2000-2099, rejeita placeholder 1899 e null
      and created_at >= '2000-01-01'::timestamptz
      and created_at < '2100-01-01'::timestamptz
  ),
  fat as (
    select
      to_char(v.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
      coalesce(d.loja_id::text, v.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(v.total, 0)) as faturamento
    from vendas_ok v
    left join depositos d on d.id = v.deposito_id
    left join lojas l on l.id = d.loja_id
    group by 1, 2, 3
  ),
  custo as (
    select
      to_char(v.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
      coalesce(d.loja_id::text, v.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0)) as custo_vendido,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') <= 10
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo1,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') between 11 and 20
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo2,
      sum(case when extract(day from v.created_at at time zone 'America/Sao_Paulo') >= 21
            then coalesce(i.quantidade, 0) * coalesce(p.preco_custo, 0) else 0 end) as ciclo3
    from vendas_ok v
    join itens_venda i on i.venda_id = v.id
    left join produtos p on p.id = i.produto_id
    left join depositos d on d.id = v.deposito_id
    left join lojas l on l.id = d.loja_id
    group by 1, 2, 3
  ),
  compras_agg as (
    select
      substr(coalesce(n.data_entrada::text, ''), 1, 7) as mes,
      coalesce(d.loja_id::text, it.deposito_id) as loja_id,
      coalesce(l.nome, d.nome, 'Sem loja') as loja_nome,
      sum(coalesce(it.total_item, 0)) as compras
    from itens_nota_entrada it
    join notas_entrada n on n.id = it.nota_id
    left join depositos d on d.id = it.deposito_id
    left join lojas l on l.id = d.loja_id
    where n.status is distinct from 'cancelada'
    group by 1, 2, 3
  ),
  keys as (
    select mes, loja_id from fat
    union
    select mes, loja_id from custo
    union
    select mes, loja_id from compras_agg
  )
  select
    k.mes,
    k.loja_id,
    coalesce(f.loja_nome, c.loja_nome, cp.loja_nome, 'Sem loja') as loja_nome,
    coalesce(f.faturamento, 0) as faturamento,
    coalesce(c.custo_vendido, 0) as custo_vendido,
    coalesce(cp.compras, 0) as compras,
    coalesce(c.ciclo1, 0) as ciclo1,
    coalesce(c.ciclo2, 0) as ciclo2,
    coalesce(c.ciclo3, 0) as ciclo3,
    (c.mes is not null) as tem_itens
  from keys k
  left join fat f on f.mes = k.mes and f.loja_id is not distinct from k.loja_id
  left join custo c on c.mes = k.mes and c.loja_id is not distinct from k.loja_id
  left join compras_agg cp on cp.mes = k.mes and cp.loja_id is not distinct from k.loja_id
  order by k.mes, k.loja_id;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.reservar_chat(p_chave text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer; v_janela timestamptz := date_trunc('minute',now());
begin
  if p_chave is null or length(p_chave)>100 then return false; end if;
  insert into chat_limites values('global',v_janela,1)
  on conflict(chave) do update set janela=excluded.janela,
    chamadas=case when chat_limites.janela=excluded.janela then chat_limites.chamadas+1 else 1 end
  returning chamadas into v_n;
  if v_n>100 then return false; end if;
  insert into chat_limites values('cliente:'||p_chave,v_janela,1)
  on conflict(chave) do update set janela=excluded.janela,
    chamadas=case when chat_limites.janela=excluded.janela then chat_limites.chamadas+1 else 1 end
  returning chamadas into v_n;
  delete from chat_limites where janela < now()-interval '1 day';
  return v_n<=20;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_caixa(p_data date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT l.nome AS loja, c.status,
           c.valor_abertura AS abertura, c.valor_fechamento AS fechamento,
           coalesce((SELECT round(sum(v.total)::numeric,2) FROM vendas v WHERE v.caixa_id=c.id AND v.status='concluida'), 0) AS vendas
    FROM caixas c LEFT JOIN lojas l ON l.id=c.loja_id
    WHERE c.aberto_em >= (p_data::timestamp + interval '3 hours')::timestamptz
      AND c.aberto_em < (p_data::timestamp + interval '1 day 3 hours')::timestamptz
    ORDER BY c.aberto_em
  ) t;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_clientes(p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT coalesce(pe.nome,'Consumidor') AS cliente, count(*)::int AS compras, round(sum(v.total)::numeric,2) AS total
    FROM vendas v LEFT JOIN pessoas pe ON pe.id=v.pessoa_id
    WHERE v.status='concluida'
      AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz
      AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz
    GROUP BY pe.nome ORDER BY total DESC LIMIT 15
  ) t;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_estoque()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_pecas', coalesce((SELECT sum(e.quantidade)::int FROM estoque e WHERE e.quantidade > 0), 0),
    'por_deposito', coalesce((SELECT jsonb_agg(t) FROM (SELECT d.nome AS deposito, sum(e.quantidade)::int AS pecas FROM estoque e JOIN depositos d ON d.id=e.deposito_id WHERE e.quantidade > 0 GROUP BY d.nome ORDER BY pecas DESC) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_fiados()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_em_aberto', coalesce((SELECT round(sum(valor)::numeric,2) FROM lancamentos WHERE tipo='receber' AND status='pendente'), 0),
    'por_cliente', coalesce((SELECT jsonb_agg(t) FROM (SELECT coalesce(pessoa_nome,'(sem nome)') AS pessoa, round(sum(valor)::numeric,2) AS valor FROM lancamentos WHERE tipo='receber' AND status='pendente' GROUP BY pessoa_nome ORDER BY sum(valor) DESC LIMIT 20) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_formas(p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO r
  FROM (
    SELECT coalesce(f.nome,'(sem forma)') AS forma, round(sum(pg.valor)::numeric,2) AS valor
    FROM pagamentos_venda pg
    JOIN vendas v ON v.id=pg.venda_id
    LEFT JOIN formas_pagamento f ON f.id=pg.forma_pagamento_id
    WHERE v.status='concluida' AND pg.status='pago'
      AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz
      AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz
    GROUP BY f.nome ORDER BY valor DESC
  ) t;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.resumo_vendas(p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'faturamento', coalesce((SELECT round(sum(i.total_item)::numeric,2) FROM itens_venda i JOIN vendas v ON v.id=i.venda_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'quantidade', coalesce((SELECT sum(i.quantidade)::int FROM itens_venda i JOIN vendas v ON v.id=i.venda_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'lucro', coalesce((SELECT round(sum(i.total_item - coalesce(p.preco_custo,0)*i.quantidade)::numeric,2) FROM itens_venda i JOIN vendas v ON v.id=i.venda_id JOIN produtos p ON p.id=i.produto_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz), 0),
    'top_produtos', coalesce((SELECT jsonb_agg(t) FROM (SELECT p.nome, sum(i.quantidade)::int AS qtd, round(sum(i.total_item)::numeric,2) AS valor FROM itens_venda i JOIN vendas v ON v.id=i.venda_id JOIN produtos p ON p.id=i.produto_id WHERE v.status='concluida' AND v.created_at >= (p_de::timestamp + interval '3 hours')::timestamptz AND v.created_at < (p_ate::timestamp + interval '1 day 3 hours')::timestamptz GROUP BY p.nome ORDER BY qtd DESC LIMIT 10) t), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END; $function$;

-- routines
CREATE OR REPLACE FUNCTION public.reverter_reclassificacao_forma(p_reclassificacao_id uuid, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  r record;
begin
  select * into r from reclassificacoes_forma where id = p_reclassificacao_id for update;
  if not found then
    raise exception 'reclassificação não encontrada';
  end if;
  if r.revertida_em is not null then
    raise exception 'reclassificação já revertida';
  end if;

  if r.pagamento_id is not null then
    update pagamentos_venda set forma_pagamento_id = r.forma_original where id = r.pagamento_id;
  elsif r.lancamento_id is not null then
    update lancamentos set forma_pagamento = r.forma_original where id = r.lancamento_id;
  else
    raise exception 'reclassificação sem alvo';
  end if;

  update reclassificacoes_forma set revertida_em = now(), revertido_por = p_usuario_id where id = p_reclassificacao_id;

  return jsonb_build_object('ok', true, 'revertido', true, 'de', r.forma_nova, 'para', r.forma_original);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.sincronizar_estado_pedido_app(p_pedido uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_revertido boolean; v_completo boolean; v_pendente boolean; v_tem_reversao boolean;
begin
  perform 1 from public.pedidos_app where id=p_pedido for update;
  if not found then return; end if;
  select
    not exists(select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido
      and a.venda_id is not null and not public.pedido_app_venda_revertida(a.venda_id)),
    exists(select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p_pedido
      and a.venda_id is not null and public.pedido_app_venda_revertida(a.venda_id))
    into v_revertido,v_tem_reversao;
  if not v_tem_reversao then return; end if;
  select not exists (
    select 1 from public.pedidos_app p, jsonb_array_elements(p.itens) i
    where p.id=p_pedido and not exists (
      select 1 from public.pedidos_app_atendimentos a where a.pedido_id=p.id
        and a.unidade=i->>'loja' and a.venda_id is not null
    )
  ) into v_completo;
  select exists (
    select 1 from public.pedidos_app_atendimentos a join public.lancamentos l on l.venda_id=a.venda_id
    where a.pedido_id=p_pedido and not public.pedido_app_venda_revertida(a.venda_id)
      and l.tipo='receber' and l.status='pendente'
  ) into v_pendente;
  update public.pedidos_app set
    status=case when v_revertido and v_completo then 'cancelado' else 'pendente' end,
    status_pagamento=case when v_revertido or not v_completo or v_pendente then 'pendente' else 'pago' end
    where id=p_pedido;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.sincronizar_item_tabela_custo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tabela_id uuid;
begin
  select id into v_tabela_id from tabelas_preco where usa_preco_custo limit 1;
  if v_tabela_id is null then return new; end if;

  if new.ativo then
    insert into itens_tabela_preco (tabela_id, produto_id, preco, quantidade_minima)
    values (v_tabela_id, new.id, coalesce(new.preco_custo, 0), 1)
    on conflict (tabela_id, produto_id, quantidade_minima)
    do update set preco = excluded.preco;
  else
    delete from itens_tabela_preco
    where tabela_id = v_tabela_id and produto_id = new.id;
  end if;
  return new;
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.transferir_estoque(p_produto_id text, p_origem text, p_destino text, p_quantidade numeric, p_series jsonb DEFAULT '[]'::jsonb, p_obs text DEFAULT NULL::text, p_user text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_item    jsonb;
  v_qtd     numeric := p_quantidade;
  v_disp    numeric;
  v_est_id  uuid;
  v_now     timestamptz := now();
  v_nome_o  text;
  v_nome_d  text;
  v_antes_o numeric;
  v_antes_d numeric;
begin
  if p_origem is null or p_destino is null then
    raise exception 'Selecione origem e destino';
  end if;
  if p_origem = p_destino then
    raise exception 'Origem e destino devem ser diferentes';
  end if;

  if jsonb_array_length(coalesce(p_series, '[]'::jsonb)) > 0 then
    v_qtd := jsonb_array_length(p_series);
    for v_item in select * from jsonb_array_elements(p_series) loop
      update numeros_serie set deposito_id = p_destino, updated_at = v_now
      where produto_id = p_produto_id and serie = (v_item->>'serie')
        and deposito_id = p_origem and status = 'em_estoque';
      if not found then
        raise exception 'IMEI % não está em estoque na origem', v_item->>'serie';
      end if;
    end loop;
  end if;

  if v_qtd is null or v_qtd <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  select id, quantidade into v_est_id, v_disp from estoque
    where produto_id = p_produto_id and deposito_id = p_origem
    for update;
  if not found or v_disp < v_qtd then
    raise exception 'Estoque insuficiente na origem (disponível: %)', coalesce(v_disp, 0);
  end if;
  v_antes_o := v_disp;
  update estoque set quantidade = v_disp - v_qtd, updated_at = v_now where id = v_est_id;

  select quantidade into v_antes_d from estoque
    where produto_id = p_produto_id and deposito_id = p_destino
    for update;
  if found then
    update estoque set quantidade = v_antes_d + v_qtd, updated_at = v_now
      where produto_id = p_produto_id and deposito_id = p_destino;
  else
    v_antes_d := 0;
    insert into estoque (produto_id, deposito_id, quantidade) values (p_produto_id, p_destino, v_qtd);
  end if;

  select nome into v_nome_o from depositos where id = p_origem;
  select nome into v_nome_d from depositos where id = p_destino;

  insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
  values (p_produto_id, p_origem, 'saida', round(v_qtd)::int, round(v_antes_o)::int, round(v_antes_o - v_qtd)::int,
          'Transferência p/ ' || coalesce(v_nome_d, p_destino) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, v_now);
  insert into movimentacoes_estoque (produto_id, deposito_id, operacao, quantidade, qtd_anterior, qtd_nova, observacao, criado_por, created_at)
  values (p_produto_id, p_destino, 'entrada', round(v_qtd)::int, round(v_antes_d)::int, round(v_antes_d + v_qtd)::int,
          'Transferência de ' || coalesce(v_nome_o, p_origem) || coalesce(' | ' || nullif(p_obs, ''), ''), p_user, v_now);

  return jsonb_build_object('quantidade', v_qtd, 'origem', v_nome_o, 'destino', v_nome_d);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.usar_credito_cliente(p_pessoa_id text, p_valor numeric, p_descricao text, p_loja_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_saldo numeric;
  v_nome  text;
begin
  if p_valor <= 0 then raise exception 'Valor inválido.'; end if;

  perform 1 from pessoas where id = p_pessoa_id for update;

  select coalesce(sum(case when tipo in ('uso', 'estorno') then -valor else valor end), 0)
    into v_saldo
  from creditos_clientes where pessoa_id = p_pessoa_id and loja_id = p_loja_id;

  if v_saldo < p_valor then
    raise exception 'Saldo de crédito insuficiente nesta loja (disponível: %).', v_saldo;
  end if;

  select nome into v_nome from pessoas where id = p_pessoa_id;

  insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, loja_id)
  values (p_pessoa_id, coalesce(v_nome, 'Cliente'), p_valor, 'uso', p_descricao, p_loja_id);
end;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.usuario_e_funcionario()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.perfis
     where id = auth.uid()
       and ativo is not false
  );
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.usuario_interno()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.perfis
     where id = auth.uid() and coalesce(ativo, true)
  )
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.vale_usado_mes_anterior()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_saldo_anterior numeric;
  v_despesa numeric;
BEGIN
  IF NEW.tipo <> 'uso' THEN RETURN NEW; END IF;
  IF NEW.valor <= 0 THEN RETURN NEW; END IF;

  -- Saldo de vale que já existia ANTES do início do mês do uso (carregado de mês
  -- anterior). Se > 0, usar esse saldo agora não gera receita nova -> despesa.
  SELECT coalesce(sum(case when c.tipo = 'credito' then c.valor else -c.valor end), 0)
    INTO v_saldo_anterior
    FROM creditos_clientes c
   WHERE c.pessoa_id = NEW.pessoa_id
     AND c.loja_id IS NOT DISTINCT FROM NEW.loja_id
     AND c.created_at < date_trunc('month', NEW.created_at);

  v_despesa := least(NEW.valor, greatest(coalesce(v_saldo_anterior, 0), 0));

  IF v_despesa > 0 THEN
    INSERT INTO lancamentos (id, descricao, valor, tipo, categoria, pessoa_id, pessoa_nome, loja_id, data_competencia, data_vencimento, status, data_pagamento, valor_pago, updated_at)
    VALUES (
      gen_random_uuid()::text,
      'Vale crédito usado (mês anterior) — ' || coalesce(NEW.pessoa_nome, ''),
      v_despesa,
      'pagar',
      'Vale crédito usado',
      NEW.pessoa_id,
      NEW.pessoa_nome,
      NEW.loja_id,
      (now() at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date,
      'pago',
      now() at time zone 'America/Sao_Paulo',
      v_despesa,
      now()
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- routines
CREATE OR REPLACE FUNCTION public.validar_operador_pedido_app(p_operador uuid, p_unidade text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lojas uuid[];
  v_loja uuid;
  v_master boolean;
  v_permissoes text[];
begin
  select p.lojas_permitidas,
    case when c.id is not null then coalesce(c.is_master,false) else coalesce(p.is_master,false) end,
    coalesce(p.permissoes,'{}'::text[]) || coalesce(c.permissoes,'{}'::text[])
  into v_lojas,v_master,v_permissoes
  from public.perfis p
  left join public.cargos c on c.id=p.cargo_id and c.ativo is not false
  where p.id=p_operador and p.ativo is true;
  if not found or (not v_master and not ('pdv'=any(v_permissoes))) then
    raise exception 'Operador não autorizado.';
  end if;
  select u.loja_id into v_loja from public.pedidos_app_unidades u
    join public.lojas l on l.id=u.loja_id and l.ativa is true where u.unidade=p_unidade;
  if not found or (coalesce(cardinality(v_lojas),0)>0 and not (v_loja=any(v_lojas))) then
    raise exception 'Unidade não autorizada.';
  end if;
end;
$function$;

-- views
create view "public"."catalogo_app" ("id", "nome", "descricao", "preco", "categoria", "marca", "imagem_url", "codigo", "loja", "estoque") as  SELECT p.id,
    p.nome,
    p.descricao,
    p.preco,
    p.categoria,
    p.marca,
    p.imagem_url,
    p.codigo,
    l.nome AS loja,
    GREATEST(0::numeric, floor(COALESCE(sum(e.quantidade), 0::numeric)))::integer AS estoque
   FROM produtos p
     CROSS JOIN lojas l
     LEFT JOIN depositos d ON d.loja_id = l.id AND d.disponivel_app = true
     LEFT JOIN estoque e ON e.produto_id = p.id AND e.deposito_id = d.id
  WHERE p.ativo = true AND p.visivel_catalogo = true
  GROUP BY p.id, p.nome, p.descricao, p.preco, p.categoria, p.marca, p.imagem_url, p.codigo, l.id, l.nome;

-- views
create view "public"."pedidos_vendas" ("id", "numero", "numero_text", "tipo", "status", "total", "created_at", "cliente", "cliente_norm", "loja", "forma") as  SELECT p.id,
    p.numero::bigint AS numero,
    p.numero::text AS numero_text,
        CASE
            WHEN p.tipo = 'orcamento'::text THEN 'orcamento'::text
            ELSE 'pedido'::text
        END AS tipo,
    p.status,
    p.total::numeric AS total,
    p.created_at,
    pe.nome AS cliente,
    pe.nome_norm AS cliente_norm,
    dlo.nome AS loja,
    fp.nome AS forma
   FROM pedidos p
     LEFT JOIN pessoas pe ON pe.id = p.pessoa_id
     LEFT JOIN depositos d ON d.id = p.deposito_id
     LEFT JOIN lojas dlo ON dlo.id = d.loja_id
     LEFT JOIN formas_pagamento fp ON fp.id = p.forma_pagamento_id
UNION ALL
 SELECT v.id,
    v.numero::bigint AS numero,
    v.numero::text AS numero_text,
    'venda'::text AS tipo,
    v.status,
    v.total::numeric AS total,
    v.created_at,
    pe.nome AS cliente,
    pe.nome_norm AS cliente_norm,
    COALESCE(cxlo.nome, dlo.nome) AS loja,
    fp.nome AS forma
   FROM vendas v
     LEFT JOIN pessoas pe ON pe.id = v.pessoa_id
     LEFT JOIN caixas cx ON cx.id = v.caixa_id
     LEFT JOIN lojas cxlo ON cxlo.id = cx.loja_id
     LEFT JOIN depositos d ON d.id = v.deposito_id
     LEFT JOIN lojas dlo ON dlo.id = d.loja_id
     LEFT JOIN formas_pagamento fp ON fp.id = v.forma_pagamento_id;

-- rls
alter table "halloween_private"."audit" enable row level security;

-- rls
alter table "halloween_private"."campaigns" enable row level security;

-- rls
alter table "halloween_private"."coupons" enable row level security;

-- rls
alter table "halloween_private"."margin_cost_audit" enable row level security;

-- rls
alter table "halloween_private"."margin_items" enable row level security;

-- rls
alter table "halloween_private"."margin_operations" enable row level security;

-- rls
alter table "halloween_private"."margin_rules" enable row level security;

-- rls
alter table "halloween_private"."margin_stores" enable row level security;

-- rls
alter table "halloween_private"."payment_claims" enable row level security;

-- rls
alter table "halloween_private"."payment_proofs" enable row level security;

-- rls
alter table "halloween_private"."products" enable row level security;

-- rls
alter table "halloween_private"."sale_windows" enable row level security;

-- rls
alter table "halloween_private"."staff" enable row level security;

-- rls
alter table "halloween_private"."store_prizes" enable row level security;

-- rls
alter table "halloween_private"."store_reservations" enable row level security;

-- rls
alter table "halloween_private"."tickets" enable row level security;

-- rls
alter table "public"."apelidos_cliente" enable row level security;

-- rls
alter table "public"."bairros_entrega" enable row level security;

-- rls
alter table "public"."banco_horas" enable row level security;

-- rls
alter table "public"."cadastros_clientes" enable row level security;

-- rls
alter table "public"."caixas" enable row level security;

-- rls
alter table "public"."cargos" enable row level security;

-- rls
alter table "public"."categorias" enable row level security;

-- rls
alter table "public"."chat_limites" enable row level security;

-- rls
alter table "public"."chat_mensagens" enable row level security;

-- rls
alter table "public"."chat_sessoes" enable row level security;

-- rls
alter table "public"."checklists_modelo" enable row level security;

-- rls
alter table "public"."comprovantes_pix" enable row level security;

-- rls
alter table "public"."configuracoes" enable row level security;

-- rls
alter table "public"."consignados" enable row level security;

-- rls
alter table "public"."contas" enable row level security;

-- rls
alter table "public"."convites" enable row level security;

-- rls
alter table "public"."creditos_clientes" enable row level security;

-- rls
alter table "public"."depositos" enable row level security;

-- rls
alter table "public"."devolucoes" enable row level security;

-- rls
alter table "public"."empresas" enable row level security;

-- rls
alter table "public"."escala_excecoes" enable row level security;

-- rls
alter table "public"."escalas" enable row level security;

-- rls
alter table "public"."estoque" enable row level security;

-- rls
alter table "public"."faixas_promocao" enable row level security;

-- rls
alter table "public"."forma_conta_loja" enable row level security;

-- rls
alter table "public"."formas_pagamento" enable row level security;

-- rls
alter table "public"."historico_itens_venda" enable row level security;

-- rls
alter table "public"."historico_vendas" enable row level security;

-- rls
alter table "public"."integracoes_mercado_livre" enable row level security;

-- rls
alter table "public"."integracoes_mercado_livre_anuncios" enable row level security;

-- rls
alter table "public"."integracoes_mercado_livre_mensagens" enable row level security;

-- rls
alter table "public"."integracoes_mercado_livre_pedidos_pendentes" enable row level security;

-- rls
alter table "public"."integracoes_mercado_livre_perguntas" enable row level security;

-- rls
alter table "public"."itens_consignado" enable row level security;

-- rls
alter table "public"."itens_devolucao" enable row level security;

-- rls
alter table "public"."itens_nota_entrada" enable row level security;

-- rls
alter table "public"."itens_os" enable row level security;

-- rls
alter table "public"."itens_pedido" enable row level security;

-- rls
alter table "public"."itens_promocao" enable row level security;

-- rls
alter table "public"."itens_tabela_preco" enable row level security;

-- rls
alter table "public"."itens_venda" enable row level security;

-- rls
alter table "public"."lancamentos" enable row level security;

-- rls
alter table "public"."lembretes" enable row level security;

-- rls
alter table "public"."lembretes_feitos" enable row level security;

-- rls
alter table "public"."logs_atividade" enable row level security;

-- rls
alter table "public"."lojas" enable row level security;

-- rls
alter table "public"."maquinas_cartao" enable row level security;

-- rls
alter table "public"."marcas" enable row level security;

-- rls
alter table "public"."metas" enable row level security;

-- rls
alter table "public"."metas_faixas" enable row level security;

-- rls
alter table "public"."movimentacoes_estoque" enable row level security;

-- rls
alter table "public"."movimentos_caixa" enable row level security;

-- rls
alter table "public"."notas_entrada" enable row level security;

-- rls
alter table "public"."numeros_serie" enable row level security;

-- rls
alter table "public"."ordens_servico" enable row level security;

-- rls
alter table "public"."os_checklists" enable row level security;

-- rls
alter table "public"."pagamentos_venda" enable row level security;

-- rls
alter table "public"."pedidos" enable row level security;

-- rls
alter table "public"."pedidos_app" enable row level security;

-- rls
alter table "public"."pedidos_app_atendimentos" enable row level security;

-- rls
alter table "public"."pedidos_app_credito_fila" enable row level security;

-- rls
alter table "public"."pedidos_app_operacao" enable row level security;

-- rls
alter table "public"."pedidos_app_operacao_eventos" enable row level security;

-- rls
alter table "public"."pedidos_app_unidades" enable row level security;

-- rls
alter table "public"."perfis" enable row level security;

-- rls
alter table "public"."pessoas" enable row level security;

-- rls
alter table "public"."pix_periodos" enable row level security;

-- rls
alter table "public"."pontos" enable row level security;

-- rls
alter table "public"."produtos" enable row level security;

-- rls
alter table "public"."promocao_tabelas" enable row level security;

-- rls
alter table "public"."promocoes" enable row level security;

-- rls
alter table "public"."rascunhos_anuncio_ml" enable row level security;

-- rls
alter table "public"."recebimentos_lote_operacoes" enable row level security;

-- rls
alter table "public"."reclassificacoes_forma" enable row level security;

-- rls
alter table "public"."remessas_estoque" enable row level security;

-- rls
alter table "public"."remessas_estoque_itens" enable row level security;

-- rls
alter table "public"."sync_log" enable row level security;

-- rls
alter table "public"."tabelas_preco" enable row level security;

-- rls
alter table "public"."transferencias" enable row level security;

-- rls
alter table "public"."trocas_sp" enable row level security;

-- rls
alter table "public"."vales_credito" enable row level security;

-- rls
alter table "public"."vendas" enable row level security;

-- triggers
CREATE TRIGGER halloween_activation_window AFTER UPDATE OF active ON halloween_private.campaigns FOR EACH ROW EXECUTE FUNCTION halloween_private.activation_window();

-- triggers
CREATE TRIGGER link_store_prize AFTER INSERT ON halloween_private.coupons FOR EACH ROW EXECUTE FUNCTION halloween_private.link_store_prize();

-- triggers
CREATE TRIGGER reserve_store_prize BEFORE INSERT ON halloween_private.coupons FOR EACH ROW EXECUTE FUNCTION halloween_private.reserve_store_prize();

-- triggers
CREATE TRIGGER return_store_prize AFTER UPDATE OF released_at ON halloween_private.coupons FOR EACH ROW EXECUTE FUNCTION halloween_private.return_store_prize();

-- triggers
CREATE TRIGGER set_coupon_validity BEFORE INSERT ON halloween_private.coupons FOR EACH ROW EXECUTE FUNCTION halloween_private.set_coupon_validity();

-- triggers
CREATE TRIGGER trg_vale_usado_mes_anterior AFTER INSERT ON creditos_clientes FOR EACH ROW EXECUTE FUNCTION vale_usado_mes_anterior();

-- triggers
CREATE CONSTRAINT TRIGGER devolucao_integral_pedido_app AFTER INSERT OR UPDATE ON itens_devolucao DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION atualizar_devolucao_pedido_app();

-- triggers
CREATE TRIGGER limpar_obs_cobranca_trigger AFTER DELETE OR UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION limpar_obs_cobranca();

-- triggers
CREATE TRIGGER pagamento_pedido_app_f9 AFTER UPDATE OF status ON lancamentos FOR EACH ROW EXECUTE FUNCTION atualizar_pagamento_pedido_app();

-- triggers
CREATE CONSTRAINT TRIGGER reconferir_reversao_pedido_app_f9 AFTER UPDATE ON lancamentos DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconferir_reversao_pedido_app();

-- triggers
CREATE TRIGGER trg_definir_loja_lancamento BEFORE INSERT OR UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION definir_loja_lancamento();

-- triggers
CREATE TRIGGER pedido_app_credito_novo AFTER INSERT ON pedidos_app FOR EACH ROW EXECUTE FUNCTION enfileirar_pedido_app_credito();

-- triggers
CREATE TRIGGER trg_pessoas_nome_norm BEFORE INSERT OR UPDATE OF nome ON pessoas FOR EACH ROW EXECUTE FUNCTION pessoas_set_nome_norm();

-- triggers
CREATE TRIGGER trg_produtos_busca_norm BEFORE INSERT OR UPDATE OF nome, codigo, marca ON produtos FOR EACH ROW EXECUTE FUNCTION produtos_set_busca_norm();

-- triggers
CREATE TRIGGER trg_sincronizar_item_tabela_custo AFTER INSERT OR UPDATE OF preco_custo, ativo ON produtos FOR EACH ROW EXECUTE FUNCTION sincronizar_item_tabela_custo();

-- triggers
CREATE TRIGGER cancelamento_venda_pedido_app AFTER UPDATE OF status ON vendas FOR EACH ROW EXECUTE FUNCTION atualizar_cancelamento_venda_pedido_app();

-- triggers
CREATE CONSTRAINT TRIGGER reconferir_reversao_pedido_app_venda AFTER UPDATE ON vendas DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reconferir_reversao_pedido_app();

-- policies
create policy "Cliente completa cadastro pendente" on "public"."cadastros_clientes" as PERMISSIVE for UPDATE to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pendente'::text))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pendente'::text) AND (pessoa_id IS NULL) AND (lower(email) = lower(( SELECT (auth.jwt() ->> 'email'::text)))) AND ((comprovante_path IS NULL) OR starts_with(comprovante_path, ((user_id)::text || '/'::text)))));

-- policies
create policy "Cliente inicia cadastro pendente" on "public"."cadastros_clientes" as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pendente'::text) AND (pessoa_id IS NULL) AND (lower(email) = lower(( SELECT (auth.jwt() ->> 'email'::text)))) AND ((comprovante_path IS NULL) OR starts_with(comprovante_path, ((user_id)::text || '/'::text)))));

-- policies
create policy "Cliente le seu cadastro" on "public"."cadastros_clientes" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

-- policies
create policy "auth_caixas" on "public"."caixas" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Leitura pública de categorias" on "public"."categorias" as PERMISSIVE for SELECT to "anon", "authenticated" using (true);

-- policies
create policy "auth_categorias" on "public"."categorias" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Usuário acessa suas mensagens" on "public"."chat_mensagens" as PERMISSIVE for ALL to "authenticated" using ((sessao_id IN ( SELECT chat_sessoes.id
   FROM chat_sessoes
  WHERE (chat_sessoes.usuario_id = auth.uid()))));

-- policies
create policy "Usuário acessa seus chats" on "public"."chat_sessoes" as PERMISSIVE for ALL to "authenticated" using ((usuario_id = auth.uid()));

-- policies
create policy "auth_config" on "public"."configuracoes" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Autenticados gerenciam consignados" on "public"."consignados" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "autenticados inserem creditos_clientes" on "public"."creditos_clientes" as PERMISSIVE for INSERT to "authenticated" with check (true);

-- policies
create policy "autenticados leem creditos_clientes" on "public"."creditos_clientes" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "service role acessa creditos_clientes" on "public"."creditos_clientes" as PERMISSIVE for ALL to "service_role" using (true);

-- policies
create policy "Funcionários leem depósitos" on "public"."depositos" as PERMISSIVE for SELECT to "authenticated" using (usuario_e_funcionario());

-- policies
create policy "auth_depositos" on "public"."depositos" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "auth_empresas" on "public"."empresas" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Funcionários leem estoque" on "public"."estoque" as PERMISSIVE for SELECT to "authenticated" using (usuario_e_funcionario());

-- policies
create policy "auth_estoque" on "public"."estoque" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Funcionários leem formas de pagamento" on "public"."formas_pagamento" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "app_somente_internos" on "public"."formas_pagamento" as RESTRICTIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "auth_formas_pagamento" on "public"."formas_pagamento" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Autenticados gerenciam itens consignado" on "public"."itens_consignado" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "auth_notas_itens" on "public"."itens_nota_entrada" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Autenticados atualizam itens_os" on "public"."itens_os" as PERMISSIVE for UPDATE to "authenticated" using (true);

-- policies
create policy "Autenticados inserem itens_os" on "public"."itens_os" as PERMISSIVE for INSERT to "authenticated" with check (true);

-- policies
create policy "Autenticados leem itens_os" on "public"."itens_os" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "itens_pedido_interno" on "public"."itens_pedido" as PERMISSIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "auth_itens_tabela" on "public"."itens_tabela_preco" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "allow_auth_itens_venda" on "public"."itens_venda" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Funcionarios atualizam lancamentos" on "public"."lancamentos" as PERMISSIVE for UPDATE to "authenticated" using (true) with check (true);

-- policies
create policy "Funcionários leem lançamentos" on "public"."lancamentos" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "Funcion�rios atualizam lan�amentos" on "public"."lancamentos" as PERMISSIVE for UPDATE to "authenticated" using (true) with check (true);

-- policies
create policy "app_somente_internos" on "public"."lancamentos" as RESTRICTIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "auth_lancamentos" on "public"."lancamentos" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "logs_leitura" on "public"."logs_atividade" as PERMISSIVE for SELECT to PUBLIC using ((auth.role() = 'authenticated'::text));

-- policies
create policy "Leitura pública de marcas" on "public"."marcas" as PERMISSIVE for SELECT to "anon", "authenticated" using (true);

-- policies
create policy "auth_marcas" on "public"."marcas" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "auth_notas_entrada" on "public"."notas_entrada" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Autenticados atualizam ordens_servico" on "public"."ordens_servico" as PERMISSIVE for UPDATE to "authenticated" using (true);

-- policies
create policy "Autenticados inserem ordens_servico" on "public"."ordens_servico" as PERMISSIVE for INSERT to "authenticated" with check (true);

-- policies
create policy "Autenticados leem ordens_servico" on "public"."ordens_servico" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "Funcionários leem pagamentos_venda" on "public"."pagamentos_venda" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "pedidos_interno" on "public"."pedidos" as PERMISSIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "Cliente le seus pedidos" on "public"."pedidos_app" as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

-- policies
create policy "Autenticados leem perfis" on "public"."perfis" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "Service role gerencia perfis" on "public"."perfis" as PERMISSIVE for ALL to "service_role" using (true);

-- policies
create policy "app_somente_internos" on "public"."perfis" as RESTRICTIVE for SELECT to "authenticated" using (usuario_interno());

-- policies
create policy "pessoas_interno" on "public"."pessoas" as PERMISSIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "Funcionários leem produtos" on "public"."produtos" as PERMISSIVE for SELECT to "authenticated" using (usuario_e_funcionario());

-- policies
create policy "auth_produtos" on "public"."produtos" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "auth_promocoes" on "public"."promocoes" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Funcionários leem sync_log" on "public"."sync_log" as PERMISSIVE for SELECT to "authenticated" using (true);

-- policies
create policy "app_somente_internos" on "public"."sync_log" as RESTRICTIVE for ALL to "authenticated" using (usuario_interno()) with check (usuario_interno());

-- policies
create policy "auth_tabelas" on "public"."tabelas_preco" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "trocas_sp_auth" on "public"."trocas_sp" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "auth_vales" on "public"."vales_credito" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "allow_auth_vendas" on "public"."vendas" as PERMISSIVE for ALL to "authenticated" using (true) with check (true);

-- policies
create policy "Tecnocell app cliente envia comprovante" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated" with check (((bucket_id = 'cadastros-clientes'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- policies
create policy "Tecnocell app cliente le comprovante" on "storage"."objects" as PERMISSIVE for SELECT to "authenticated" using (((bucket_id = 'cadastros-clientes'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- policies
create policy "Tecnocell app cliente troca comprovante" on "storage"."objects" as PERMISSIVE for UPDATE to "authenticated" using (((bucket_id = 'cadastros-clientes'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = 'cadastros-clientes'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

-- grants
revoke all on schema "halloween_private" from PUBLIC, anon, authenticated, service_role;

-- grants
grant USAGE on schema "halloween_private" to "postgres";

-- grants
grant CREATE on schema "halloween_private" to "postgres";

-- grants
grant USAGE on schema "halloween_private" to "anon";

-- grants
grant USAGE on schema "halloween_private" to "authenticated";

-- grants
revoke all on schema "public" from PUBLIC, anon, authenticated, service_role;

-- grants
grant USAGE on schema "public" to "pg_database_owner";

-- grants
grant CREATE on schema "public" to "pg_database_owner";

-- grants
grant USAGE on schema "public" to PUBLIC;

-- grants
grant USAGE on schema "public" to "postgres";

-- grants
grant USAGE on schema "public" to "anon";

-- grants
grant USAGE on schema "public" to "authenticated";

-- grants
grant USAGE on schema "public" to "service_role";

-- grants
revoke all on table "halloween_private"."audit" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."audit" to "postgres";

-- grants
grant SELECT on table "halloween_private"."audit" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."audit" to "postgres";

-- grants
grant DELETE on table "halloween_private"."audit" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."audit" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."audit" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."audit" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."audit" to "postgres";

-- grants
revoke all on table "halloween_private"."campaigns" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."campaigns" to "postgres";

-- grants
grant SELECT on table "halloween_private"."campaigns" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."campaigns" to "postgres";

-- grants
grant DELETE on table "halloween_private"."campaigns" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."campaigns" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."campaigns" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."campaigns" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."campaigns" to "postgres";

-- grants
revoke all on table "halloween_private"."coupons" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."coupons" to "postgres";

-- grants
grant SELECT on table "halloween_private"."coupons" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."coupons" to "postgres";

-- grants
grant DELETE on table "halloween_private"."coupons" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."coupons" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."coupons" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."coupons" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."coupons" to "postgres";

-- grants
revoke all on table "halloween_private"."margin_cost_audit" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant SELECT on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant DELETE on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."margin_cost_audit" to "postgres";

-- grants
revoke all on table "halloween_private"."margin_items" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."margin_items" to "postgres";

-- grants
grant SELECT on table "halloween_private"."margin_items" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."margin_items" to "postgres";

-- grants
grant DELETE on table "halloween_private"."margin_items" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."margin_items" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."margin_items" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."margin_items" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."margin_items" to "postgres";

-- grants
revoke all on table "halloween_private"."margin_operations" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant SELECT on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant DELETE on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."margin_operations" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."margin_operations" to "postgres";

-- grants
revoke all on table "halloween_private"."margin_rules" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant SELECT on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant DELETE on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."margin_rules" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."margin_rules" to "postgres";

-- grants
revoke all on table "halloween_private"."margin_stores" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant SELECT on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant DELETE on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."margin_stores" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."margin_stores" to "postgres";

-- grants
revoke all on table "halloween_private"."payment_claims" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant SELECT on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant DELETE on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."payment_claims" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."payment_claims" to "postgres";

-- grants
revoke all on table "halloween_private"."payment_proofs" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant SELECT on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant DELETE on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."payment_proofs" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."payment_proofs" to "postgres";

-- grants
revoke all on table "halloween_private"."products" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."products" to "postgres";

-- grants
grant SELECT on table "halloween_private"."products" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."products" to "postgres";

-- grants
grant DELETE on table "halloween_private"."products" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."products" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."products" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."products" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."products" to "postgres";

-- grants
revoke all on table "halloween_private"."sale_windows" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant SELECT on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant DELETE on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."sale_windows" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."sale_windows" to "postgres";

-- grants
revoke all on table "halloween_private"."staff" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."staff" to "postgres";

-- grants
grant SELECT on table "halloween_private"."staff" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."staff" to "postgres";

-- grants
grant DELETE on table "halloween_private"."staff" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."staff" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."staff" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."staff" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."staff" to "postgres";

-- grants
revoke all on table "halloween_private"."store_prizes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant SELECT on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant DELETE on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."store_prizes" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."store_prizes" to "postgres";

-- grants
revoke all on table "halloween_private"."store_reservations" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant SELECT on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant DELETE on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."store_reservations" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."store_reservations" to "postgres";

-- grants
revoke all on table "halloween_private"."tickets" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "halloween_private"."tickets" to "postgres";

-- grants
grant SELECT on table "halloween_private"."tickets" to "postgres";

-- grants
grant UPDATE on table "halloween_private"."tickets" to "postgres";

-- grants
grant DELETE on table "halloween_private"."tickets" to "postgres";

-- grants
grant TRUNCATE on table "halloween_private"."tickets" to "postgres";

-- grants
grant REFERENCES on table "halloween_private"."tickets" to "postgres";

-- grants
grant TRIGGER on table "halloween_private"."tickets" to "postgres";

-- grants
grant MAINTAIN on table "halloween_private"."tickets" to "postgres";

-- grants
revoke all on table "public"."apelidos_cliente" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."apelidos_cliente" to "postgres";

-- grants
grant SELECT on table "public"."apelidos_cliente" to "postgres";

-- grants
grant UPDATE on table "public"."apelidos_cliente" to "postgres";

-- grants
grant DELETE on table "public"."apelidos_cliente" to "postgres";

-- grants
grant TRUNCATE on table "public"."apelidos_cliente" to "postgres";

-- grants
grant REFERENCES on table "public"."apelidos_cliente" to "postgres";

-- grants
grant TRIGGER on table "public"."apelidos_cliente" to "postgres";

-- grants
grant MAINTAIN on table "public"."apelidos_cliente" to "postgres";

-- grants
grant INSERT on table "public"."apelidos_cliente" to "anon";

-- grants
grant SELECT on table "public"."apelidos_cliente" to "anon";

-- grants
grant UPDATE on table "public"."apelidos_cliente" to "anon";

-- grants
grant DELETE on table "public"."apelidos_cliente" to "anon";

-- grants
grant TRUNCATE on table "public"."apelidos_cliente" to "anon";

-- grants
grant REFERENCES on table "public"."apelidos_cliente" to "anon";

-- grants
grant TRIGGER on table "public"."apelidos_cliente" to "anon";

-- grants
grant MAINTAIN on table "public"."apelidos_cliente" to "anon";

-- grants
grant INSERT on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant SELECT on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant UPDATE on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant DELETE on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant TRUNCATE on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant REFERENCES on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant TRIGGER on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant MAINTAIN on table "public"."apelidos_cliente" to "authenticated";

-- grants
grant INSERT on table "public"."apelidos_cliente" to "service_role";

-- grants
grant SELECT on table "public"."apelidos_cliente" to "service_role";

-- grants
grant UPDATE on table "public"."apelidos_cliente" to "service_role";

-- grants
grant DELETE on table "public"."apelidos_cliente" to "service_role";

-- grants
grant TRUNCATE on table "public"."apelidos_cliente" to "service_role";

-- grants
grant REFERENCES on table "public"."apelidos_cliente" to "service_role";

-- grants
grant TRIGGER on table "public"."apelidos_cliente" to "service_role";

-- grants
grant MAINTAIN on table "public"."apelidos_cliente" to "service_role";

-- grants
revoke all on table "public"."bairros_entrega" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."bairros_entrega" to "postgres";

-- grants
grant SELECT on table "public"."bairros_entrega" to "postgres";

-- grants
grant UPDATE on table "public"."bairros_entrega" to "postgres";

-- grants
grant DELETE on table "public"."bairros_entrega" to "postgres";

-- grants
grant TRUNCATE on table "public"."bairros_entrega" to "postgres";

-- grants
grant REFERENCES on table "public"."bairros_entrega" to "postgres";

-- grants
grant TRIGGER on table "public"."bairros_entrega" to "postgres";

-- grants
grant MAINTAIN on table "public"."bairros_entrega" to "postgres";

-- grants
grant INSERT on table "public"."bairros_entrega" to "anon";

-- grants
grant SELECT on table "public"."bairros_entrega" to "anon";

-- grants
grant UPDATE on table "public"."bairros_entrega" to "anon";

-- grants
grant DELETE on table "public"."bairros_entrega" to "anon";

-- grants
grant TRUNCATE on table "public"."bairros_entrega" to "anon";

-- grants
grant REFERENCES on table "public"."bairros_entrega" to "anon";

-- grants
grant TRIGGER on table "public"."bairros_entrega" to "anon";

-- grants
grant MAINTAIN on table "public"."bairros_entrega" to "anon";

-- grants
grant INSERT on table "public"."bairros_entrega" to "authenticated";

-- grants
grant SELECT on table "public"."bairros_entrega" to "authenticated";

-- grants
grant UPDATE on table "public"."bairros_entrega" to "authenticated";

-- grants
grant DELETE on table "public"."bairros_entrega" to "authenticated";

-- grants
grant TRUNCATE on table "public"."bairros_entrega" to "authenticated";

-- grants
grant REFERENCES on table "public"."bairros_entrega" to "authenticated";

-- grants
grant TRIGGER on table "public"."bairros_entrega" to "authenticated";

-- grants
grant MAINTAIN on table "public"."bairros_entrega" to "authenticated";

-- grants
grant INSERT on table "public"."bairros_entrega" to "service_role";

-- grants
grant SELECT on table "public"."bairros_entrega" to "service_role";

-- grants
grant UPDATE on table "public"."bairros_entrega" to "service_role";

-- grants
grant DELETE on table "public"."bairros_entrega" to "service_role";

-- grants
grant TRUNCATE on table "public"."bairros_entrega" to "service_role";

-- grants
grant REFERENCES on table "public"."bairros_entrega" to "service_role";

-- grants
grant TRIGGER on table "public"."bairros_entrega" to "service_role";

-- grants
grant MAINTAIN on table "public"."bairros_entrega" to "service_role";

-- grants
revoke all on table "public"."banco_horas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."banco_horas" to "postgres";

-- grants
grant SELECT on table "public"."banco_horas" to "postgres";

-- grants
grant UPDATE on table "public"."banco_horas" to "postgres";

-- grants
grant DELETE on table "public"."banco_horas" to "postgres";

-- grants
grant TRUNCATE on table "public"."banco_horas" to "postgres";

-- grants
grant REFERENCES on table "public"."banco_horas" to "postgres";

-- grants
grant TRIGGER on table "public"."banco_horas" to "postgres";

-- grants
grant MAINTAIN on table "public"."banco_horas" to "postgres";

-- grants
grant INSERT on table "public"."banco_horas" to "anon";

-- grants
grant SELECT on table "public"."banco_horas" to "anon";

-- grants
grant UPDATE on table "public"."banco_horas" to "anon";

-- grants
grant DELETE on table "public"."banco_horas" to "anon";

-- grants
grant TRUNCATE on table "public"."banco_horas" to "anon";

-- grants
grant REFERENCES on table "public"."banco_horas" to "anon";

-- grants
grant TRIGGER on table "public"."banco_horas" to "anon";

-- grants
grant MAINTAIN on table "public"."banco_horas" to "anon";

-- grants
grant INSERT on table "public"."banco_horas" to "authenticated";

-- grants
grant SELECT on table "public"."banco_horas" to "authenticated";

-- grants
grant UPDATE on table "public"."banco_horas" to "authenticated";

-- grants
grant DELETE on table "public"."banco_horas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."banco_horas" to "authenticated";

-- grants
grant REFERENCES on table "public"."banco_horas" to "authenticated";

-- grants
grant TRIGGER on table "public"."banco_horas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."banco_horas" to "authenticated";

-- grants
grant INSERT on table "public"."banco_horas" to "service_role";

-- grants
grant SELECT on table "public"."banco_horas" to "service_role";

-- grants
grant UPDATE on table "public"."banco_horas" to "service_role";

-- grants
grant DELETE on table "public"."banco_horas" to "service_role";

-- grants
grant TRUNCATE on table "public"."banco_horas" to "service_role";

-- grants
grant REFERENCES on table "public"."banco_horas" to "service_role";

-- grants
grant TRIGGER on table "public"."banco_horas" to "service_role";

-- grants
grant MAINTAIN on table "public"."banco_horas" to "service_role";

-- grants
revoke all on table "public"."cadastros_clientes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."cadastros_clientes" to "postgres";

-- grants
grant SELECT on table "public"."cadastros_clientes" to "postgres";

-- grants
grant UPDATE on table "public"."cadastros_clientes" to "postgres";

-- grants
grant DELETE on table "public"."cadastros_clientes" to "postgres";

-- grants
grant TRUNCATE on table "public"."cadastros_clientes" to "postgres";

-- grants
grant REFERENCES on table "public"."cadastros_clientes" to "postgres";

-- grants
grant TRIGGER on table "public"."cadastros_clientes" to "postgres";

-- grants
grant MAINTAIN on table "public"."cadastros_clientes" to "postgres";

-- grants
grant INSERT on table "public"."cadastros_clientes" to "service_role";

-- grants
grant SELECT on table "public"."cadastros_clientes" to "service_role";

-- grants
grant UPDATE on table "public"."cadastros_clientes" to "service_role";

-- grants
grant DELETE on table "public"."cadastros_clientes" to "service_role";

-- grants
grant TRUNCATE on table "public"."cadastros_clientes" to "service_role";

-- grants
grant REFERENCES on table "public"."cadastros_clientes" to "service_role";

-- grants
grant TRIGGER on table "public"."cadastros_clientes" to "service_role";

-- grants
grant MAINTAIN on table "public"."cadastros_clientes" to "service_role";

-- grants
grant SELECT on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("user_id") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("user_id") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("nome_completo") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("nome_completo") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("usuario") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("usuario") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("email") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("email") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("rg") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("rg") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("cpf") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("cpf") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("endereco") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("endereco") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("cep") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("cep") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("data_nascimento") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("data_nascimento") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant INSERT ("comprovante_path") on table "public"."cadastros_clientes" to "authenticated";

-- grants
grant UPDATE ("comprovante_path") on table "public"."cadastros_clientes" to "authenticated";

-- grants
revoke all on table "public"."caixas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."caixas" to "postgres";

-- grants
grant SELECT on table "public"."caixas" to "postgres";

-- grants
grant UPDATE on table "public"."caixas" to "postgres";

-- grants
grant DELETE on table "public"."caixas" to "postgres";

-- grants
grant TRUNCATE on table "public"."caixas" to "postgres";

-- grants
grant REFERENCES on table "public"."caixas" to "postgres";

-- grants
grant TRIGGER on table "public"."caixas" to "postgres";

-- grants
grant MAINTAIN on table "public"."caixas" to "postgres";

-- grants
grant INSERT on table "public"."caixas" to "anon";

-- grants
grant SELECT on table "public"."caixas" to "anon";

-- grants
grant UPDATE on table "public"."caixas" to "anon";

-- grants
grant DELETE on table "public"."caixas" to "anon";

-- grants
grant TRUNCATE on table "public"."caixas" to "anon";

-- grants
grant REFERENCES on table "public"."caixas" to "anon";

-- grants
grant TRIGGER on table "public"."caixas" to "anon";

-- grants
grant MAINTAIN on table "public"."caixas" to "anon";

-- grants
grant INSERT on table "public"."caixas" to "authenticated";

-- grants
grant SELECT on table "public"."caixas" to "authenticated";

-- grants
grant UPDATE on table "public"."caixas" to "authenticated";

-- grants
grant DELETE on table "public"."caixas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."caixas" to "authenticated";

-- grants
grant REFERENCES on table "public"."caixas" to "authenticated";

-- grants
grant TRIGGER on table "public"."caixas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."caixas" to "authenticated";

-- grants
grant INSERT on table "public"."caixas" to "service_role";

-- grants
grant SELECT on table "public"."caixas" to "service_role";

-- grants
grant UPDATE on table "public"."caixas" to "service_role";

-- grants
grant DELETE on table "public"."caixas" to "service_role";

-- grants
grant TRUNCATE on table "public"."caixas" to "service_role";

-- grants
grant REFERENCES on table "public"."caixas" to "service_role";

-- grants
grant TRIGGER on table "public"."caixas" to "service_role";

-- grants
grant MAINTAIN on table "public"."caixas" to "service_role";

-- grants
revoke all on table "public"."cargos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."cargos" to "postgres";

-- grants
grant SELECT on table "public"."cargos" to "postgres";

-- grants
grant UPDATE on table "public"."cargos" to "postgres";

-- grants
grant DELETE on table "public"."cargos" to "postgres";

-- grants
grant TRUNCATE on table "public"."cargos" to "postgres";

-- grants
grant REFERENCES on table "public"."cargos" to "postgres";

-- grants
grant TRIGGER on table "public"."cargos" to "postgres";

-- grants
grant MAINTAIN on table "public"."cargos" to "postgres";

-- grants
grant INSERT on table "public"."cargos" to "anon";

-- grants
grant SELECT on table "public"."cargos" to "anon";

-- grants
grant UPDATE on table "public"."cargos" to "anon";

-- grants
grant DELETE on table "public"."cargos" to "anon";

-- grants
grant TRUNCATE on table "public"."cargos" to "anon";

-- grants
grant REFERENCES on table "public"."cargos" to "anon";

-- grants
grant TRIGGER on table "public"."cargos" to "anon";

-- grants
grant MAINTAIN on table "public"."cargos" to "anon";

-- grants
grant INSERT on table "public"."cargos" to "authenticated";

-- grants
grant SELECT on table "public"."cargos" to "authenticated";

-- grants
grant UPDATE on table "public"."cargos" to "authenticated";

-- grants
grant DELETE on table "public"."cargos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."cargos" to "authenticated";

-- grants
grant REFERENCES on table "public"."cargos" to "authenticated";

-- grants
grant TRIGGER on table "public"."cargos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."cargos" to "authenticated";

-- grants
grant INSERT on table "public"."cargos" to "service_role";

-- grants
grant SELECT on table "public"."cargos" to "service_role";

-- grants
grant UPDATE on table "public"."cargos" to "service_role";

-- grants
grant DELETE on table "public"."cargos" to "service_role";

-- grants
grant TRUNCATE on table "public"."cargos" to "service_role";

-- grants
grant REFERENCES on table "public"."cargos" to "service_role";

-- grants
grant TRIGGER on table "public"."cargos" to "service_role";

-- grants
grant MAINTAIN on table "public"."cargos" to "service_role";

-- grants
revoke all on table "public"."categorias" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."categorias" to "postgres";

-- grants
grant SELECT on table "public"."categorias" to "postgres";

-- grants
grant UPDATE on table "public"."categorias" to "postgres";

-- grants
grant DELETE on table "public"."categorias" to "postgres";

-- grants
grant TRUNCATE on table "public"."categorias" to "postgres";

-- grants
grant REFERENCES on table "public"."categorias" to "postgres";

-- grants
grant TRIGGER on table "public"."categorias" to "postgres";

-- grants
grant MAINTAIN on table "public"."categorias" to "postgres";

-- grants
grant INSERT on table "public"."categorias" to "anon";

-- grants
grant SELECT on table "public"."categorias" to "anon";

-- grants
grant UPDATE on table "public"."categorias" to "anon";

-- grants
grant DELETE on table "public"."categorias" to "anon";

-- grants
grant TRUNCATE on table "public"."categorias" to "anon";

-- grants
grant REFERENCES on table "public"."categorias" to "anon";

-- grants
grant TRIGGER on table "public"."categorias" to "anon";

-- grants
grant MAINTAIN on table "public"."categorias" to "anon";

-- grants
grant INSERT on table "public"."categorias" to "authenticated";

-- grants
grant SELECT on table "public"."categorias" to "authenticated";

-- grants
grant UPDATE on table "public"."categorias" to "authenticated";

-- grants
grant DELETE on table "public"."categorias" to "authenticated";

-- grants
grant TRUNCATE on table "public"."categorias" to "authenticated";

-- grants
grant REFERENCES on table "public"."categorias" to "authenticated";

-- grants
grant TRIGGER on table "public"."categorias" to "authenticated";

-- grants
grant MAINTAIN on table "public"."categorias" to "authenticated";

-- grants
grant INSERT on table "public"."categorias" to "service_role";

-- grants
grant SELECT on table "public"."categorias" to "service_role";

-- grants
grant UPDATE on table "public"."categorias" to "service_role";

-- grants
grant DELETE on table "public"."categorias" to "service_role";

-- grants
grant TRUNCATE on table "public"."categorias" to "service_role";

-- grants
grant REFERENCES on table "public"."categorias" to "service_role";

-- grants
grant TRIGGER on table "public"."categorias" to "service_role";

-- grants
grant MAINTAIN on table "public"."categorias" to "service_role";

-- grants
revoke all on table "public"."chat_limites" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."chat_limites" to "postgres";

-- grants
grant SELECT on table "public"."chat_limites" to "postgres";

-- grants
grant UPDATE on table "public"."chat_limites" to "postgres";

-- grants
grant DELETE on table "public"."chat_limites" to "postgres";

-- grants
grant TRUNCATE on table "public"."chat_limites" to "postgres";

-- grants
grant REFERENCES on table "public"."chat_limites" to "postgres";

-- grants
grant TRIGGER on table "public"."chat_limites" to "postgres";

-- grants
grant MAINTAIN on table "public"."chat_limites" to "postgres";

-- grants
grant INSERT on table "public"."chat_limites" to "service_role";

-- grants
grant SELECT on table "public"."chat_limites" to "service_role";

-- grants
grant UPDATE on table "public"."chat_limites" to "service_role";

-- grants
grant DELETE on table "public"."chat_limites" to "service_role";

-- grants
grant TRUNCATE on table "public"."chat_limites" to "service_role";

-- grants
grant REFERENCES on table "public"."chat_limites" to "service_role";

-- grants
grant TRIGGER on table "public"."chat_limites" to "service_role";

-- grants
grant MAINTAIN on table "public"."chat_limites" to "service_role";

-- grants
revoke all on table "public"."chat_mensagens" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."chat_mensagens" to "postgres";

-- grants
grant SELECT on table "public"."chat_mensagens" to "postgres";

-- grants
grant UPDATE on table "public"."chat_mensagens" to "postgres";

-- grants
grant DELETE on table "public"."chat_mensagens" to "postgres";

-- grants
grant TRUNCATE on table "public"."chat_mensagens" to "postgres";

-- grants
grant REFERENCES on table "public"."chat_mensagens" to "postgres";

-- grants
grant TRIGGER on table "public"."chat_mensagens" to "postgres";

-- grants
grant MAINTAIN on table "public"."chat_mensagens" to "postgres";

-- grants
grant INSERT on table "public"."chat_mensagens" to "anon";

-- grants
grant SELECT on table "public"."chat_mensagens" to "anon";

-- grants
grant UPDATE on table "public"."chat_mensagens" to "anon";

-- grants
grant DELETE on table "public"."chat_mensagens" to "anon";

-- grants
grant TRUNCATE on table "public"."chat_mensagens" to "anon";

-- grants
grant REFERENCES on table "public"."chat_mensagens" to "anon";

-- grants
grant TRIGGER on table "public"."chat_mensagens" to "anon";

-- grants
grant MAINTAIN on table "public"."chat_mensagens" to "anon";

-- grants
grant INSERT on table "public"."chat_mensagens" to "authenticated";

-- grants
grant SELECT on table "public"."chat_mensagens" to "authenticated";

-- grants
grant UPDATE on table "public"."chat_mensagens" to "authenticated";

-- grants
grant DELETE on table "public"."chat_mensagens" to "authenticated";

-- grants
grant TRUNCATE on table "public"."chat_mensagens" to "authenticated";

-- grants
grant REFERENCES on table "public"."chat_mensagens" to "authenticated";

-- grants
grant TRIGGER on table "public"."chat_mensagens" to "authenticated";

-- grants
grant MAINTAIN on table "public"."chat_mensagens" to "authenticated";

-- grants
grant INSERT on table "public"."chat_mensagens" to "service_role";

-- grants
grant SELECT on table "public"."chat_mensagens" to "service_role";

-- grants
grant UPDATE on table "public"."chat_mensagens" to "service_role";

-- grants
grant DELETE on table "public"."chat_mensagens" to "service_role";

-- grants
grant TRUNCATE on table "public"."chat_mensagens" to "service_role";

-- grants
grant REFERENCES on table "public"."chat_mensagens" to "service_role";

-- grants
grant TRIGGER on table "public"."chat_mensagens" to "service_role";

-- grants
grant MAINTAIN on table "public"."chat_mensagens" to "service_role";

-- grants
revoke all on table "public"."chat_sessoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."chat_sessoes" to "postgres";

-- grants
grant SELECT on table "public"."chat_sessoes" to "postgres";

-- grants
grant UPDATE on table "public"."chat_sessoes" to "postgres";

-- grants
grant DELETE on table "public"."chat_sessoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."chat_sessoes" to "postgres";

-- grants
grant REFERENCES on table "public"."chat_sessoes" to "postgres";

-- grants
grant TRIGGER on table "public"."chat_sessoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."chat_sessoes" to "postgres";

-- grants
grant INSERT on table "public"."chat_sessoes" to "anon";

-- grants
grant SELECT on table "public"."chat_sessoes" to "anon";

-- grants
grant UPDATE on table "public"."chat_sessoes" to "anon";

-- grants
grant DELETE on table "public"."chat_sessoes" to "anon";

-- grants
grant TRUNCATE on table "public"."chat_sessoes" to "anon";

-- grants
grant REFERENCES on table "public"."chat_sessoes" to "anon";

-- grants
grant TRIGGER on table "public"."chat_sessoes" to "anon";

-- grants
grant MAINTAIN on table "public"."chat_sessoes" to "anon";

-- grants
grant INSERT on table "public"."chat_sessoes" to "authenticated";

-- grants
grant SELECT on table "public"."chat_sessoes" to "authenticated";

-- grants
grant UPDATE on table "public"."chat_sessoes" to "authenticated";

-- grants
grant DELETE on table "public"."chat_sessoes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."chat_sessoes" to "authenticated";

-- grants
grant REFERENCES on table "public"."chat_sessoes" to "authenticated";

-- grants
grant TRIGGER on table "public"."chat_sessoes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."chat_sessoes" to "authenticated";

-- grants
grant INSERT on table "public"."chat_sessoes" to "service_role";

-- grants
grant SELECT on table "public"."chat_sessoes" to "service_role";

-- grants
grant UPDATE on table "public"."chat_sessoes" to "service_role";

-- grants
grant DELETE on table "public"."chat_sessoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."chat_sessoes" to "service_role";

-- grants
grant REFERENCES on table "public"."chat_sessoes" to "service_role";

-- grants
grant TRIGGER on table "public"."chat_sessoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."chat_sessoes" to "service_role";

-- grants
revoke all on table "public"."checklists_modelo" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."checklists_modelo" to "postgres";

-- grants
grant SELECT on table "public"."checklists_modelo" to "postgres";

-- grants
grant UPDATE on table "public"."checklists_modelo" to "postgres";

-- grants
grant DELETE on table "public"."checklists_modelo" to "postgres";

-- grants
grant TRUNCATE on table "public"."checklists_modelo" to "postgres";

-- grants
grant REFERENCES on table "public"."checklists_modelo" to "postgres";

-- grants
grant TRIGGER on table "public"."checklists_modelo" to "postgres";

-- grants
grant MAINTAIN on table "public"."checklists_modelo" to "postgres";

-- grants
grant INSERT on table "public"."checklists_modelo" to "anon";

-- grants
grant SELECT on table "public"."checklists_modelo" to "anon";

-- grants
grant UPDATE on table "public"."checklists_modelo" to "anon";

-- grants
grant DELETE on table "public"."checklists_modelo" to "anon";

-- grants
grant TRUNCATE on table "public"."checklists_modelo" to "anon";

-- grants
grant REFERENCES on table "public"."checklists_modelo" to "anon";

-- grants
grant TRIGGER on table "public"."checklists_modelo" to "anon";

-- grants
grant MAINTAIN on table "public"."checklists_modelo" to "anon";

-- grants
grant INSERT on table "public"."checklists_modelo" to "authenticated";

-- grants
grant SELECT on table "public"."checklists_modelo" to "authenticated";

-- grants
grant UPDATE on table "public"."checklists_modelo" to "authenticated";

-- grants
grant DELETE on table "public"."checklists_modelo" to "authenticated";

-- grants
grant TRUNCATE on table "public"."checklists_modelo" to "authenticated";

-- grants
grant REFERENCES on table "public"."checklists_modelo" to "authenticated";

-- grants
grant TRIGGER on table "public"."checklists_modelo" to "authenticated";

-- grants
grant MAINTAIN on table "public"."checklists_modelo" to "authenticated";

-- grants
grant INSERT on table "public"."checklists_modelo" to "service_role";

-- grants
grant SELECT on table "public"."checklists_modelo" to "service_role";

-- grants
grant UPDATE on table "public"."checklists_modelo" to "service_role";

-- grants
grant DELETE on table "public"."checklists_modelo" to "service_role";

-- grants
grant TRUNCATE on table "public"."checklists_modelo" to "service_role";

-- grants
grant REFERENCES on table "public"."checklists_modelo" to "service_role";

-- grants
grant TRIGGER on table "public"."checklists_modelo" to "service_role";

-- grants
grant MAINTAIN on table "public"."checklists_modelo" to "service_role";

-- grants
revoke all on table "public"."comprovantes_pix" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."comprovantes_pix" to "postgres";

-- grants
grant SELECT on table "public"."comprovantes_pix" to "postgres";

-- grants
grant UPDATE on table "public"."comprovantes_pix" to "postgres";

-- grants
grant DELETE on table "public"."comprovantes_pix" to "postgres";

-- grants
grant TRUNCATE on table "public"."comprovantes_pix" to "postgres";

-- grants
grant REFERENCES on table "public"."comprovantes_pix" to "postgres";

-- grants
grant TRIGGER on table "public"."comprovantes_pix" to "postgres";

-- grants
grant MAINTAIN on table "public"."comprovantes_pix" to "postgres";

-- grants
grant INSERT on table "public"."comprovantes_pix" to "anon";

-- grants
grant SELECT on table "public"."comprovantes_pix" to "anon";

-- grants
grant UPDATE on table "public"."comprovantes_pix" to "anon";

-- grants
grant DELETE on table "public"."comprovantes_pix" to "anon";

-- grants
grant TRUNCATE on table "public"."comprovantes_pix" to "anon";

-- grants
grant REFERENCES on table "public"."comprovantes_pix" to "anon";

-- grants
grant TRIGGER on table "public"."comprovantes_pix" to "anon";

-- grants
grant MAINTAIN on table "public"."comprovantes_pix" to "anon";

-- grants
grant INSERT on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant SELECT on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant UPDATE on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant DELETE on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant TRUNCATE on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant REFERENCES on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant TRIGGER on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant MAINTAIN on table "public"."comprovantes_pix" to "authenticated";

-- grants
grant INSERT on table "public"."comprovantes_pix" to "service_role";

-- grants
grant SELECT on table "public"."comprovantes_pix" to "service_role";

-- grants
grant UPDATE on table "public"."comprovantes_pix" to "service_role";

-- grants
grant DELETE on table "public"."comprovantes_pix" to "service_role";

-- grants
grant TRUNCATE on table "public"."comprovantes_pix" to "service_role";

-- grants
grant REFERENCES on table "public"."comprovantes_pix" to "service_role";

-- grants
grant TRIGGER on table "public"."comprovantes_pix" to "service_role";

-- grants
grant MAINTAIN on table "public"."comprovantes_pix" to "service_role";

-- grants
revoke all on table "public"."configuracoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."configuracoes" to "postgres";

-- grants
grant SELECT on table "public"."configuracoes" to "postgres";

-- grants
grant UPDATE on table "public"."configuracoes" to "postgres";

-- grants
grant DELETE on table "public"."configuracoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."configuracoes" to "postgres";

-- grants
grant REFERENCES on table "public"."configuracoes" to "postgres";

-- grants
grant TRIGGER on table "public"."configuracoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."configuracoes" to "postgres";

-- grants
grant INSERT on table "public"."configuracoes" to "anon";

-- grants
grant SELECT on table "public"."configuracoes" to "anon";

-- grants
grant UPDATE on table "public"."configuracoes" to "anon";

-- grants
grant DELETE on table "public"."configuracoes" to "anon";

-- grants
grant TRUNCATE on table "public"."configuracoes" to "anon";

-- grants
grant REFERENCES on table "public"."configuracoes" to "anon";

-- grants
grant TRIGGER on table "public"."configuracoes" to "anon";

-- grants
grant MAINTAIN on table "public"."configuracoes" to "anon";

-- grants
grant INSERT on table "public"."configuracoes" to "authenticated";

-- grants
grant SELECT on table "public"."configuracoes" to "authenticated";

-- grants
grant UPDATE on table "public"."configuracoes" to "authenticated";

-- grants
grant DELETE on table "public"."configuracoes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."configuracoes" to "authenticated";

-- grants
grant REFERENCES on table "public"."configuracoes" to "authenticated";

-- grants
grant TRIGGER on table "public"."configuracoes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."configuracoes" to "authenticated";

-- grants
grant INSERT on table "public"."configuracoes" to "service_role";

-- grants
grant SELECT on table "public"."configuracoes" to "service_role";

-- grants
grant UPDATE on table "public"."configuracoes" to "service_role";

-- grants
grant DELETE on table "public"."configuracoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."configuracoes" to "service_role";

-- grants
grant REFERENCES on table "public"."configuracoes" to "service_role";

-- grants
grant TRIGGER on table "public"."configuracoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."configuracoes" to "service_role";

-- grants
revoke all on table "public"."consignados" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."consignados" to "postgres";

-- grants
grant SELECT on table "public"."consignados" to "postgres";

-- grants
grant UPDATE on table "public"."consignados" to "postgres";

-- grants
grant DELETE on table "public"."consignados" to "postgres";

-- grants
grant TRUNCATE on table "public"."consignados" to "postgres";

-- grants
grant REFERENCES on table "public"."consignados" to "postgres";

-- grants
grant TRIGGER on table "public"."consignados" to "postgres";

-- grants
grant MAINTAIN on table "public"."consignados" to "postgres";

-- grants
grant INSERT on table "public"."consignados" to "anon";

-- grants
grant SELECT on table "public"."consignados" to "anon";

-- grants
grant UPDATE on table "public"."consignados" to "anon";

-- grants
grant DELETE on table "public"."consignados" to "anon";

-- grants
grant TRUNCATE on table "public"."consignados" to "anon";

-- grants
grant REFERENCES on table "public"."consignados" to "anon";

-- grants
grant TRIGGER on table "public"."consignados" to "anon";

-- grants
grant MAINTAIN on table "public"."consignados" to "anon";

-- grants
grant INSERT on table "public"."consignados" to "authenticated";

-- grants
grant SELECT on table "public"."consignados" to "authenticated";

-- grants
grant UPDATE on table "public"."consignados" to "authenticated";

-- grants
grant DELETE on table "public"."consignados" to "authenticated";

-- grants
grant TRUNCATE on table "public"."consignados" to "authenticated";

-- grants
grant REFERENCES on table "public"."consignados" to "authenticated";

-- grants
grant TRIGGER on table "public"."consignados" to "authenticated";

-- grants
grant MAINTAIN on table "public"."consignados" to "authenticated";

-- grants
grant INSERT on table "public"."consignados" to "service_role";

-- grants
grant SELECT on table "public"."consignados" to "service_role";

-- grants
grant UPDATE on table "public"."consignados" to "service_role";

-- grants
grant DELETE on table "public"."consignados" to "service_role";

-- grants
grant TRUNCATE on table "public"."consignados" to "service_role";

-- grants
grant REFERENCES on table "public"."consignados" to "service_role";

-- grants
grant TRIGGER on table "public"."consignados" to "service_role";

-- grants
grant MAINTAIN on table "public"."consignados" to "service_role";

-- grants
revoke all on table "public"."contas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."contas" to "postgres";

-- grants
grant SELECT on table "public"."contas" to "postgres";

-- grants
grant UPDATE on table "public"."contas" to "postgres";

-- grants
grant DELETE on table "public"."contas" to "postgres";

-- grants
grant TRUNCATE on table "public"."contas" to "postgres";

-- grants
grant REFERENCES on table "public"."contas" to "postgres";

-- grants
grant TRIGGER on table "public"."contas" to "postgres";

-- grants
grant MAINTAIN on table "public"."contas" to "postgres";

-- grants
grant INSERT on table "public"."contas" to "anon";

-- grants
grant SELECT on table "public"."contas" to "anon";

-- grants
grant UPDATE on table "public"."contas" to "anon";

-- grants
grant DELETE on table "public"."contas" to "anon";

-- grants
grant TRUNCATE on table "public"."contas" to "anon";

-- grants
grant REFERENCES on table "public"."contas" to "anon";

-- grants
grant TRIGGER on table "public"."contas" to "anon";

-- grants
grant MAINTAIN on table "public"."contas" to "anon";

-- grants
grant INSERT on table "public"."contas" to "authenticated";

-- grants
grant SELECT on table "public"."contas" to "authenticated";

-- grants
grant UPDATE on table "public"."contas" to "authenticated";

-- grants
grant DELETE on table "public"."contas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."contas" to "authenticated";

-- grants
grant REFERENCES on table "public"."contas" to "authenticated";

-- grants
grant TRIGGER on table "public"."contas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."contas" to "authenticated";

-- grants
grant INSERT on table "public"."contas" to "service_role";

-- grants
grant SELECT on table "public"."contas" to "service_role";

-- grants
grant UPDATE on table "public"."contas" to "service_role";

-- grants
grant DELETE on table "public"."contas" to "service_role";

-- grants
grant TRUNCATE on table "public"."contas" to "service_role";

-- grants
grant REFERENCES on table "public"."contas" to "service_role";

-- grants
grant TRIGGER on table "public"."contas" to "service_role";

-- grants
grant MAINTAIN on table "public"."contas" to "service_role";

-- grants
revoke all on table "public"."convites" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."convites" to "postgres";

-- grants
grant SELECT on table "public"."convites" to "postgres";

-- grants
grant UPDATE on table "public"."convites" to "postgres";

-- grants
grant DELETE on table "public"."convites" to "postgres";

-- grants
grant TRUNCATE on table "public"."convites" to "postgres";

-- grants
grant REFERENCES on table "public"."convites" to "postgres";

-- grants
grant TRIGGER on table "public"."convites" to "postgres";

-- grants
grant MAINTAIN on table "public"."convites" to "postgres";

-- grants
grant INSERT on table "public"."convites" to "anon";

-- grants
grant SELECT on table "public"."convites" to "anon";

-- grants
grant UPDATE on table "public"."convites" to "anon";

-- grants
grant DELETE on table "public"."convites" to "anon";

-- grants
grant TRUNCATE on table "public"."convites" to "anon";

-- grants
grant REFERENCES on table "public"."convites" to "anon";

-- grants
grant TRIGGER on table "public"."convites" to "anon";

-- grants
grant MAINTAIN on table "public"."convites" to "anon";

-- grants
grant INSERT on table "public"."convites" to "authenticated";

-- grants
grant SELECT on table "public"."convites" to "authenticated";

-- grants
grant UPDATE on table "public"."convites" to "authenticated";

-- grants
grant DELETE on table "public"."convites" to "authenticated";

-- grants
grant TRUNCATE on table "public"."convites" to "authenticated";

-- grants
grant REFERENCES on table "public"."convites" to "authenticated";

-- grants
grant TRIGGER on table "public"."convites" to "authenticated";

-- grants
grant MAINTAIN on table "public"."convites" to "authenticated";

-- grants
grant INSERT on table "public"."convites" to "service_role";

-- grants
grant SELECT on table "public"."convites" to "service_role";

-- grants
grant UPDATE on table "public"."convites" to "service_role";

-- grants
grant DELETE on table "public"."convites" to "service_role";

-- grants
grant TRUNCATE on table "public"."convites" to "service_role";

-- grants
grant REFERENCES on table "public"."convites" to "service_role";

-- grants
grant TRIGGER on table "public"."convites" to "service_role";

-- grants
grant MAINTAIN on table "public"."convites" to "service_role";

-- grants
revoke all on table "public"."creditos_clientes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."creditos_clientes" to "postgres";

-- grants
grant SELECT on table "public"."creditos_clientes" to "postgres";

-- grants
grant UPDATE on table "public"."creditos_clientes" to "postgres";

-- grants
grant DELETE on table "public"."creditos_clientes" to "postgres";

-- grants
grant TRUNCATE on table "public"."creditos_clientes" to "postgres";

-- grants
grant REFERENCES on table "public"."creditos_clientes" to "postgres";

-- grants
grant TRIGGER on table "public"."creditos_clientes" to "postgres";

-- grants
grant MAINTAIN on table "public"."creditos_clientes" to "postgres";

-- grants
grant INSERT on table "public"."creditos_clientes" to "anon";

-- grants
grant SELECT on table "public"."creditos_clientes" to "anon";

-- grants
grant UPDATE on table "public"."creditos_clientes" to "anon";

-- grants
grant DELETE on table "public"."creditos_clientes" to "anon";

-- grants
grant TRUNCATE on table "public"."creditos_clientes" to "anon";

-- grants
grant REFERENCES on table "public"."creditos_clientes" to "anon";

-- grants
grant TRIGGER on table "public"."creditos_clientes" to "anon";

-- grants
grant MAINTAIN on table "public"."creditos_clientes" to "anon";

-- grants
grant INSERT on table "public"."creditos_clientes" to "authenticated";

-- grants
grant SELECT on table "public"."creditos_clientes" to "authenticated";

-- grants
grant UPDATE on table "public"."creditos_clientes" to "authenticated";

-- grants
grant DELETE on table "public"."creditos_clientes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."creditos_clientes" to "authenticated";

-- grants
grant REFERENCES on table "public"."creditos_clientes" to "authenticated";

-- grants
grant TRIGGER on table "public"."creditos_clientes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."creditos_clientes" to "authenticated";

-- grants
grant INSERT on table "public"."creditos_clientes" to "service_role";

-- grants
grant SELECT on table "public"."creditos_clientes" to "service_role";

-- grants
grant UPDATE on table "public"."creditos_clientes" to "service_role";

-- grants
grant DELETE on table "public"."creditos_clientes" to "service_role";

-- grants
grant TRUNCATE on table "public"."creditos_clientes" to "service_role";

-- grants
grant REFERENCES on table "public"."creditos_clientes" to "service_role";

-- grants
grant TRIGGER on table "public"."creditos_clientes" to "service_role";

-- grants
grant MAINTAIN on table "public"."creditos_clientes" to "service_role";

-- grants
revoke all on table "public"."depositos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."depositos" to "postgres";

-- grants
grant SELECT on table "public"."depositos" to "postgres";

-- grants
grant UPDATE on table "public"."depositos" to "postgres";

-- grants
grant DELETE on table "public"."depositos" to "postgres";

-- grants
grant TRUNCATE on table "public"."depositos" to "postgres";

-- grants
grant REFERENCES on table "public"."depositos" to "postgres";

-- grants
grant TRIGGER on table "public"."depositos" to "postgres";

-- grants
grant MAINTAIN on table "public"."depositos" to "postgres";

-- grants
grant INSERT on table "public"."depositos" to "anon";

-- grants
grant UPDATE on table "public"."depositos" to "anon";

-- grants
grant DELETE on table "public"."depositos" to "anon";

-- grants
grant TRUNCATE on table "public"."depositos" to "anon";

-- grants
grant REFERENCES on table "public"."depositos" to "anon";

-- grants
grant TRIGGER on table "public"."depositos" to "anon";

-- grants
grant MAINTAIN on table "public"."depositos" to "anon";

-- grants
grant INSERT on table "public"."depositos" to "authenticated";

-- grants
grant SELECT on table "public"."depositos" to "authenticated";

-- grants
grant UPDATE on table "public"."depositos" to "authenticated";

-- grants
grant DELETE on table "public"."depositos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."depositos" to "authenticated";

-- grants
grant REFERENCES on table "public"."depositos" to "authenticated";

-- grants
grant TRIGGER on table "public"."depositos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."depositos" to "authenticated";

-- grants
grant INSERT on table "public"."depositos" to "service_role";

-- grants
grant SELECT on table "public"."depositos" to "service_role";

-- grants
grant UPDATE on table "public"."depositos" to "service_role";

-- grants
grant DELETE on table "public"."depositos" to "service_role";

-- grants
grant TRUNCATE on table "public"."depositos" to "service_role";

-- grants
grant REFERENCES on table "public"."depositos" to "service_role";

-- grants
grant TRIGGER on table "public"."depositos" to "service_role";

-- grants
grant MAINTAIN on table "public"."depositos" to "service_role";

-- grants
revoke all on table "public"."devolucoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."devolucoes" to "postgres";

-- grants
grant SELECT on table "public"."devolucoes" to "postgres";

-- grants
grant UPDATE on table "public"."devolucoes" to "postgres";

-- grants
grant DELETE on table "public"."devolucoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."devolucoes" to "postgres";

-- grants
grant REFERENCES on table "public"."devolucoes" to "postgres";

-- grants
grant TRIGGER on table "public"."devolucoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."devolucoes" to "postgres";

-- grants
grant INSERT on table "public"."devolucoes" to "anon";

-- grants
grant SELECT on table "public"."devolucoes" to "anon";

-- grants
grant UPDATE on table "public"."devolucoes" to "anon";

-- grants
grant DELETE on table "public"."devolucoes" to "anon";

-- grants
grant TRUNCATE on table "public"."devolucoes" to "anon";

-- grants
grant REFERENCES on table "public"."devolucoes" to "anon";

-- grants
grant TRIGGER on table "public"."devolucoes" to "anon";

-- grants
grant MAINTAIN on table "public"."devolucoes" to "anon";

-- grants
grant INSERT on table "public"."devolucoes" to "authenticated";

-- grants
grant SELECT on table "public"."devolucoes" to "authenticated";

-- grants
grant UPDATE on table "public"."devolucoes" to "authenticated";

-- grants
grant DELETE on table "public"."devolucoes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."devolucoes" to "authenticated";

-- grants
grant REFERENCES on table "public"."devolucoes" to "authenticated";

-- grants
grant TRIGGER on table "public"."devolucoes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."devolucoes" to "authenticated";

-- grants
grant INSERT on table "public"."devolucoes" to "service_role";

-- grants
grant SELECT on table "public"."devolucoes" to "service_role";

-- grants
grant UPDATE on table "public"."devolucoes" to "service_role";

-- grants
grant DELETE on table "public"."devolucoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."devolucoes" to "service_role";

-- grants
grant REFERENCES on table "public"."devolucoes" to "service_role";

-- grants
grant TRIGGER on table "public"."devolucoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."devolucoes" to "service_role";

-- grants
revoke all on table "public"."empresas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."empresas" to "postgres";

-- grants
grant SELECT on table "public"."empresas" to "postgres";

-- grants
grant UPDATE on table "public"."empresas" to "postgres";

-- grants
grant DELETE on table "public"."empresas" to "postgres";

-- grants
grant TRUNCATE on table "public"."empresas" to "postgres";

-- grants
grant REFERENCES on table "public"."empresas" to "postgres";

-- grants
grant TRIGGER on table "public"."empresas" to "postgres";

-- grants
grant MAINTAIN on table "public"."empresas" to "postgres";

-- grants
grant INSERT on table "public"."empresas" to "anon";

-- grants
grant SELECT on table "public"."empresas" to "anon";

-- grants
grant UPDATE on table "public"."empresas" to "anon";

-- grants
grant DELETE on table "public"."empresas" to "anon";

-- grants
grant TRUNCATE on table "public"."empresas" to "anon";

-- grants
grant REFERENCES on table "public"."empresas" to "anon";

-- grants
grant TRIGGER on table "public"."empresas" to "anon";

-- grants
grant MAINTAIN on table "public"."empresas" to "anon";

-- grants
grant INSERT on table "public"."empresas" to "authenticated";

-- grants
grant SELECT on table "public"."empresas" to "authenticated";

-- grants
grant UPDATE on table "public"."empresas" to "authenticated";

-- grants
grant DELETE on table "public"."empresas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."empresas" to "authenticated";

-- grants
grant REFERENCES on table "public"."empresas" to "authenticated";

-- grants
grant TRIGGER on table "public"."empresas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."empresas" to "authenticated";

-- grants
grant INSERT on table "public"."empresas" to "service_role";

-- grants
grant SELECT on table "public"."empresas" to "service_role";

-- grants
grant UPDATE on table "public"."empresas" to "service_role";

-- grants
grant DELETE on table "public"."empresas" to "service_role";

-- grants
grant TRUNCATE on table "public"."empresas" to "service_role";

-- grants
grant REFERENCES on table "public"."empresas" to "service_role";

-- grants
grant TRIGGER on table "public"."empresas" to "service_role";

-- grants
grant MAINTAIN on table "public"."empresas" to "service_role";

-- grants
revoke all on table "public"."encomendas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."encomendas" to "postgres";

-- grants
grant SELECT on table "public"."encomendas" to "postgres";

-- grants
grant UPDATE on table "public"."encomendas" to "postgres";

-- grants
grant DELETE on table "public"."encomendas" to "postgres";

-- grants
grant TRUNCATE on table "public"."encomendas" to "postgres";

-- grants
grant REFERENCES on table "public"."encomendas" to "postgres";

-- grants
grant TRIGGER on table "public"."encomendas" to "postgres";

-- grants
grant MAINTAIN on table "public"."encomendas" to "postgres";

-- grants
grant INSERT on table "public"."encomendas" to "anon";

-- grants
grant SELECT on table "public"."encomendas" to "anon";

-- grants
grant UPDATE on table "public"."encomendas" to "anon";

-- grants
grant DELETE on table "public"."encomendas" to "anon";

-- grants
grant TRUNCATE on table "public"."encomendas" to "anon";

-- grants
grant REFERENCES on table "public"."encomendas" to "anon";

-- grants
grant TRIGGER on table "public"."encomendas" to "anon";

-- grants
grant MAINTAIN on table "public"."encomendas" to "anon";

-- grants
grant INSERT on table "public"."encomendas" to "authenticated";

-- grants
grant SELECT on table "public"."encomendas" to "authenticated";

-- grants
grant UPDATE on table "public"."encomendas" to "authenticated";

-- grants
grant DELETE on table "public"."encomendas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."encomendas" to "authenticated";

-- grants
grant REFERENCES on table "public"."encomendas" to "authenticated";

-- grants
grant TRIGGER on table "public"."encomendas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."encomendas" to "authenticated";

-- grants
grant INSERT on table "public"."encomendas" to "service_role";

-- grants
grant SELECT on table "public"."encomendas" to "service_role";

-- grants
grant UPDATE on table "public"."encomendas" to "service_role";

-- grants
grant DELETE on table "public"."encomendas" to "service_role";

-- grants
grant TRUNCATE on table "public"."encomendas" to "service_role";

-- grants
grant REFERENCES on table "public"."encomendas" to "service_role";

-- grants
grant TRIGGER on table "public"."encomendas" to "service_role";

-- grants
grant MAINTAIN on table "public"."encomendas" to "service_role";

-- grants
revoke all on table "public"."escala_excecoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."escala_excecoes" to "postgres";

-- grants
grant SELECT on table "public"."escala_excecoes" to "postgres";

-- grants
grant UPDATE on table "public"."escala_excecoes" to "postgres";

-- grants
grant DELETE on table "public"."escala_excecoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."escala_excecoes" to "postgres";

-- grants
grant REFERENCES on table "public"."escala_excecoes" to "postgres";

-- grants
grant TRIGGER on table "public"."escala_excecoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."escala_excecoes" to "postgres";

-- grants
grant INSERT on table "public"."escala_excecoes" to "anon";

-- grants
grant SELECT on table "public"."escala_excecoes" to "anon";

-- grants
grant UPDATE on table "public"."escala_excecoes" to "anon";

-- grants
grant DELETE on table "public"."escala_excecoes" to "anon";

-- grants
grant TRUNCATE on table "public"."escala_excecoes" to "anon";

-- grants
grant REFERENCES on table "public"."escala_excecoes" to "anon";

-- grants
grant TRIGGER on table "public"."escala_excecoes" to "anon";

-- grants
grant MAINTAIN on table "public"."escala_excecoes" to "anon";

-- grants
grant INSERT on table "public"."escala_excecoes" to "authenticated";

-- grants
grant SELECT on table "public"."escala_excecoes" to "authenticated";

-- grants
grant UPDATE on table "public"."escala_excecoes" to "authenticated";

-- grants
grant DELETE on table "public"."escala_excecoes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."escala_excecoes" to "authenticated";

-- grants
grant REFERENCES on table "public"."escala_excecoes" to "authenticated";

-- grants
grant TRIGGER on table "public"."escala_excecoes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."escala_excecoes" to "authenticated";

-- grants
grant INSERT on table "public"."escala_excecoes" to "service_role";

-- grants
grant SELECT on table "public"."escala_excecoes" to "service_role";

-- grants
grant UPDATE on table "public"."escala_excecoes" to "service_role";

-- grants
grant DELETE on table "public"."escala_excecoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."escala_excecoes" to "service_role";

-- grants
grant REFERENCES on table "public"."escala_excecoes" to "service_role";

-- grants
grant TRIGGER on table "public"."escala_excecoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."escala_excecoes" to "service_role";

-- grants
revoke all on table "public"."escalas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."escalas" to "postgres";

-- grants
grant SELECT on table "public"."escalas" to "postgres";

-- grants
grant UPDATE on table "public"."escalas" to "postgres";

-- grants
grant DELETE on table "public"."escalas" to "postgres";

-- grants
grant TRUNCATE on table "public"."escalas" to "postgres";

-- grants
grant REFERENCES on table "public"."escalas" to "postgres";

-- grants
grant TRIGGER on table "public"."escalas" to "postgres";

-- grants
grant MAINTAIN on table "public"."escalas" to "postgres";

-- grants
grant INSERT on table "public"."escalas" to "anon";

-- grants
grant SELECT on table "public"."escalas" to "anon";

-- grants
grant UPDATE on table "public"."escalas" to "anon";

-- grants
grant DELETE on table "public"."escalas" to "anon";

-- grants
grant TRUNCATE on table "public"."escalas" to "anon";

-- grants
grant REFERENCES on table "public"."escalas" to "anon";

-- grants
grant TRIGGER on table "public"."escalas" to "anon";

-- grants
grant MAINTAIN on table "public"."escalas" to "anon";

-- grants
grant INSERT on table "public"."escalas" to "authenticated";

-- grants
grant SELECT on table "public"."escalas" to "authenticated";

-- grants
grant UPDATE on table "public"."escalas" to "authenticated";

-- grants
grant DELETE on table "public"."escalas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."escalas" to "authenticated";

-- grants
grant REFERENCES on table "public"."escalas" to "authenticated";

-- grants
grant TRIGGER on table "public"."escalas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."escalas" to "authenticated";

-- grants
grant INSERT on table "public"."escalas" to "service_role";

-- grants
grant SELECT on table "public"."escalas" to "service_role";

-- grants
grant UPDATE on table "public"."escalas" to "service_role";

-- grants
grant DELETE on table "public"."escalas" to "service_role";

-- grants
grant TRUNCATE on table "public"."escalas" to "service_role";

-- grants
grant REFERENCES on table "public"."escalas" to "service_role";

-- grants
grant TRIGGER on table "public"."escalas" to "service_role";

-- grants
grant MAINTAIN on table "public"."escalas" to "service_role";

-- grants
revoke all on table "public"."estoque" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."estoque" to "postgres";

-- grants
grant SELECT on table "public"."estoque" to "postgres";

-- grants
grant UPDATE on table "public"."estoque" to "postgres";

-- grants
grant DELETE on table "public"."estoque" to "postgres";

-- grants
grant TRUNCATE on table "public"."estoque" to "postgres";

-- grants
grant REFERENCES on table "public"."estoque" to "postgres";

-- grants
grant TRIGGER on table "public"."estoque" to "postgres";

-- grants
grant MAINTAIN on table "public"."estoque" to "postgres";

-- grants
grant INSERT on table "public"."estoque" to "anon";

-- grants
grant UPDATE on table "public"."estoque" to "anon";

-- grants
grant DELETE on table "public"."estoque" to "anon";

-- grants
grant TRUNCATE on table "public"."estoque" to "anon";

-- grants
grant REFERENCES on table "public"."estoque" to "anon";

-- grants
grant TRIGGER on table "public"."estoque" to "anon";

-- grants
grant MAINTAIN on table "public"."estoque" to "anon";

-- grants
grant INSERT on table "public"."estoque" to "authenticated";

-- grants
grant SELECT on table "public"."estoque" to "authenticated";

-- grants
grant UPDATE on table "public"."estoque" to "authenticated";

-- grants
grant DELETE on table "public"."estoque" to "authenticated";

-- grants
grant TRUNCATE on table "public"."estoque" to "authenticated";

-- grants
grant REFERENCES on table "public"."estoque" to "authenticated";

-- grants
grant TRIGGER on table "public"."estoque" to "authenticated";

-- grants
grant MAINTAIN on table "public"."estoque" to "authenticated";

-- grants
grant INSERT on table "public"."estoque" to "service_role";

-- grants
grant SELECT on table "public"."estoque" to "service_role";

-- grants
grant UPDATE on table "public"."estoque" to "service_role";

-- grants
grant DELETE on table "public"."estoque" to "service_role";

-- grants
grant TRUNCATE on table "public"."estoque" to "service_role";

-- grants
grant REFERENCES on table "public"."estoque" to "service_role";

-- grants
grant TRIGGER on table "public"."estoque" to "service_role";

-- grants
grant MAINTAIN on table "public"."estoque" to "service_role";

-- grants
revoke all on table "public"."faixas_promocao" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."faixas_promocao" to "postgres";

-- grants
grant SELECT on table "public"."faixas_promocao" to "postgres";

-- grants
grant UPDATE on table "public"."faixas_promocao" to "postgres";

-- grants
grant DELETE on table "public"."faixas_promocao" to "postgres";

-- grants
grant TRUNCATE on table "public"."faixas_promocao" to "postgres";

-- grants
grant REFERENCES on table "public"."faixas_promocao" to "postgres";

-- grants
grant TRIGGER on table "public"."faixas_promocao" to "postgres";

-- grants
grant MAINTAIN on table "public"."faixas_promocao" to "postgres";

-- grants
grant INSERT on table "public"."faixas_promocao" to "anon";

-- grants
grant SELECT on table "public"."faixas_promocao" to "anon";

-- grants
grant UPDATE on table "public"."faixas_promocao" to "anon";

-- grants
grant DELETE on table "public"."faixas_promocao" to "anon";

-- grants
grant TRUNCATE on table "public"."faixas_promocao" to "anon";

-- grants
grant REFERENCES on table "public"."faixas_promocao" to "anon";

-- grants
grant TRIGGER on table "public"."faixas_promocao" to "anon";

-- grants
grant MAINTAIN on table "public"."faixas_promocao" to "anon";

-- grants
grant INSERT on table "public"."faixas_promocao" to "authenticated";

-- grants
grant SELECT on table "public"."faixas_promocao" to "authenticated";

-- grants
grant UPDATE on table "public"."faixas_promocao" to "authenticated";

-- grants
grant DELETE on table "public"."faixas_promocao" to "authenticated";

-- grants
grant TRUNCATE on table "public"."faixas_promocao" to "authenticated";

-- grants
grant REFERENCES on table "public"."faixas_promocao" to "authenticated";

-- grants
grant TRIGGER on table "public"."faixas_promocao" to "authenticated";

-- grants
grant MAINTAIN on table "public"."faixas_promocao" to "authenticated";

-- grants
grant INSERT on table "public"."faixas_promocao" to "service_role";

-- grants
grant SELECT on table "public"."faixas_promocao" to "service_role";

-- grants
grant UPDATE on table "public"."faixas_promocao" to "service_role";

-- grants
grant DELETE on table "public"."faixas_promocao" to "service_role";

-- grants
grant TRUNCATE on table "public"."faixas_promocao" to "service_role";

-- grants
grant REFERENCES on table "public"."faixas_promocao" to "service_role";

-- grants
grant TRIGGER on table "public"."faixas_promocao" to "service_role";

-- grants
grant MAINTAIN on table "public"."faixas_promocao" to "service_role";

-- grants
revoke all on table "public"."feriados" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."feriados" to "postgres";

-- grants
grant SELECT on table "public"."feriados" to "postgres";

-- grants
grant UPDATE on table "public"."feriados" to "postgres";

-- grants
grant DELETE on table "public"."feriados" to "postgres";

-- grants
grant TRUNCATE on table "public"."feriados" to "postgres";

-- grants
grant REFERENCES on table "public"."feriados" to "postgres";

-- grants
grant TRIGGER on table "public"."feriados" to "postgres";

-- grants
grant MAINTAIN on table "public"."feriados" to "postgres";

-- grants
grant INSERT on table "public"."feriados" to "anon";

-- grants
grant SELECT on table "public"."feriados" to "anon";

-- grants
grant UPDATE on table "public"."feriados" to "anon";

-- grants
grant DELETE on table "public"."feriados" to "anon";

-- grants
grant TRUNCATE on table "public"."feriados" to "anon";

-- grants
grant REFERENCES on table "public"."feriados" to "anon";

-- grants
grant TRIGGER on table "public"."feriados" to "anon";

-- grants
grant MAINTAIN on table "public"."feriados" to "anon";

-- grants
grant INSERT on table "public"."feriados" to "authenticated";

-- grants
grant SELECT on table "public"."feriados" to "authenticated";

-- grants
grant UPDATE on table "public"."feriados" to "authenticated";

-- grants
grant DELETE on table "public"."feriados" to "authenticated";

-- grants
grant TRUNCATE on table "public"."feriados" to "authenticated";

-- grants
grant REFERENCES on table "public"."feriados" to "authenticated";

-- grants
grant TRIGGER on table "public"."feriados" to "authenticated";

-- grants
grant MAINTAIN on table "public"."feriados" to "authenticated";

-- grants
grant INSERT on table "public"."feriados" to "service_role";

-- grants
grant SELECT on table "public"."feriados" to "service_role";

-- grants
grant UPDATE on table "public"."feriados" to "service_role";

-- grants
grant DELETE on table "public"."feriados" to "service_role";

-- grants
grant TRUNCATE on table "public"."feriados" to "service_role";

-- grants
grant REFERENCES on table "public"."feriados" to "service_role";

-- grants
grant TRIGGER on table "public"."feriados" to "service_role";

-- grants
grant MAINTAIN on table "public"."feriados" to "service_role";

-- grants
revoke all on table "public"."forma_conta_loja" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."forma_conta_loja" to "postgres";

-- grants
grant SELECT on table "public"."forma_conta_loja" to "postgres";

-- grants
grant UPDATE on table "public"."forma_conta_loja" to "postgres";

-- grants
grant DELETE on table "public"."forma_conta_loja" to "postgres";

-- grants
grant TRUNCATE on table "public"."forma_conta_loja" to "postgres";

-- grants
grant REFERENCES on table "public"."forma_conta_loja" to "postgres";

-- grants
grant TRIGGER on table "public"."forma_conta_loja" to "postgres";

-- grants
grant MAINTAIN on table "public"."forma_conta_loja" to "postgres";

-- grants
grant INSERT on table "public"."forma_conta_loja" to "anon";

-- grants
grant SELECT on table "public"."forma_conta_loja" to "anon";

-- grants
grant UPDATE on table "public"."forma_conta_loja" to "anon";

-- grants
grant DELETE on table "public"."forma_conta_loja" to "anon";

-- grants
grant TRUNCATE on table "public"."forma_conta_loja" to "anon";

-- grants
grant REFERENCES on table "public"."forma_conta_loja" to "anon";

-- grants
grant TRIGGER on table "public"."forma_conta_loja" to "anon";

-- grants
grant MAINTAIN on table "public"."forma_conta_loja" to "anon";

-- grants
grant INSERT on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant SELECT on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant UPDATE on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant DELETE on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant TRUNCATE on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant REFERENCES on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant TRIGGER on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant MAINTAIN on table "public"."forma_conta_loja" to "authenticated";

-- grants
grant INSERT on table "public"."forma_conta_loja" to "service_role";

-- grants
grant SELECT on table "public"."forma_conta_loja" to "service_role";

-- grants
grant UPDATE on table "public"."forma_conta_loja" to "service_role";

-- grants
grant DELETE on table "public"."forma_conta_loja" to "service_role";

-- grants
grant TRUNCATE on table "public"."forma_conta_loja" to "service_role";

-- grants
grant REFERENCES on table "public"."forma_conta_loja" to "service_role";

-- grants
grant TRIGGER on table "public"."forma_conta_loja" to "service_role";

-- grants
grant MAINTAIN on table "public"."forma_conta_loja" to "service_role";

-- grants
revoke all on table "public"."formas_pagamento" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."formas_pagamento" to "postgres";

-- grants
grant SELECT on table "public"."formas_pagamento" to "postgres";

-- grants
grant UPDATE on table "public"."formas_pagamento" to "postgres";

-- grants
grant DELETE on table "public"."formas_pagamento" to "postgres";

-- grants
grant TRUNCATE on table "public"."formas_pagamento" to "postgres";

-- grants
grant REFERENCES on table "public"."formas_pagamento" to "postgres";

-- grants
grant TRIGGER on table "public"."formas_pagamento" to "postgres";

-- grants
grant MAINTAIN on table "public"."formas_pagamento" to "postgres";

-- grants
grant INSERT on table "public"."formas_pagamento" to "anon";

-- grants
grant SELECT on table "public"."formas_pagamento" to "anon";

-- grants
grant UPDATE on table "public"."formas_pagamento" to "anon";

-- grants
grant DELETE on table "public"."formas_pagamento" to "anon";

-- grants
grant TRUNCATE on table "public"."formas_pagamento" to "anon";

-- grants
grant REFERENCES on table "public"."formas_pagamento" to "anon";

-- grants
grant TRIGGER on table "public"."formas_pagamento" to "anon";

-- grants
grant MAINTAIN on table "public"."formas_pagamento" to "anon";

-- grants
grant INSERT on table "public"."formas_pagamento" to "authenticated";

-- grants
grant SELECT on table "public"."formas_pagamento" to "authenticated";

-- grants
grant UPDATE on table "public"."formas_pagamento" to "authenticated";

-- grants
grant DELETE on table "public"."formas_pagamento" to "authenticated";

-- grants
grant TRUNCATE on table "public"."formas_pagamento" to "authenticated";

-- grants
grant REFERENCES on table "public"."formas_pagamento" to "authenticated";

-- grants
grant TRIGGER on table "public"."formas_pagamento" to "authenticated";

-- grants
grant MAINTAIN on table "public"."formas_pagamento" to "authenticated";

-- grants
grant INSERT on table "public"."formas_pagamento" to "service_role";

-- grants
grant SELECT on table "public"."formas_pagamento" to "service_role";

-- grants
grant UPDATE on table "public"."formas_pagamento" to "service_role";

-- grants
grant DELETE on table "public"."formas_pagamento" to "service_role";

-- grants
grant TRUNCATE on table "public"."formas_pagamento" to "service_role";

-- grants
grant REFERENCES on table "public"."formas_pagamento" to "service_role";

-- grants
grant TRIGGER on table "public"."formas_pagamento" to "service_role";

-- grants
grant MAINTAIN on table "public"."formas_pagamento" to "service_role";

-- grants
revoke all on table "public"."historico_itens_venda" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."historico_itens_venda" to "postgres";

-- grants
grant SELECT on table "public"."historico_itens_venda" to "postgres";

-- grants
grant UPDATE on table "public"."historico_itens_venda" to "postgres";

-- grants
grant DELETE on table "public"."historico_itens_venda" to "postgres";

-- grants
grant TRUNCATE on table "public"."historico_itens_venda" to "postgres";

-- grants
grant REFERENCES on table "public"."historico_itens_venda" to "postgres";

-- grants
grant TRIGGER on table "public"."historico_itens_venda" to "postgres";

-- grants
grant MAINTAIN on table "public"."historico_itens_venda" to "postgres";

-- grants
grant INSERT on table "public"."historico_itens_venda" to "anon";

-- grants
grant SELECT on table "public"."historico_itens_venda" to "anon";

-- grants
grant UPDATE on table "public"."historico_itens_venda" to "anon";

-- grants
grant DELETE on table "public"."historico_itens_venda" to "anon";

-- grants
grant TRUNCATE on table "public"."historico_itens_venda" to "anon";

-- grants
grant REFERENCES on table "public"."historico_itens_venda" to "anon";

-- grants
grant TRIGGER on table "public"."historico_itens_venda" to "anon";

-- grants
grant MAINTAIN on table "public"."historico_itens_venda" to "anon";

-- grants
grant INSERT on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant SELECT on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant UPDATE on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant DELETE on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant TRUNCATE on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant REFERENCES on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant TRIGGER on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant MAINTAIN on table "public"."historico_itens_venda" to "authenticated";

-- grants
grant INSERT on table "public"."historico_itens_venda" to "service_role";

-- grants
grant SELECT on table "public"."historico_itens_venda" to "service_role";

-- grants
grant UPDATE on table "public"."historico_itens_venda" to "service_role";

-- grants
grant DELETE on table "public"."historico_itens_venda" to "service_role";

-- grants
grant TRUNCATE on table "public"."historico_itens_venda" to "service_role";

-- grants
grant REFERENCES on table "public"."historico_itens_venda" to "service_role";

-- grants
grant TRIGGER on table "public"."historico_itens_venda" to "service_role";

-- grants
grant MAINTAIN on table "public"."historico_itens_venda" to "service_role";

-- grants
revoke all on table "public"."historico_vendas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."historico_vendas" to "postgres";

-- grants
grant SELECT on table "public"."historico_vendas" to "postgres";

-- grants
grant UPDATE on table "public"."historico_vendas" to "postgres";

-- grants
grant DELETE on table "public"."historico_vendas" to "postgres";

-- grants
grant TRUNCATE on table "public"."historico_vendas" to "postgres";

-- grants
grant REFERENCES on table "public"."historico_vendas" to "postgres";

-- grants
grant TRIGGER on table "public"."historico_vendas" to "postgres";

-- grants
grant MAINTAIN on table "public"."historico_vendas" to "postgres";

-- grants
grant INSERT on table "public"."historico_vendas" to "anon";

-- grants
grant SELECT on table "public"."historico_vendas" to "anon";

-- grants
grant UPDATE on table "public"."historico_vendas" to "anon";

-- grants
grant DELETE on table "public"."historico_vendas" to "anon";

-- grants
grant TRUNCATE on table "public"."historico_vendas" to "anon";

-- grants
grant REFERENCES on table "public"."historico_vendas" to "anon";

-- grants
grant TRIGGER on table "public"."historico_vendas" to "anon";

-- grants
grant MAINTAIN on table "public"."historico_vendas" to "anon";

-- grants
grant INSERT on table "public"."historico_vendas" to "authenticated";

-- grants
grant SELECT on table "public"."historico_vendas" to "authenticated";

-- grants
grant UPDATE on table "public"."historico_vendas" to "authenticated";

-- grants
grant DELETE on table "public"."historico_vendas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."historico_vendas" to "authenticated";

-- grants
grant REFERENCES on table "public"."historico_vendas" to "authenticated";

-- grants
grant TRIGGER on table "public"."historico_vendas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."historico_vendas" to "authenticated";

-- grants
grant INSERT on table "public"."historico_vendas" to "service_role";

-- grants
grant SELECT on table "public"."historico_vendas" to "service_role";

-- grants
grant UPDATE on table "public"."historico_vendas" to "service_role";

-- grants
grant DELETE on table "public"."historico_vendas" to "service_role";

-- grants
grant TRUNCATE on table "public"."historico_vendas" to "service_role";

-- grants
grant REFERENCES on table "public"."historico_vendas" to "service_role";

-- grants
grant TRIGGER on table "public"."historico_vendas" to "service_role";

-- grants
grant MAINTAIN on table "public"."historico_vendas" to "service_role";

-- grants
revoke all on table "public"."integracoes_mercado_livre" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre" to "postgres";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre" to "anon";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre" to "authenticated";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre" to "service_role";

-- grants
revoke all on table "public"."integracoes_mercado_livre_anuncios" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_anuncios" to "postgres";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_anuncios" to "anon";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_anuncios" to "authenticated";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_anuncios" to "service_role";

-- grants
revoke all on table "public"."integracoes_mercado_livre_mensagens" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_mensagens" to "postgres";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_mensagens" to "anon";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_mensagens" to "authenticated";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_mensagens" to "service_role";

-- grants
revoke all on table "public"."integracoes_mercado_livre_pedidos_pendentes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "postgres";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "anon";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "authenticated";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_pedidos_pendentes" to "service_role";

-- grants
revoke all on table "public"."integracoes_mercado_livre_perguntas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_perguntas" to "postgres";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_perguntas" to "anon";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_perguntas" to "authenticated";

-- grants
grant INSERT on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant SELECT on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant UPDATE on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant DELETE on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant TRUNCATE on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant REFERENCES on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant TRIGGER on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
grant MAINTAIN on table "public"."integracoes_mercado_livre_perguntas" to "service_role";

-- grants
revoke all on table "public"."itens_consignado" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_consignado" to "postgres";

-- grants
grant SELECT on table "public"."itens_consignado" to "postgres";

-- grants
grant UPDATE on table "public"."itens_consignado" to "postgres";

-- grants
grant DELETE on table "public"."itens_consignado" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_consignado" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_consignado" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_consignado" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_consignado" to "postgres";

-- grants
grant INSERT on table "public"."itens_consignado" to "anon";

-- grants
grant SELECT on table "public"."itens_consignado" to "anon";

-- grants
grant UPDATE on table "public"."itens_consignado" to "anon";

-- grants
grant DELETE on table "public"."itens_consignado" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_consignado" to "anon";

-- grants
grant REFERENCES on table "public"."itens_consignado" to "anon";

-- grants
grant TRIGGER on table "public"."itens_consignado" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_consignado" to "anon";

-- grants
grant INSERT on table "public"."itens_consignado" to "authenticated";

-- grants
grant SELECT on table "public"."itens_consignado" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_consignado" to "authenticated";

-- grants
grant DELETE on table "public"."itens_consignado" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_consignado" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_consignado" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_consignado" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_consignado" to "authenticated";

-- grants
grant INSERT on table "public"."itens_consignado" to "service_role";

-- grants
grant SELECT on table "public"."itens_consignado" to "service_role";

-- grants
grant UPDATE on table "public"."itens_consignado" to "service_role";

-- grants
grant DELETE on table "public"."itens_consignado" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_consignado" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_consignado" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_consignado" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_consignado" to "service_role";

-- grants
revoke all on table "public"."itens_devolucao" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_devolucao" to "postgres";

-- grants
grant SELECT on table "public"."itens_devolucao" to "postgres";

-- grants
grant UPDATE on table "public"."itens_devolucao" to "postgres";

-- grants
grant DELETE on table "public"."itens_devolucao" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_devolucao" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_devolucao" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_devolucao" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_devolucao" to "postgres";

-- grants
grant INSERT on table "public"."itens_devolucao" to "anon";

-- grants
grant SELECT on table "public"."itens_devolucao" to "anon";

-- grants
grant UPDATE on table "public"."itens_devolucao" to "anon";

-- grants
grant DELETE on table "public"."itens_devolucao" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_devolucao" to "anon";

-- grants
grant REFERENCES on table "public"."itens_devolucao" to "anon";

-- grants
grant TRIGGER on table "public"."itens_devolucao" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_devolucao" to "anon";

-- grants
grant INSERT on table "public"."itens_devolucao" to "authenticated";

-- grants
grant SELECT on table "public"."itens_devolucao" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_devolucao" to "authenticated";

-- grants
grant DELETE on table "public"."itens_devolucao" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_devolucao" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_devolucao" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_devolucao" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_devolucao" to "authenticated";

-- grants
grant INSERT on table "public"."itens_devolucao" to "service_role";

-- grants
grant SELECT on table "public"."itens_devolucao" to "service_role";

-- grants
grant UPDATE on table "public"."itens_devolucao" to "service_role";

-- grants
grant DELETE on table "public"."itens_devolucao" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_devolucao" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_devolucao" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_devolucao" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_devolucao" to "service_role";

-- grants
revoke all on table "public"."itens_nota_entrada" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant SELECT on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant UPDATE on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant DELETE on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_nota_entrada" to "postgres";

-- grants
grant INSERT on table "public"."itens_nota_entrada" to "anon";

-- grants
grant SELECT on table "public"."itens_nota_entrada" to "anon";

-- grants
grant UPDATE on table "public"."itens_nota_entrada" to "anon";

-- grants
grant DELETE on table "public"."itens_nota_entrada" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_nota_entrada" to "anon";

-- grants
grant REFERENCES on table "public"."itens_nota_entrada" to "anon";

-- grants
grant TRIGGER on table "public"."itens_nota_entrada" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_nota_entrada" to "anon";

-- grants
grant INSERT on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant SELECT on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant DELETE on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_nota_entrada" to "authenticated";

-- grants
grant INSERT on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant SELECT on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant UPDATE on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant DELETE on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_nota_entrada" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_nota_entrada" to "service_role";

-- grants
revoke all on table "public"."itens_os" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_os" to "postgres";

-- grants
grant SELECT on table "public"."itens_os" to "postgres";

-- grants
grant UPDATE on table "public"."itens_os" to "postgres";

-- grants
grant DELETE on table "public"."itens_os" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_os" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_os" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_os" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_os" to "postgres";

-- grants
grant INSERT on table "public"."itens_os" to "anon";

-- grants
grant SELECT on table "public"."itens_os" to "anon";

-- grants
grant UPDATE on table "public"."itens_os" to "anon";

-- grants
grant DELETE on table "public"."itens_os" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_os" to "anon";

-- grants
grant REFERENCES on table "public"."itens_os" to "anon";

-- grants
grant TRIGGER on table "public"."itens_os" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_os" to "anon";

-- grants
grant INSERT on table "public"."itens_os" to "authenticated";

-- grants
grant SELECT on table "public"."itens_os" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_os" to "authenticated";

-- grants
grant DELETE on table "public"."itens_os" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_os" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_os" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_os" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_os" to "authenticated";

-- grants
grant INSERT on table "public"."itens_os" to "service_role";

-- grants
grant SELECT on table "public"."itens_os" to "service_role";

-- grants
grant UPDATE on table "public"."itens_os" to "service_role";

-- grants
grant DELETE on table "public"."itens_os" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_os" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_os" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_os" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_os" to "service_role";

-- grants
revoke all on table "public"."itens_pedido" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_pedido" to "postgres";

-- grants
grant SELECT on table "public"."itens_pedido" to "postgres";

-- grants
grant UPDATE on table "public"."itens_pedido" to "postgres";

-- grants
grant DELETE on table "public"."itens_pedido" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_pedido" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_pedido" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_pedido" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_pedido" to "postgres";

-- grants
grant INSERT on table "public"."itens_pedido" to "anon";

-- grants
grant SELECT on table "public"."itens_pedido" to "anon";

-- grants
grant UPDATE on table "public"."itens_pedido" to "anon";

-- grants
grant DELETE on table "public"."itens_pedido" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_pedido" to "anon";

-- grants
grant REFERENCES on table "public"."itens_pedido" to "anon";

-- grants
grant TRIGGER on table "public"."itens_pedido" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_pedido" to "anon";

-- grants
grant INSERT on table "public"."itens_pedido" to "authenticated";

-- grants
grant SELECT on table "public"."itens_pedido" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_pedido" to "authenticated";

-- grants
grant DELETE on table "public"."itens_pedido" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_pedido" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_pedido" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_pedido" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_pedido" to "authenticated";

-- grants
grant INSERT on table "public"."itens_pedido" to "service_role";

-- grants
grant SELECT on table "public"."itens_pedido" to "service_role";

-- grants
grant UPDATE on table "public"."itens_pedido" to "service_role";

-- grants
grant DELETE on table "public"."itens_pedido" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_pedido" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_pedido" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_pedido" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_pedido" to "service_role";

-- grants
revoke all on table "public"."itens_promocao" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_promocao" to "postgres";

-- grants
grant SELECT on table "public"."itens_promocao" to "postgres";

-- grants
grant UPDATE on table "public"."itens_promocao" to "postgres";

-- grants
grant DELETE on table "public"."itens_promocao" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_promocao" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_promocao" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_promocao" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_promocao" to "postgres";

-- grants
grant INSERT on table "public"."itens_promocao" to "anon";

-- grants
grant SELECT on table "public"."itens_promocao" to "anon";

-- grants
grant UPDATE on table "public"."itens_promocao" to "anon";

-- grants
grant DELETE on table "public"."itens_promocao" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_promocao" to "anon";

-- grants
grant REFERENCES on table "public"."itens_promocao" to "anon";

-- grants
grant TRIGGER on table "public"."itens_promocao" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_promocao" to "anon";

-- grants
grant INSERT on table "public"."itens_promocao" to "authenticated";

-- grants
grant SELECT on table "public"."itens_promocao" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_promocao" to "authenticated";

-- grants
grant DELETE on table "public"."itens_promocao" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_promocao" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_promocao" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_promocao" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_promocao" to "authenticated";

-- grants
grant INSERT on table "public"."itens_promocao" to "service_role";

-- grants
grant SELECT on table "public"."itens_promocao" to "service_role";

-- grants
grant UPDATE on table "public"."itens_promocao" to "service_role";

-- grants
grant DELETE on table "public"."itens_promocao" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_promocao" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_promocao" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_promocao" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_promocao" to "service_role";

-- grants
revoke all on table "public"."itens_tabela_preco" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant SELECT on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant UPDATE on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant DELETE on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_tabela_preco" to "postgres";

-- grants
grant INSERT on table "public"."itens_tabela_preco" to "anon";

-- grants
grant SELECT on table "public"."itens_tabela_preco" to "anon";

-- grants
grant UPDATE on table "public"."itens_tabela_preco" to "anon";

-- grants
grant DELETE on table "public"."itens_tabela_preco" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_tabela_preco" to "anon";

-- grants
grant REFERENCES on table "public"."itens_tabela_preco" to "anon";

-- grants
grant TRIGGER on table "public"."itens_tabela_preco" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_tabela_preco" to "anon";

-- grants
grant INSERT on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant SELECT on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant DELETE on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_tabela_preco" to "authenticated";

-- grants
grant INSERT on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant SELECT on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant UPDATE on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant DELETE on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_tabela_preco" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_tabela_preco" to "service_role";

-- grants
revoke all on table "public"."itens_venda" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."itens_venda" to "postgres";

-- grants
grant SELECT on table "public"."itens_venda" to "postgres";

-- grants
grant UPDATE on table "public"."itens_venda" to "postgres";

-- grants
grant DELETE on table "public"."itens_venda" to "postgres";

-- grants
grant TRUNCATE on table "public"."itens_venda" to "postgres";

-- grants
grant REFERENCES on table "public"."itens_venda" to "postgres";

-- grants
grant TRIGGER on table "public"."itens_venda" to "postgres";

-- grants
grant MAINTAIN on table "public"."itens_venda" to "postgres";

-- grants
grant INSERT on table "public"."itens_venda" to "anon";

-- grants
grant SELECT on table "public"."itens_venda" to "anon";

-- grants
grant UPDATE on table "public"."itens_venda" to "anon";

-- grants
grant DELETE on table "public"."itens_venda" to "anon";

-- grants
grant TRUNCATE on table "public"."itens_venda" to "anon";

-- grants
grant REFERENCES on table "public"."itens_venda" to "anon";

-- grants
grant TRIGGER on table "public"."itens_venda" to "anon";

-- grants
grant MAINTAIN on table "public"."itens_venda" to "anon";

-- grants
grant INSERT on table "public"."itens_venda" to "authenticated";

-- grants
grant SELECT on table "public"."itens_venda" to "authenticated";

-- grants
grant UPDATE on table "public"."itens_venda" to "authenticated";

-- grants
grant DELETE on table "public"."itens_venda" to "authenticated";

-- grants
grant TRUNCATE on table "public"."itens_venda" to "authenticated";

-- grants
grant REFERENCES on table "public"."itens_venda" to "authenticated";

-- grants
grant TRIGGER on table "public"."itens_venda" to "authenticated";

-- grants
grant MAINTAIN on table "public"."itens_venda" to "authenticated";

-- grants
grant INSERT on table "public"."itens_venda" to "service_role";

-- grants
grant SELECT on table "public"."itens_venda" to "service_role";

-- grants
grant UPDATE on table "public"."itens_venda" to "service_role";

-- grants
grant DELETE on table "public"."itens_venda" to "service_role";

-- grants
grant TRUNCATE on table "public"."itens_venda" to "service_role";

-- grants
grant REFERENCES on table "public"."itens_venda" to "service_role";

-- grants
grant TRIGGER on table "public"."itens_venda" to "service_role";

-- grants
grant MAINTAIN on table "public"."itens_venda" to "service_role";

-- grants
revoke all on table "public"."lancamentos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."lancamentos" to "postgres";

-- grants
grant SELECT on table "public"."lancamentos" to "postgres";

-- grants
grant UPDATE on table "public"."lancamentos" to "postgres";

-- grants
grant DELETE on table "public"."lancamentos" to "postgres";

-- grants
grant TRUNCATE on table "public"."lancamentos" to "postgres";

-- grants
grant REFERENCES on table "public"."lancamentos" to "postgres";

-- grants
grant TRIGGER on table "public"."lancamentos" to "postgres";

-- grants
grant MAINTAIN on table "public"."lancamentos" to "postgres";

-- grants
grant INSERT on table "public"."lancamentos" to "anon";

-- grants
grant SELECT on table "public"."lancamentos" to "anon";

-- grants
grant UPDATE on table "public"."lancamentos" to "anon";

-- grants
grant DELETE on table "public"."lancamentos" to "anon";

-- grants
grant TRUNCATE on table "public"."lancamentos" to "anon";

-- grants
grant REFERENCES on table "public"."lancamentos" to "anon";

-- grants
grant TRIGGER on table "public"."lancamentos" to "anon";

-- grants
grant MAINTAIN on table "public"."lancamentos" to "anon";

-- grants
grant INSERT on table "public"."lancamentos" to "authenticated";

-- grants
grant SELECT on table "public"."lancamentos" to "authenticated";

-- grants
grant UPDATE on table "public"."lancamentos" to "authenticated";

-- grants
grant DELETE on table "public"."lancamentos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."lancamentos" to "authenticated";

-- grants
grant REFERENCES on table "public"."lancamentos" to "authenticated";

-- grants
grant TRIGGER on table "public"."lancamentos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."lancamentos" to "authenticated";

-- grants
grant INSERT on table "public"."lancamentos" to "service_role";

-- grants
grant SELECT on table "public"."lancamentos" to "service_role";

-- grants
grant UPDATE on table "public"."lancamentos" to "service_role";

-- grants
grant DELETE on table "public"."lancamentos" to "service_role";

-- grants
grant TRUNCATE on table "public"."lancamentos" to "service_role";

-- grants
grant REFERENCES on table "public"."lancamentos" to "service_role";

-- grants
grant TRIGGER on table "public"."lancamentos" to "service_role";

-- grants
grant MAINTAIN on table "public"."lancamentos" to "service_role";

-- grants
revoke all on table "public"."lembretes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."lembretes" to "postgres";

-- grants
grant SELECT on table "public"."lembretes" to "postgres";

-- grants
grant UPDATE on table "public"."lembretes" to "postgres";

-- grants
grant DELETE on table "public"."lembretes" to "postgres";

-- grants
grant TRUNCATE on table "public"."lembretes" to "postgres";

-- grants
grant REFERENCES on table "public"."lembretes" to "postgres";

-- grants
grant TRIGGER on table "public"."lembretes" to "postgres";

-- grants
grant MAINTAIN on table "public"."lembretes" to "postgres";

-- grants
grant INSERT on table "public"."lembretes" to "anon";

-- grants
grant SELECT on table "public"."lembretes" to "anon";

-- grants
grant UPDATE on table "public"."lembretes" to "anon";

-- grants
grant DELETE on table "public"."lembretes" to "anon";

-- grants
grant TRUNCATE on table "public"."lembretes" to "anon";

-- grants
grant REFERENCES on table "public"."lembretes" to "anon";

-- grants
grant TRIGGER on table "public"."lembretes" to "anon";

-- grants
grant MAINTAIN on table "public"."lembretes" to "anon";

-- grants
grant INSERT on table "public"."lembretes" to "authenticated";

-- grants
grant SELECT on table "public"."lembretes" to "authenticated";

-- grants
grant UPDATE on table "public"."lembretes" to "authenticated";

-- grants
grant DELETE on table "public"."lembretes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."lembretes" to "authenticated";

-- grants
grant REFERENCES on table "public"."lembretes" to "authenticated";

-- grants
grant TRIGGER on table "public"."lembretes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."lembretes" to "authenticated";

-- grants
grant INSERT on table "public"."lembretes" to "service_role";

-- grants
grant SELECT on table "public"."lembretes" to "service_role";

-- grants
grant UPDATE on table "public"."lembretes" to "service_role";

-- grants
grant DELETE on table "public"."lembretes" to "service_role";

-- grants
grant TRUNCATE on table "public"."lembretes" to "service_role";

-- grants
grant REFERENCES on table "public"."lembretes" to "service_role";

-- grants
grant TRIGGER on table "public"."lembretes" to "service_role";

-- grants
grant MAINTAIN on table "public"."lembretes" to "service_role";

-- grants
revoke all on table "public"."lembretes_feitos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."lembretes_feitos" to "postgres";

-- grants
grant SELECT on table "public"."lembretes_feitos" to "postgres";

-- grants
grant UPDATE on table "public"."lembretes_feitos" to "postgres";

-- grants
grant DELETE on table "public"."lembretes_feitos" to "postgres";

-- grants
grant TRUNCATE on table "public"."lembretes_feitos" to "postgres";

-- grants
grant REFERENCES on table "public"."lembretes_feitos" to "postgres";

-- grants
grant TRIGGER on table "public"."lembretes_feitos" to "postgres";

-- grants
grant MAINTAIN on table "public"."lembretes_feitos" to "postgres";

-- grants
grant INSERT on table "public"."lembretes_feitos" to "anon";

-- grants
grant SELECT on table "public"."lembretes_feitos" to "anon";

-- grants
grant UPDATE on table "public"."lembretes_feitos" to "anon";

-- grants
grant DELETE on table "public"."lembretes_feitos" to "anon";

-- grants
grant TRUNCATE on table "public"."lembretes_feitos" to "anon";

-- grants
grant REFERENCES on table "public"."lembretes_feitos" to "anon";

-- grants
grant TRIGGER on table "public"."lembretes_feitos" to "anon";

-- grants
grant MAINTAIN on table "public"."lembretes_feitos" to "anon";

-- grants
grant INSERT on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant SELECT on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant UPDATE on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant DELETE on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant REFERENCES on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant TRIGGER on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."lembretes_feitos" to "authenticated";

-- grants
grant INSERT on table "public"."lembretes_feitos" to "service_role";

-- grants
grant SELECT on table "public"."lembretes_feitos" to "service_role";

-- grants
grant UPDATE on table "public"."lembretes_feitos" to "service_role";

-- grants
grant DELETE on table "public"."lembretes_feitos" to "service_role";

-- grants
grant TRUNCATE on table "public"."lembretes_feitos" to "service_role";

-- grants
grant REFERENCES on table "public"."lembretes_feitos" to "service_role";

-- grants
grant TRIGGER on table "public"."lembretes_feitos" to "service_role";

-- grants
grant MAINTAIN on table "public"."lembretes_feitos" to "service_role";

-- grants
revoke all on table "public"."logs_atividade" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."logs_atividade" to "postgres";

-- grants
grant SELECT on table "public"."logs_atividade" to "postgres";

-- grants
grant UPDATE on table "public"."logs_atividade" to "postgres";

-- grants
grant DELETE on table "public"."logs_atividade" to "postgres";

-- grants
grant TRUNCATE on table "public"."logs_atividade" to "postgres";

-- grants
grant REFERENCES on table "public"."logs_atividade" to "postgres";

-- grants
grant TRIGGER on table "public"."logs_atividade" to "postgres";

-- grants
grant MAINTAIN on table "public"."logs_atividade" to "postgres";

-- grants
grant INSERT on table "public"."logs_atividade" to "anon";

-- grants
grant SELECT on table "public"."logs_atividade" to "anon";

-- grants
grant UPDATE on table "public"."logs_atividade" to "anon";

-- grants
grant DELETE on table "public"."logs_atividade" to "anon";

-- grants
grant TRUNCATE on table "public"."logs_atividade" to "anon";

-- grants
grant REFERENCES on table "public"."logs_atividade" to "anon";

-- grants
grant TRIGGER on table "public"."logs_atividade" to "anon";

-- grants
grant MAINTAIN on table "public"."logs_atividade" to "anon";

-- grants
grant INSERT on table "public"."logs_atividade" to "authenticated";

-- grants
grant SELECT on table "public"."logs_atividade" to "authenticated";

-- grants
grant UPDATE on table "public"."logs_atividade" to "authenticated";

-- grants
grant DELETE on table "public"."logs_atividade" to "authenticated";

-- grants
grant TRUNCATE on table "public"."logs_atividade" to "authenticated";

-- grants
grant REFERENCES on table "public"."logs_atividade" to "authenticated";

-- grants
grant TRIGGER on table "public"."logs_atividade" to "authenticated";

-- grants
grant MAINTAIN on table "public"."logs_atividade" to "authenticated";

-- grants
grant INSERT on table "public"."logs_atividade" to "service_role";

-- grants
grant SELECT on table "public"."logs_atividade" to "service_role";

-- grants
grant UPDATE on table "public"."logs_atividade" to "service_role";

-- grants
grant DELETE on table "public"."logs_atividade" to "service_role";

-- grants
grant TRUNCATE on table "public"."logs_atividade" to "service_role";

-- grants
grant REFERENCES on table "public"."logs_atividade" to "service_role";

-- grants
grant TRIGGER on table "public"."logs_atividade" to "service_role";

-- grants
grant MAINTAIN on table "public"."logs_atividade" to "service_role";

-- grants
revoke all on table "public"."lojas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."lojas" to "postgres";

-- grants
grant SELECT on table "public"."lojas" to "postgres";

-- grants
grant UPDATE on table "public"."lojas" to "postgres";

-- grants
grant DELETE on table "public"."lojas" to "postgres";

-- grants
grant TRUNCATE on table "public"."lojas" to "postgres";

-- grants
grant REFERENCES on table "public"."lojas" to "postgres";

-- grants
grant TRIGGER on table "public"."lojas" to "postgres";

-- grants
grant MAINTAIN on table "public"."lojas" to "postgres";

-- grants
grant INSERT on table "public"."lojas" to "anon";

-- grants
grant SELECT on table "public"."lojas" to "anon";

-- grants
grant UPDATE on table "public"."lojas" to "anon";

-- grants
grant DELETE on table "public"."lojas" to "anon";

-- grants
grant TRUNCATE on table "public"."lojas" to "anon";

-- grants
grant REFERENCES on table "public"."lojas" to "anon";

-- grants
grant TRIGGER on table "public"."lojas" to "anon";

-- grants
grant MAINTAIN on table "public"."lojas" to "anon";

-- grants
grant INSERT on table "public"."lojas" to "authenticated";

-- grants
grant SELECT on table "public"."lojas" to "authenticated";

-- grants
grant UPDATE on table "public"."lojas" to "authenticated";

-- grants
grant DELETE on table "public"."lojas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."lojas" to "authenticated";

-- grants
grant REFERENCES on table "public"."lojas" to "authenticated";

-- grants
grant TRIGGER on table "public"."lojas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."lojas" to "authenticated";

-- grants
grant INSERT on table "public"."lojas" to "service_role";

-- grants
grant SELECT on table "public"."lojas" to "service_role";

-- grants
grant UPDATE on table "public"."lojas" to "service_role";

-- grants
grant DELETE on table "public"."lojas" to "service_role";

-- grants
grant TRUNCATE on table "public"."lojas" to "service_role";

-- grants
grant REFERENCES on table "public"."lojas" to "service_role";

-- grants
grant TRIGGER on table "public"."lojas" to "service_role";

-- grants
grant MAINTAIN on table "public"."lojas" to "service_role";

-- grants
revoke all on table "public"."maquinas_cartao" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."maquinas_cartao" to "postgres";

-- grants
grant SELECT on table "public"."maquinas_cartao" to "postgres";

-- grants
grant UPDATE on table "public"."maquinas_cartao" to "postgres";

-- grants
grant DELETE on table "public"."maquinas_cartao" to "postgres";

-- grants
grant TRUNCATE on table "public"."maquinas_cartao" to "postgres";

-- grants
grant REFERENCES on table "public"."maquinas_cartao" to "postgres";

-- grants
grant TRIGGER on table "public"."maquinas_cartao" to "postgres";

-- grants
grant MAINTAIN on table "public"."maquinas_cartao" to "postgres";

-- grants
grant INSERT on table "public"."maquinas_cartao" to "anon";

-- grants
grant SELECT on table "public"."maquinas_cartao" to "anon";

-- grants
grant UPDATE on table "public"."maquinas_cartao" to "anon";

-- grants
grant DELETE on table "public"."maquinas_cartao" to "anon";

-- grants
grant TRUNCATE on table "public"."maquinas_cartao" to "anon";

-- grants
grant REFERENCES on table "public"."maquinas_cartao" to "anon";

-- grants
grant TRIGGER on table "public"."maquinas_cartao" to "anon";

-- grants
grant MAINTAIN on table "public"."maquinas_cartao" to "anon";

-- grants
grant INSERT on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant SELECT on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant UPDATE on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant DELETE on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant TRUNCATE on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant REFERENCES on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant TRIGGER on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant MAINTAIN on table "public"."maquinas_cartao" to "authenticated";

-- grants
grant INSERT on table "public"."maquinas_cartao" to "service_role";

-- grants
grant SELECT on table "public"."maquinas_cartao" to "service_role";

-- grants
grant UPDATE on table "public"."maquinas_cartao" to "service_role";

-- grants
grant DELETE on table "public"."maquinas_cartao" to "service_role";

-- grants
grant TRUNCATE on table "public"."maquinas_cartao" to "service_role";

-- grants
grant REFERENCES on table "public"."maquinas_cartao" to "service_role";

-- grants
grant TRIGGER on table "public"."maquinas_cartao" to "service_role";

-- grants
grant MAINTAIN on table "public"."maquinas_cartao" to "service_role";

-- grants
revoke all on table "public"."marcas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."marcas" to "postgres";

-- grants
grant SELECT on table "public"."marcas" to "postgres";

-- grants
grant UPDATE on table "public"."marcas" to "postgres";

-- grants
grant DELETE on table "public"."marcas" to "postgres";

-- grants
grant TRUNCATE on table "public"."marcas" to "postgres";

-- grants
grant REFERENCES on table "public"."marcas" to "postgres";

-- grants
grant TRIGGER on table "public"."marcas" to "postgres";

-- grants
grant MAINTAIN on table "public"."marcas" to "postgres";

-- grants
grant INSERT on table "public"."marcas" to "anon";

-- grants
grant SELECT on table "public"."marcas" to "anon";

-- grants
grant UPDATE on table "public"."marcas" to "anon";

-- grants
grant DELETE on table "public"."marcas" to "anon";

-- grants
grant TRUNCATE on table "public"."marcas" to "anon";

-- grants
grant REFERENCES on table "public"."marcas" to "anon";

-- grants
grant TRIGGER on table "public"."marcas" to "anon";

-- grants
grant MAINTAIN on table "public"."marcas" to "anon";

-- grants
grant INSERT on table "public"."marcas" to "authenticated";

-- grants
grant SELECT on table "public"."marcas" to "authenticated";

-- grants
grant UPDATE on table "public"."marcas" to "authenticated";

-- grants
grant DELETE on table "public"."marcas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."marcas" to "authenticated";

-- grants
grant REFERENCES on table "public"."marcas" to "authenticated";

-- grants
grant TRIGGER on table "public"."marcas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."marcas" to "authenticated";

-- grants
grant INSERT on table "public"."marcas" to "service_role";

-- grants
grant SELECT on table "public"."marcas" to "service_role";

-- grants
grant UPDATE on table "public"."marcas" to "service_role";

-- grants
grant DELETE on table "public"."marcas" to "service_role";

-- grants
grant TRUNCATE on table "public"."marcas" to "service_role";

-- grants
grant REFERENCES on table "public"."marcas" to "service_role";

-- grants
grant TRIGGER on table "public"."marcas" to "service_role";

-- grants
grant MAINTAIN on table "public"."marcas" to "service_role";

-- grants
revoke all on table "public"."metas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."metas" to "postgres";

-- grants
grant SELECT on table "public"."metas" to "postgres";

-- grants
grant UPDATE on table "public"."metas" to "postgres";

-- grants
grant DELETE on table "public"."metas" to "postgres";

-- grants
grant TRUNCATE on table "public"."metas" to "postgres";

-- grants
grant REFERENCES on table "public"."metas" to "postgres";

-- grants
grant TRIGGER on table "public"."metas" to "postgres";

-- grants
grant MAINTAIN on table "public"."metas" to "postgres";

-- grants
grant INSERT on table "public"."metas" to "anon";

-- grants
grant SELECT on table "public"."metas" to "anon";

-- grants
grant UPDATE on table "public"."metas" to "anon";

-- grants
grant DELETE on table "public"."metas" to "anon";

-- grants
grant TRUNCATE on table "public"."metas" to "anon";

-- grants
grant REFERENCES on table "public"."metas" to "anon";

-- grants
grant TRIGGER on table "public"."metas" to "anon";

-- grants
grant MAINTAIN on table "public"."metas" to "anon";

-- grants
grant INSERT on table "public"."metas" to "authenticated";

-- grants
grant SELECT on table "public"."metas" to "authenticated";

-- grants
grant UPDATE on table "public"."metas" to "authenticated";

-- grants
grant DELETE on table "public"."metas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."metas" to "authenticated";

-- grants
grant REFERENCES on table "public"."metas" to "authenticated";

-- grants
grant TRIGGER on table "public"."metas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."metas" to "authenticated";

-- grants
grant INSERT on table "public"."metas" to "service_role";

-- grants
grant SELECT on table "public"."metas" to "service_role";

-- grants
grant UPDATE on table "public"."metas" to "service_role";

-- grants
grant DELETE on table "public"."metas" to "service_role";

-- grants
grant TRUNCATE on table "public"."metas" to "service_role";

-- grants
grant REFERENCES on table "public"."metas" to "service_role";

-- grants
grant TRIGGER on table "public"."metas" to "service_role";

-- grants
grant MAINTAIN on table "public"."metas" to "service_role";

-- grants
revoke all on table "public"."metas_faixas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."metas_faixas" to "postgres";

-- grants
grant SELECT on table "public"."metas_faixas" to "postgres";

-- grants
grant UPDATE on table "public"."metas_faixas" to "postgres";

-- grants
grant DELETE on table "public"."metas_faixas" to "postgres";

-- grants
grant TRUNCATE on table "public"."metas_faixas" to "postgres";

-- grants
grant REFERENCES on table "public"."metas_faixas" to "postgres";

-- grants
grant TRIGGER on table "public"."metas_faixas" to "postgres";

-- grants
grant MAINTAIN on table "public"."metas_faixas" to "postgres";

-- grants
grant INSERT on table "public"."metas_faixas" to "anon";

-- grants
grant SELECT on table "public"."metas_faixas" to "anon";

-- grants
grant UPDATE on table "public"."metas_faixas" to "anon";

-- grants
grant DELETE on table "public"."metas_faixas" to "anon";

-- grants
grant TRUNCATE on table "public"."metas_faixas" to "anon";

-- grants
grant REFERENCES on table "public"."metas_faixas" to "anon";

-- grants
grant TRIGGER on table "public"."metas_faixas" to "anon";

-- grants
grant MAINTAIN on table "public"."metas_faixas" to "anon";

-- grants
grant INSERT on table "public"."metas_faixas" to "authenticated";

-- grants
grant SELECT on table "public"."metas_faixas" to "authenticated";

-- grants
grant UPDATE on table "public"."metas_faixas" to "authenticated";

-- grants
grant DELETE on table "public"."metas_faixas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."metas_faixas" to "authenticated";

-- grants
grant REFERENCES on table "public"."metas_faixas" to "authenticated";

-- grants
grant TRIGGER on table "public"."metas_faixas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."metas_faixas" to "authenticated";

-- grants
grant INSERT on table "public"."metas_faixas" to "service_role";

-- grants
grant SELECT on table "public"."metas_faixas" to "service_role";

-- grants
grant UPDATE on table "public"."metas_faixas" to "service_role";

-- grants
grant DELETE on table "public"."metas_faixas" to "service_role";

-- grants
grant TRUNCATE on table "public"."metas_faixas" to "service_role";

-- grants
grant REFERENCES on table "public"."metas_faixas" to "service_role";

-- grants
grant TRIGGER on table "public"."metas_faixas" to "service_role";

-- grants
grant MAINTAIN on table "public"."metas_faixas" to "service_role";

-- grants
revoke all on table "public"."movimentacoes_estoque" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant SELECT on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant UPDATE on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant DELETE on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant TRUNCATE on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant REFERENCES on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant TRIGGER on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant MAINTAIN on table "public"."movimentacoes_estoque" to "postgres";

-- grants
grant INSERT on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant SELECT on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant UPDATE on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant DELETE on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant TRUNCATE on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant REFERENCES on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant TRIGGER on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant MAINTAIN on table "public"."movimentacoes_estoque" to "anon";

-- grants
grant INSERT on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant SELECT on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant UPDATE on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant DELETE on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant TRUNCATE on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant REFERENCES on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant TRIGGER on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant MAINTAIN on table "public"."movimentacoes_estoque" to "authenticated";

-- grants
grant INSERT on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant SELECT on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant UPDATE on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant DELETE on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant TRUNCATE on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant REFERENCES on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant TRIGGER on table "public"."movimentacoes_estoque" to "service_role";

-- grants
grant MAINTAIN on table "public"."movimentacoes_estoque" to "service_role";

-- grants
revoke all on table "public"."movimentos_caixa" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."movimentos_caixa" to "postgres";

-- grants
grant SELECT on table "public"."movimentos_caixa" to "postgres";

-- grants
grant UPDATE on table "public"."movimentos_caixa" to "postgres";

-- grants
grant DELETE on table "public"."movimentos_caixa" to "postgres";

-- grants
grant TRUNCATE on table "public"."movimentos_caixa" to "postgres";

-- grants
grant REFERENCES on table "public"."movimentos_caixa" to "postgres";

-- grants
grant TRIGGER on table "public"."movimentos_caixa" to "postgres";

-- grants
grant MAINTAIN on table "public"."movimentos_caixa" to "postgres";

-- grants
grant INSERT on table "public"."movimentos_caixa" to "anon";

-- grants
grant SELECT on table "public"."movimentos_caixa" to "anon";

-- grants
grant UPDATE on table "public"."movimentos_caixa" to "anon";

-- grants
grant DELETE on table "public"."movimentos_caixa" to "anon";

-- grants
grant TRUNCATE on table "public"."movimentos_caixa" to "anon";

-- grants
grant REFERENCES on table "public"."movimentos_caixa" to "anon";

-- grants
grant TRIGGER on table "public"."movimentos_caixa" to "anon";

-- grants
grant MAINTAIN on table "public"."movimentos_caixa" to "anon";

-- grants
grant INSERT on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant SELECT on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant UPDATE on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant DELETE on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant TRUNCATE on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant REFERENCES on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant TRIGGER on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant MAINTAIN on table "public"."movimentos_caixa" to "authenticated";

-- grants
grant INSERT on table "public"."movimentos_caixa" to "service_role";

-- grants
grant SELECT on table "public"."movimentos_caixa" to "service_role";

-- grants
grant UPDATE on table "public"."movimentos_caixa" to "service_role";

-- grants
grant DELETE on table "public"."movimentos_caixa" to "service_role";

-- grants
grant TRUNCATE on table "public"."movimentos_caixa" to "service_role";

-- grants
grant REFERENCES on table "public"."movimentos_caixa" to "service_role";

-- grants
grant TRIGGER on table "public"."movimentos_caixa" to "service_role";

-- grants
grant MAINTAIN on table "public"."movimentos_caixa" to "service_role";

-- grants
revoke all on table "public"."notas_entrada" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."notas_entrada" to "postgres";

-- grants
grant SELECT on table "public"."notas_entrada" to "postgres";

-- grants
grant UPDATE on table "public"."notas_entrada" to "postgres";

-- grants
grant DELETE on table "public"."notas_entrada" to "postgres";

-- grants
grant TRUNCATE on table "public"."notas_entrada" to "postgres";

-- grants
grant REFERENCES on table "public"."notas_entrada" to "postgres";

-- grants
grant TRIGGER on table "public"."notas_entrada" to "postgres";

-- grants
grant MAINTAIN on table "public"."notas_entrada" to "postgres";

-- grants
grant INSERT on table "public"."notas_entrada" to "anon";

-- grants
grant SELECT on table "public"."notas_entrada" to "anon";

-- grants
grant UPDATE on table "public"."notas_entrada" to "anon";

-- grants
grant DELETE on table "public"."notas_entrada" to "anon";

-- grants
grant TRUNCATE on table "public"."notas_entrada" to "anon";

-- grants
grant REFERENCES on table "public"."notas_entrada" to "anon";

-- grants
grant TRIGGER on table "public"."notas_entrada" to "anon";

-- grants
grant MAINTAIN on table "public"."notas_entrada" to "anon";

-- grants
grant INSERT on table "public"."notas_entrada" to "authenticated";

-- grants
grant SELECT on table "public"."notas_entrada" to "authenticated";

-- grants
grant UPDATE on table "public"."notas_entrada" to "authenticated";

-- grants
grant DELETE on table "public"."notas_entrada" to "authenticated";

-- grants
grant TRUNCATE on table "public"."notas_entrada" to "authenticated";

-- grants
grant REFERENCES on table "public"."notas_entrada" to "authenticated";

-- grants
grant TRIGGER on table "public"."notas_entrada" to "authenticated";

-- grants
grant MAINTAIN on table "public"."notas_entrada" to "authenticated";

-- grants
grant INSERT on table "public"."notas_entrada" to "service_role";

-- grants
grant SELECT on table "public"."notas_entrada" to "service_role";

-- grants
grant UPDATE on table "public"."notas_entrada" to "service_role";

-- grants
grant DELETE on table "public"."notas_entrada" to "service_role";

-- grants
grant TRUNCATE on table "public"."notas_entrada" to "service_role";

-- grants
grant REFERENCES on table "public"."notas_entrada" to "service_role";

-- grants
grant TRIGGER on table "public"."notas_entrada" to "service_role";

-- grants
grant MAINTAIN on table "public"."notas_entrada" to "service_role";

-- grants
revoke all on table "public"."numeros_serie" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."numeros_serie" to "postgres";

-- grants
grant SELECT on table "public"."numeros_serie" to "postgres";

-- grants
grant UPDATE on table "public"."numeros_serie" to "postgres";

-- grants
grant DELETE on table "public"."numeros_serie" to "postgres";

-- grants
grant TRUNCATE on table "public"."numeros_serie" to "postgres";

-- grants
grant REFERENCES on table "public"."numeros_serie" to "postgres";

-- grants
grant TRIGGER on table "public"."numeros_serie" to "postgres";

-- grants
grant MAINTAIN on table "public"."numeros_serie" to "postgres";

-- grants
grant INSERT on table "public"."numeros_serie" to "anon";

-- grants
grant SELECT on table "public"."numeros_serie" to "anon";

-- grants
grant UPDATE on table "public"."numeros_serie" to "anon";

-- grants
grant DELETE on table "public"."numeros_serie" to "anon";

-- grants
grant TRUNCATE on table "public"."numeros_serie" to "anon";

-- grants
grant REFERENCES on table "public"."numeros_serie" to "anon";

-- grants
grant TRIGGER on table "public"."numeros_serie" to "anon";

-- grants
grant MAINTAIN on table "public"."numeros_serie" to "anon";

-- grants
grant INSERT on table "public"."numeros_serie" to "authenticated";

-- grants
grant SELECT on table "public"."numeros_serie" to "authenticated";

-- grants
grant UPDATE on table "public"."numeros_serie" to "authenticated";

-- grants
grant DELETE on table "public"."numeros_serie" to "authenticated";

-- grants
grant TRUNCATE on table "public"."numeros_serie" to "authenticated";

-- grants
grant REFERENCES on table "public"."numeros_serie" to "authenticated";

-- grants
grant TRIGGER on table "public"."numeros_serie" to "authenticated";

-- grants
grant MAINTAIN on table "public"."numeros_serie" to "authenticated";

-- grants
grant INSERT on table "public"."numeros_serie" to "service_role";

-- grants
grant SELECT on table "public"."numeros_serie" to "service_role";

-- grants
grant UPDATE on table "public"."numeros_serie" to "service_role";

-- grants
grant DELETE on table "public"."numeros_serie" to "service_role";

-- grants
grant TRUNCATE on table "public"."numeros_serie" to "service_role";

-- grants
grant REFERENCES on table "public"."numeros_serie" to "service_role";

-- grants
grant TRIGGER on table "public"."numeros_serie" to "service_role";

-- grants
grant MAINTAIN on table "public"."numeros_serie" to "service_role";

-- grants
revoke all on table "public"."ordens_servico" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."ordens_servico" to "postgres";

-- grants
grant SELECT on table "public"."ordens_servico" to "postgres";

-- grants
grant UPDATE on table "public"."ordens_servico" to "postgres";

-- grants
grant DELETE on table "public"."ordens_servico" to "postgres";

-- grants
grant TRUNCATE on table "public"."ordens_servico" to "postgres";

-- grants
grant REFERENCES on table "public"."ordens_servico" to "postgres";

-- grants
grant TRIGGER on table "public"."ordens_servico" to "postgres";

-- grants
grant MAINTAIN on table "public"."ordens_servico" to "postgres";

-- grants
grant INSERT on table "public"."ordens_servico" to "anon";

-- grants
grant SELECT on table "public"."ordens_servico" to "anon";

-- grants
grant UPDATE on table "public"."ordens_servico" to "anon";

-- grants
grant DELETE on table "public"."ordens_servico" to "anon";

-- grants
grant TRUNCATE on table "public"."ordens_servico" to "anon";

-- grants
grant REFERENCES on table "public"."ordens_servico" to "anon";

-- grants
grant TRIGGER on table "public"."ordens_servico" to "anon";

-- grants
grant MAINTAIN on table "public"."ordens_servico" to "anon";

-- grants
grant INSERT on table "public"."ordens_servico" to "authenticated";

-- grants
grant SELECT on table "public"."ordens_servico" to "authenticated";

-- grants
grant UPDATE on table "public"."ordens_servico" to "authenticated";

-- grants
grant DELETE on table "public"."ordens_servico" to "authenticated";

-- grants
grant TRUNCATE on table "public"."ordens_servico" to "authenticated";

-- grants
grant REFERENCES on table "public"."ordens_servico" to "authenticated";

-- grants
grant TRIGGER on table "public"."ordens_servico" to "authenticated";

-- grants
grant MAINTAIN on table "public"."ordens_servico" to "authenticated";

-- grants
grant INSERT on table "public"."ordens_servico" to "service_role";

-- grants
grant SELECT on table "public"."ordens_servico" to "service_role";

-- grants
grant UPDATE on table "public"."ordens_servico" to "service_role";

-- grants
grant DELETE on table "public"."ordens_servico" to "service_role";

-- grants
grant TRUNCATE on table "public"."ordens_servico" to "service_role";

-- grants
grant REFERENCES on table "public"."ordens_servico" to "service_role";

-- grants
grant TRIGGER on table "public"."ordens_servico" to "service_role";

-- grants
grant MAINTAIN on table "public"."ordens_servico" to "service_role";

-- grants
revoke all on table "public"."os_checklists" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."os_checklists" to "postgres";

-- grants
grant SELECT on table "public"."os_checklists" to "postgres";

-- grants
grant UPDATE on table "public"."os_checklists" to "postgres";

-- grants
grant DELETE on table "public"."os_checklists" to "postgres";

-- grants
grant TRUNCATE on table "public"."os_checklists" to "postgres";

-- grants
grant REFERENCES on table "public"."os_checklists" to "postgres";

-- grants
grant TRIGGER on table "public"."os_checklists" to "postgres";

-- grants
grant MAINTAIN on table "public"."os_checklists" to "postgres";

-- grants
grant INSERT on table "public"."os_checklists" to "anon";

-- grants
grant SELECT on table "public"."os_checklists" to "anon";

-- grants
grant UPDATE on table "public"."os_checklists" to "anon";

-- grants
grant DELETE on table "public"."os_checklists" to "anon";

-- grants
grant TRUNCATE on table "public"."os_checklists" to "anon";

-- grants
grant REFERENCES on table "public"."os_checklists" to "anon";

-- grants
grant TRIGGER on table "public"."os_checklists" to "anon";

-- grants
grant MAINTAIN on table "public"."os_checklists" to "anon";

-- grants
grant INSERT on table "public"."os_checklists" to "authenticated";

-- grants
grant SELECT on table "public"."os_checklists" to "authenticated";

-- grants
grant UPDATE on table "public"."os_checklists" to "authenticated";

-- grants
grant DELETE on table "public"."os_checklists" to "authenticated";

-- grants
grant TRUNCATE on table "public"."os_checklists" to "authenticated";

-- grants
grant REFERENCES on table "public"."os_checklists" to "authenticated";

-- grants
grant TRIGGER on table "public"."os_checklists" to "authenticated";

-- grants
grant MAINTAIN on table "public"."os_checklists" to "authenticated";

-- grants
grant INSERT on table "public"."os_checklists" to "service_role";

-- grants
grant SELECT on table "public"."os_checklists" to "service_role";

-- grants
grant UPDATE on table "public"."os_checklists" to "service_role";

-- grants
grant DELETE on table "public"."os_checklists" to "service_role";

-- grants
grant TRUNCATE on table "public"."os_checklists" to "service_role";

-- grants
grant REFERENCES on table "public"."os_checklists" to "service_role";

-- grants
grant TRIGGER on table "public"."os_checklists" to "service_role";

-- grants
grant MAINTAIN on table "public"."os_checklists" to "service_role";

-- grants
revoke all on table "public"."pagamentos_venda" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pagamentos_venda" to "postgres";

-- grants
grant SELECT on table "public"."pagamentos_venda" to "postgres";

-- grants
grant UPDATE on table "public"."pagamentos_venda" to "postgres";

-- grants
grant DELETE on table "public"."pagamentos_venda" to "postgres";

-- grants
grant TRUNCATE on table "public"."pagamentos_venda" to "postgres";

-- grants
grant REFERENCES on table "public"."pagamentos_venda" to "postgres";

-- grants
grant TRIGGER on table "public"."pagamentos_venda" to "postgres";

-- grants
grant MAINTAIN on table "public"."pagamentos_venda" to "postgres";

-- grants
grant INSERT on table "public"."pagamentos_venda" to "anon";

-- grants
grant SELECT on table "public"."pagamentos_venda" to "anon";

-- grants
grant UPDATE on table "public"."pagamentos_venda" to "anon";

-- grants
grant DELETE on table "public"."pagamentos_venda" to "anon";

-- grants
grant TRUNCATE on table "public"."pagamentos_venda" to "anon";

-- grants
grant REFERENCES on table "public"."pagamentos_venda" to "anon";

-- grants
grant TRIGGER on table "public"."pagamentos_venda" to "anon";

-- grants
grant MAINTAIN on table "public"."pagamentos_venda" to "anon";

-- grants
grant INSERT on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant SELECT on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant UPDATE on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant DELETE on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant REFERENCES on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant TRIGGER on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pagamentos_venda" to "authenticated";

-- grants
grant INSERT on table "public"."pagamentos_venda" to "service_role";

-- grants
grant SELECT on table "public"."pagamentos_venda" to "service_role";

-- grants
grant UPDATE on table "public"."pagamentos_venda" to "service_role";

-- grants
grant DELETE on table "public"."pagamentos_venda" to "service_role";

-- grants
grant TRUNCATE on table "public"."pagamentos_venda" to "service_role";

-- grants
grant REFERENCES on table "public"."pagamentos_venda" to "service_role";

-- grants
grant TRIGGER on table "public"."pagamentos_venda" to "service_role";

-- grants
grant MAINTAIN on table "public"."pagamentos_venda" to "service_role";

-- grants
revoke all on table "public"."pedidos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos" to "postgres";

-- grants
grant SELECT on table "public"."pedidos" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos" to "postgres";

-- grants
grant DELETE on table "public"."pedidos" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos" to "postgres";

-- grants
grant INSERT on table "public"."pedidos" to "anon";

-- grants
grant SELECT on table "public"."pedidos" to "anon";

-- grants
grant UPDATE on table "public"."pedidos" to "anon";

-- grants
grant DELETE on table "public"."pedidos" to "anon";

-- grants
grant TRUNCATE on table "public"."pedidos" to "anon";

-- grants
grant REFERENCES on table "public"."pedidos" to "anon";

-- grants
grant TRIGGER on table "public"."pedidos" to "anon";

-- grants
grant MAINTAIN on table "public"."pedidos" to "anon";

-- grants
grant INSERT on table "public"."pedidos" to "authenticated";

-- grants
grant SELECT on table "public"."pedidos" to "authenticated";

-- grants
grant UPDATE on table "public"."pedidos" to "authenticated";

-- grants
grant DELETE on table "public"."pedidos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pedidos" to "authenticated";

-- grants
grant REFERENCES on table "public"."pedidos" to "authenticated";

-- grants
grant TRIGGER on table "public"."pedidos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pedidos" to "authenticated";

-- grants
grant INSERT on table "public"."pedidos" to "service_role";

-- grants
grant SELECT on table "public"."pedidos" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos" to "service_role";

-- grants
grant DELETE on table "public"."pedidos" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos" to "service_role";

-- grants
revoke all on table "public"."pedidos_app" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app" to "authenticated";

-- grants
revoke all on table "public"."pedidos_app_atendimentos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app_atendimentos" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app_atendimentos" to "service_role";

-- grants
revoke all on table "public"."pedidos_app_credito_fila" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app_credito_fila" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app_credito_fila" to "service_role";

-- grants
revoke all on table "public"."pedidos_app_operacao" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app_operacao" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app_operacao" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app_operacao" to "service_role";

-- grants
revoke all on table "public"."pedidos_app_operacao_eventos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app_operacao_eventos" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app_operacao_eventos" to "service_role";

-- grants
revoke all on table "public"."pedidos_app_unidades" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_app_unidades" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_app_unidades" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_app_unidades" to "service_role";

-- grants
revoke all on table "public"."perfis" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."perfis" to "postgres";

-- grants
grant SELECT on table "public"."perfis" to "postgres";

-- grants
grant UPDATE on table "public"."perfis" to "postgres";

-- grants
grant DELETE on table "public"."perfis" to "postgres";

-- grants
grant TRUNCATE on table "public"."perfis" to "postgres";

-- grants
grant REFERENCES on table "public"."perfis" to "postgres";

-- grants
grant TRIGGER on table "public"."perfis" to "postgres";

-- grants
grant MAINTAIN on table "public"."perfis" to "postgres";

-- grants
grant INSERT on table "public"."perfis" to "anon";

-- grants
grant SELECT on table "public"."perfis" to "anon";

-- grants
grant UPDATE on table "public"."perfis" to "anon";

-- grants
grant DELETE on table "public"."perfis" to "anon";

-- grants
grant TRUNCATE on table "public"."perfis" to "anon";

-- grants
grant REFERENCES on table "public"."perfis" to "anon";

-- grants
grant TRIGGER on table "public"."perfis" to "anon";

-- grants
grant MAINTAIN on table "public"."perfis" to "anon";

-- grants
grant INSERT on table "public"."perfis" to "authenticated";

-- grants
grant SELECT on table "public"."perfis" to "authenticated";

-- grants
grant UPDATE on table "public"."perfis" to "authenticated";

-- grants
grant DELETE on table "public"."perfis" to "authenticated";

-- grants
grant TRUNCATE on table "public"."perfis" to "authenticated";

-- grants
grant REFERENCES on table "public"."perfis" to "authenticated";

-- grants
grant TRIGGER on table "public"."perfis" to "authenticated";

-- grants
grant MAINTAIN on table "public"."perfis" to "authenticated";

-- grants
grant INSERT on table "public"."perfis" to "service_role";

-- grants
grant SELECT on table "public"."perfis" to "service_role";

-- grants
grant UPDATE on table "public"."perfis" to "service_role";

-- grants
grant DELETE on table "public"."perfis" to "service_role";

-- grants
grant TRUNCATE on table "public"."perfis" to "service_role";

-- grants
grant REFERENCES on table "public"."perfis" to "service_role";

-- grants
grant TRIGGER on table "public"."perfis" to "service_role";

-- grants
grant MAINTAIN on table "public"."perfis" to "service_role";

-- grants
revoke all on table "public"."pessoas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pessoas" to "postgres";

-- grants
grant SELECT on table "public"."pessoas" to "postgres";

-- grants
grant UPDATE on table "public"."pessoas" to "postgres";

-- grants
grant DELETE on table "public"."pessoas" to "postgres";

-- grants
grant TRUNCATE on table "public"."pessoas" to "postgres";

-- grants
grant REFERENCES on table "public"."pessoas" to "postgres";

-- grants
grant TRIGGER on table "public"."pessoas" to "postgres";

-- grants
grant MAINTAIN on table "public"."pessoas" to "postgres";

-- grants
grant INSERT on table "public"."pessoas" to "anon";

-- grants
grant SELECT on table "public"."pessoas" to "anon";

-- grants
grant UPDATE on table "public"."pessoas" to "anon";

-- grants
grant DELETE on table "public"."pessoas" to "anon";

-- grants
grant TRUNCATE on table "public"."pessoas" to "anon";

-- grants
grant REFERENCES on table "public"."pessoas" to "anon";

-- grants
grant TRIGGER on table "public"."pessoas" to "anon";

-- grants
grant MAINTAIN on table "public"."pessoas" to "anon";

-- grants
grant INSERT on table "public"."pessoas" to "authenticated";

-- grants
grant SELECT on table "public"."pessoas" to "authenticated";

-- grants
grant UPDATE on table "public"."pessoas" to "authenticated";

-- grants
grant DELETE on table "public"."pessoas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pessoas" to "authenticated";

-- grants
grant REFERENCES on table "public"."pessoas" to "authenticated";

-- grants
grant TRIGGER on table "public"."pessoas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pessoas" to "authenticated";

-- grants
grant INSERT on table "public"."pessoas" to "service_role";

-- grants
grant SELECT on table "public"."pessoas" to "service_role";

-- grants
grant UPDATE on table "public"."pessoas" to "service_role";

-- grants
grant DELETE on table "public"."pessoas" to "service_role";

-- grants
grant TRUNCATE on table "public"."pessoas" to "service_role";

-- grants
grant REFERENCES on table "public"."pessoas" to "service_role";

-- grants
grant TRIGGER on table "public"."pessoas" to "service_role";

-- grants
grant MAINTAIN on table "public"."pessoas" to "service_role";

-- grants
revoke all on table "public"."pix_aliases" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pix_aliases" to "postgres";

-- grants
grant SELECT on table "public"."pix_aliases" to "postgres";

-- grants
grant UPDATE on table "public"."pix_aliases" to "postgres";

-- grants
grant DELETE on table "public"."pix_aliases" to "postgres";

-- grants
grant TRUNCATE on table "public"."pix_aliases" to "postgres";

-- grants
grant REFERENCES on table "public"."pix_aliases" to "postgres";

-- grants
grant TRIGGER on table "public"."pix_aliases" to "postgres";

-- grants
grant MAINTAIN on table "public"."pix_aliases" to "postgres";

-- grants
grant INSERT on table "public"."pix_aliases" to "anon";

-- grants
grant SELECT on table "public"."pix_aliases" to "anon";

-- grants
grant UPDATE on table "public"."pix_aliases" to "anon";

-- grants
grant DELETE on table "public"."pix_aliases" to "anon";

-- grants
grant TRUNCATE on table "public"."pix_aliases" to "anon";

-- grants
grant REFERENCES on table "public"."pix_aliases" to "anon";

-- grants
grant TRIGGER on table "public"."pix_aliases" to "anon";

-- grants
grant MAINTAIN on table "public"."pix_aliases" to "anon";

-- grants
grant INSERT on table "public"."pix_aliases" to "authenticated";

-- grants
grant SELECT on table "public"."pix_aliases" to "authenticated";

-- grants
grant UPDATE on table "public"."pix_aliases" to "authenticated";

-- grants
grant DELETE on table "public"."pix_aliases" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pix_aliases" to "authenticated";

-- grants
grant REFERENCES on table "public"."pix_aliases" to "authenticated";

-- grants
grant TRIGGER on table "public"."pix_aliases" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pix_aliases" to "authenticated";

-- grants
grant INSERT on table "public"."pix_aliases" to "service_role";

-- grants
grant SELECT on table "public"."pix_aliases" to "service_role";

-- grants
grant UPDATE on table "public"."pix_aliases" to "service_role";

-- grants
grant DELETE on table "public"."pix_aliases" to "service_role";

-- grants
grant TRUNCATE on table "public"."pix_aliases" to "service_role";

-- grants
grant REFERENCES on table "public"."pix_aliases" to "service_role";

-- grants
grant TRIGGER on table "public"."pix_aliases" to "service_role";

-- grants
grant MAINTAIN on table "public"."pix_aliases" to "service_role";

-- grants
revoke all on table "public"."pix_periodos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pix_periodos" to "postgres";

-- grants
grant SELECT on table "public"."pix_periodos" to "postgres";

-- grants
grant UPDATE on table "public"."pix_periodos" to "postgres";

-- grants
grant DELETE on table "public"."pix_periodos" to "postgres";

-- grants
grant TRUNCATE on table "public"."pix_periodos" to "postgres";

-- grants
grant REFERENCES on table "public"."pix_periodos" to "postgres";

-- grants
grant TRIGGER on table "public"."pix_periodos" to "postgres";

-- grants
grant MAINTAIN on table "public"."pix_periodos" to "postgres";

-- grants
grant INSERT on table "public"."pix_periodos" to "anon";

-- grants
grant SELECT on table "public"."pix_periodos" to "anon";

-- grants
grant UPDATE on table "public"."pix_periodos" to "anon";

-- grants
grant DELETE on table "public"."pix_periodos" to "anon";

-- grants
grant TRUNCATE on table "public"."pix_periodos" to "anon";

-- grants
grant REFERENCES on table "public"."pix_periodos" to "anon";

-- grants
grant TRIGGER on table "public"."pix_periodos" to "anon";

-- grants
grant MAINTAIN on table "public"."pix_periodos" to "anon";

-- grants
grant INSERT on table "public"."pix_periodos" to "authenticated";

-- grants
grant SELECT on table "public"."pix_periodos" to "authenticated";

-- grants
grant UPDATE on table "public"."pix_periodos" to "authenticated";

-- grants
grant DELETE on table "public"."pix_periodos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pix_periodos" to "authenticated";

-- grants
grant REFERENCES on table "public"."pix_periodos" to "authenticated";

-- grants
grant TRIGGER on table "public"."pix_periodos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pix_periodos" to "authenticated";

-- grants
grant INSERT on table "public"."pix_periodos" to "service_role";

-- grants
grant SELECT on table "public"."pix_periodos" to "service_role";

-- grants
grant UPDATE on table "public"."pix_periodos" to "service_role";

-- grants
grant DELETE on table "public"."pix_periodos" to "service_role";

-- grants
grant TRUNCATE on table "public"."pix_periodos" to "service_role";

-- grants
grant REFERENCES on table "public"."pix_periodos" to "service_role";

-- grants
grant TRIGGER on table "public"."pix_periodos" to "service_role";

-- grants
grant MAINTAIN on table "public"."pix_periodos" to "service_role";

-- grants
revoke all on table "public"."pontos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pontos" to "postgres";

-- grants
grant SELECT on table "public"."pontos" to "postgres";

-- grants
grant UPDATE on table "public"."pontos" to "postgres";

-- grants
grant DELETE on table "public"."pontos" to "postgres";

-- grants
grant TRUNCATE on table "public"."pontos" to "postgres";

-- grants
grant REFERENCES on table "public"."pontos" to "postgres";

-- grants
grant TRIGGER on table "public"."pontos" to "postgres";

-- grants
grant MAINTAIN on table "public"."pontos" to "postgres";

-- grants
grant INSERT on table "public"."pontos" to "anon";

-- grants
grant SELECT on table "public"."pontos" to "anon";

-- grants
grant UPDATE on table "public"."pontos" to "anon";

-- grants
grant DELETE on table "public"."pontos" to "anon";

-- grants
grant TRUNCATE on table "public"."pontos" to "anon";

-- grants
grant REFERENCES on table "public"."pontos" to "anon";

-- grants
grant TRIGGER on table "public"."pontos" to "anon";

-- grants
grant MAINTAIN on table "public"."pontos" to "anon";

-- grants
grant INSERT on table "public"."pontos" to "authenticated";

-- grants
grant SELECT on table "public"."pontos" to "authenticated";

-- grants
grant UPDATE on table "public"."pontos" to "authenticated";

-- grants
grant DELETE on table "public"."pontos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pontos" to "authenticated";

-- grants
grant REFERENCES on table "public"."pontos" to "authenticated";

-- grants
grant TRIGGER on table "public"."pontos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pontos" to "authenticated";

-- grants
grant INSERT on table "public"."pontos" to "service_role";

-- grants
grant SELECT on table "public"."pontos" to "service_role";

-- grants
grant UPDATE on table "public"."pontos" to "service_role";

-- grants
grant DELETE on table "public"."pontos" to "service_role";

-- grants
grant TRUNCATE on table "public"."pontos" to "service_role";

-- grants
grant REFERENCES on table "public"."pontos" to "service_role";

-- grants
grant TRIGGER on table "public"."pontos" to "service_role";

-- grants
grant MAINTAIN on table "public"."pontos" to "service_role";

-- grants
revoke all on table "public"."produtos" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."produtos" to "postgres";

-- grants
grant SELECT on table "public"."produtos" to "postgres";

-- grants
grant UPDATE on table "public"."produtos" to "postgres";

-- grants
grant DELETE on table "public"."produtos" to "postgres";

-- grants
grant TRUNCATE on table "public"."produtos" to "postgres";

-- grants
grant REFERENCES on table "public"."produtos" to "postgres";

-- grants
grant TRIGGER on table "public"."produtos" to "postgres";

-- grants
grant MAINTAIN on table "public"."produtos" to "postgres";

-- grants
grant INSERT on table "public"."produtos" to "anon";

-- grants
grant UPDATE on table "public"."produtos" to "anon";

-- grants
grant DELETE on table "public"."produtos" to "anon";

-- grants
grant TRUNCATE on table "public"."produtos" to "anon";

-- grants
grant REFERENCES on table "public"."produtos" to "anon";

-- grants
grant TRIGGER on table "public"."produtos" to "anon";

-- grants
grant MAINTAIN on table "public"."produtos" to "anon";

-- grants
grant INSERT on table "public"."produtos" to "authenticated";

-- grants
grant SELECT on table "public"."produtos" to "authenticated";

-- grants
grant UPDATE on table "public"."produtos" to "authenticated";

-- grants
grant DELETE on table "public"."produtos" to "authenticated";

-- grants
grant TRUNCATE on table "public"."produtos" to "authenticated";

-- grants
grant REFERENCES on table "public"."produtos" to "authenticated";

-- grants
grant TRIGGER on table "public"."produtos" to "authenticated";

-- grants
grant MAINTAIN on table "public"."produtos" to "authenticated";

-- grants
grant INSERT on table "public"."produtos" to "service_role";

-- grants
grant SELECT on table "public"."produtos" to "service_role";

-- grants
grant UPDATE on table "public"."produtos" to "service_role";

-- grants
grant DELETE on table "public"."produtos" to "service_role";

-- grants
grant TRUNCATE on table "public"."produtos" to "service_role";

-- grants
grant REFERENCES on table "public"."produtos" to "service_role";

-- grants
grant TRIGGER on table "public"."produtos" to "service_role";

-- grants
grant MAINTAIN on table "public"."produtos" to "service_role";

-- grants
revoke all on table "public"."promocao_tabelas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."promocao_tabelas" to "postgres";

-- grants
grant SELECT on table "public"."promocao_tabelas" to "postgres";

-- grants
grant UPDATE on table "public"."promocao_tabelas" to "postgres";

-- grants
grant DELETE on table "public"."promocao_tabelas" to "postgres";

-- grants
grant TRUNCATE on table "public"."promocao_tabelas" to "postgres";

-- grants
grant REFERENCES on table "public"."promocao_tabelas" to "postgres";

-- grants
grant TRIGGER on table "public"."promocao_tabelas" to "postgres";

-- grants
grant MAINTAIN on table "public"."promocao_tabelas" to "postgres";

-- grants
grant INSERT on table "public"."promocao_tabelas" to "anon";

-- grants
grant SELECT on table "public"."promocao_tabelas" to "anon";

-- grants
grant UPDATE on table "public"."promocao_tabelas" to "anon";

-- grants
grant DELETE on table "public"."promocao_tabelas" to "anon";

-- grants
grant TRUNCATE on table "public"."promocao_tabelas" to "anon";

-- grants
grant REFERENCES on table "public"."promocao_tabelas" to "anon";

-- grants
grant TRIGGER on table "public"."promocao_tabelas" to "anon";

-- grants
grant MAINTAIN on table "public"."promocao_tabelas" to "anon";

-- grants
grant INSERT on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant SELECT on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant UPDATE on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant DELETE on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant REFERENCES on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant TRIGGER on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."promocao_tabelas" to "authenticated";

-- grants
grant INSERT on table "public"."promocao_tabelas" to "service_role";

-- grants
grant SELECT on table "public"."promocao_tabelas" to "service_role";

-- grants
grant UPDATE on table "public"."promocao_tabelas" to "service_role";

-- grants
grant DELETE on table "public"."promocao_tabelas" to "service_role";

-- grants
grant TRUNCATE on table "public"."promocao_tabelas" to "service_role";

-- grants
grant REFERENCES on table "public"."promocao_tabelas" to "service_role";

-- grants
grant TRIGGER on table "public"."promocao_tabelas" to "service_role";

-- grants
grant MAINTAIN on table "public"."promocao_tabelas" to "service_role";

-- grants
revoke all on table "public"."promocoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."promocoes" to "postgres";

-- grants
grant SELECT on table "public"."promocoes" to "postgres";

-- grants
grant UPDATE on table "public"."promocoes" to "postgres";

-- grants
grant DELETE on table "public"."promocoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."promocoes" to "postgres";

-- grants
grant REFERENCES on table "public"."promocoes" to "postgres";

-- grants
grant TRIGGER on table "public"."promocoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."promocoes" to "postgres";

-- grants
grant INSERT on table "public"."promocoes" to "anon";

-- grants
grant SELECT on table "public"."promocoes" to "anon";

-- grants
grant UPDATE on table "public"."promocoes" to "anon";

-- grants
grant DELETE on table "public"."promocoes" to "anon";

-- grants
grant TRUNCATE on table "public"."promocoes" to "anon";

-- grants
grant REFERENCES on table "public"."promocoes" to "anon";

-- grants
grant TRIGGER on table "public"."promocoes" to "anon";

-- grants
grant MAINTAIN on table "public"."promocoes" to "anon";

-- grants
grant INSERT on table "public"."promocoes" to "authenticated";

-- grants
grant SELECT on table "public"."promocoes" to "authenticated";

-- grants
grant UPDATE on table "public"."promocoes" to "authenticated";

-- grants
grant DELETE on table "public"."promocoes" to "authenticated";

-- grants
grant TRUNCATE on table "public"."promocoes" to "authenticated";

-- grants
grant REFERENCES on table "public"."promocoes" to "authenticated";

-- grants
grant TRIGGER on table "public"."promocoes" to "authenticated";

-- grants
grant MAINTAIN on table "public"."promocoes" to "authenticated";

-- grants
grant INSERT on table "public"."promocoes" to "service_role";

-- grants
grant SELECT on table "public"."promocoes" to "service_role";

-- grants
grant UPDATE on table "public"."promocoes" to "service_role";

-- grants
grant DELETE on table "public"."promocoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."promocoes" to "service_role";

-- grants
grant REFERENCES on table "public"."promocoes" to "service_role";

-- grants
grant TRIGGER on table "public"."promocoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."promocoes" to "service_role";

-- grants
revoke all on table "public"."rascunhos_anuncio_ml" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant SELECT on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant UPDATE on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant DELETE on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant TRUNCATE on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant REFERENCES on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant TRIGGER on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant MAINTAIN on table "public"."rascunhos_anuncio_ml" to "postgres";

-- grants
grant INSERT on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant SELECT on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant UPDATE on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant DELETE on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant TRUNCATE on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant REFERENCES on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant TRIGGER on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant MAINTAIN on table "public"."rascunhos_anuncio_ml" to "anon";

-- grants
grant INSERT on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant SELECT on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant UPDATE on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant DELETE on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant TRUNCATE on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant REFERENCES on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant TRIGGER on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant MAINTAIN on table "public"."rascunhos_anuncio_ml" to "authenticated";

-- grants
grant INSERT on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant SELECT on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant UPDATE on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant DELETE on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant TRUNCATE on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant REFERENCES on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant TRIGGER on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
grant MAINTAIN on table "public"."rascunhos_anuncio_ml" to "service_role";

-- grants
revoke all on table "public"."recebimentos_lote_operacoes" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant SELECT on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant UPDATE on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant DELETE on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant TRUNCATE on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant REFERENCES on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant TRIGGER on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant MAINTAIN on table "public"."recebimentos_lote_operacoes" to "postgres";

-- grants
grant INSERT on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant SELECT on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant UPDATE on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant DELETE on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant TRUNCATE on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant REFERENCES on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant TRIGGER on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
grant MAINTAIN on table "public"."recebimentos_lote_operacoes" to "service_role";

-- grants
revoke all on table "public"."reclassificacoes_forma" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant SELECT on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant UPDATE on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant DELETE on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant TRUNCATE on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant REFERENCES on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant TRIGGER on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant MAINTAIN on table "public"."reclassificacoes_forma" to "postgres";

-- grants
grant INSERT on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant SELECT on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant UPDATE on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant DELETE on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant TRUNCATE on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant REFERENCES on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant TRIGGER on table "public"."reclassificacoes_forma" to "service_role";

-- grants
grant MAINTAIN on table "public"."reclassificacoes_forma" to "service_role";

-- grants
revoke all on table "public"."remessas_estoque" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."remessas_estoque" to "postgres";

-- grants
grant SELECT on table "public"."remessas_estoque" to "postgres";

-- grants
grant UPDATE on table "public"."remessas_estoque" to "postgres";

-- grants
grant DELETE on table "public"."remessas_estoque" to "postgres";

-- grants
grant TRUNCATE on table "public"."remessas_estoque" to "postgres";

-- grants
grant REFERENCES on table "public"."remessas_estoque" to "postgres";

-- grants
grant TRIGGER on table "public"."remessas_estoque" to "postgres";

-- grants
grant MAINTAIN on table "public"."remessas_estoque" to "postgres";

-- grants
grant INSERT on table "public"."remessas_estoque" to "anon";

-- grants
grant SELECT on table "public"."remessas_estoque" to "anon";

-- grants
grant UPDATE on table "public"."remessas_estoque" to "anon";

-- grants
grant DELETE on table "public"."remessas_estoque" to "anon";

-- grants
grant TRUNCATE on table "public"."remessas_estoque" to "anon";

-- grants
grant REFERENCES on table "public"."remessas_estoque" to "anon";

-- grants
grant TRIGGER on table "public"."remessas_estoque" to "anon";

-- grants
grant MAINTAIN on table "public"."remessas_estoque" to "anon";

-- grants
grant INSERT on table "public"."remessas_estoque" to "authenticated";

-- grants
grant SELECT on table "public"."remessas_estoque" to "authenticated";

-- grants
grant UPDATE on table "public"."remessas_estoque" to "authenticated";

-- grants
grant DELETE on table "public"."remessas_estoque" to "authenticated";

-- grants
grant TRUNCATE on table "public"."remessas_estoque" to "authenticated";

-- grants
grant REFERENCES on table "public"."remessas_estoque" to "authenticated";

-- grants
grant TRIGGER on table "public"."remessas_estoque" to "authenticated";

-- grants
grant MAINTAIN on table "public"."remessas_estoque" to "authenticated";

-- grants
grant INSERT on table "public"."remessas_estoque" to "service_role";

-- grants
grant SELECT on table "public"."remessas_estoque" to "service_role";

-- grants
grant UPDATE on table "public"."remessas_estoque" to "service_role";

-- grants
grant DELETE on table "public"."remessas_estoque" to "service_role";

-- grants
grant TRUNCATE on table "public"."remessas_estoque" to "service_role";

-- grants
grant REFERENCES on table "public"."remessas_estoque" to "service_role";

-- grants
grant TRIGGER on table "public"."remessas_estoque" to "service_role";

-- grants
grant MAINTAIN on table "public"."remessas_estoque" to "service_role";

-- grants
revoke all on table "public"."remessas_estoque_itens" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant SELECT on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant UPDATE on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant DELETE on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant TRUNCATE on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant REFERENCES on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant TRIGGER on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant MAINTAIN on table "public"."remessas_estoque_itens" to "postgres";

-- grants
grant INSERT on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant SELECT on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant UPDATE on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant DELETE on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant TRUNCATE on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant REFERENCES on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant TRIGGER on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant MAINTAIN on table "public"."remessas_estoque_itens" to "anon";

-- grants
grant INSERT on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant SELECT on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant UPDATE on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant DELETE on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant TRUNCATE on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant REFERENCES on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant TRIGGER on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant MAINTAIN on table "public"."remessas_estoque_itens" to "authenticated";

-- grants
grant INSERT on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant SELECT on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant UPDATE on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant DELETE on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant TRUNCATE on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant REFERENCES on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant TRIGGER on table "public"."remessas_estoque_itens" to "service_role";

-- grants
grant MAINTAIN on table "public"."remessas_estoque_itens" to "service_role";

-- grants
revoke all on table "public"."sync_log" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."sync_log" to "postgres";

-- grants
grant SELECT on table "public"."sync_log" to "postgres";

-- grants
grant UPDATE on table "public"."sync_log" to "postgres";

-- grants
grant DELETE on table "public"."sync_log" to "postgres";

-- grants
grant TRUNCATE on table "public"."sync_log" to "postgres";

-- grants
grant REFERENCES on table "public"."sync_log" to "postgres";

-- grants
grant TRIGGER on table "public"."sync_log" to "postgres";

-- grants
grant MAINTAIN on table "public"."sync_log" to "postgres";

-- grants
grant INSERT on table "public"."sync_log" to "anon";

-- grants
grant SELECT on table "public"."sync_log" to "anon";

-- grants
grant UPDATE on table "public"."sync_log" to "anon";

-- grants
grant DELETE on table "public"."sync_log" to "anon";

-- grants
grant TRUNCATE on table "public"."sync_log" to "anon";

-- grants
grant REFERENCES on table "public"."sync_log" to "anon";

-- grants
grant TRIGGER on table "public"."sync_log" to "anon";

-- grants
grant MAINTAIN on table "public"."sync_log" to "anon";

-- grants
grant INSERT on table "public"."sync_log" to "authenticated";

-- grants
grant SELECT on table "public"."sync_log" to "authenticated";

-- grants
grant UPDATE on table "public"."sync_log" to "authenticated";

-- grants
grant DELETE on table "public"."sync_log" to "authenticated";

-- grants
grant TRUNCATE on table "public"."sync_log" to "authenticated";

-- grants
grant REFERENCES on table "public"."sync_log" to "authenticated";

-- grants
grant TRIGGER on table "public"."sync_log" to "authenticated";

-- grants
grant MAINTAIN on table "public"."sync_log" to "authenticated";

-- grants
grant INSERT on table "public"."sync_log" to "service_role";

-- grants
grant SELECT on table "public"."sync_log" to "service_role";

-- grants
grant UPDATE on table "public"."sync_log" to "service_role";

-- grants
grant DELETE on table "public"."sync_log" to "service_role";

-- grants
grant TRUNCATE on table "public"."sync_log" to "service_role";

-- grants
grant REFERENCES on table "public"."sync_log" to "service_role";

-- grants
grant TRIGGER on table "public"."sync_log" to "service_role";

-- grants
grant MAINTAIN on table "public"."sync_log" to "service_role";

-- grants
revoke all on table "public"."tabelas_preco" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."tabelas_preco" to "postgres";

-- grants
grant SELECT on table "public"."tabelas_preco" to "postgres";

-- grants
grant UPDATE on table "public"."tabelas_preco" to "postgres";

-- grants
grant DELETE on table "public"."tabelas_preco" to "postgres";

-- grants
grant TRUNCATE on table "public"."tabelas_preco" to "postgres";

-- grants
grant REFERENCES on table "public"."tabelas_preco" to "postgres";

-- grants
grant TRIGGER on table "public"."tabelas_preco" to "postgres";

-- grants
grant MAINTAIN on table "public"."tabelas_preco" to "postgres";

-- grants
grant INSERT on table "public"."tabelas_preco" to "anon";

-- grants
grant SELECT on table "public"."tabelas_preco" to "anon";

-- grants
grant UPDATE on table "public"."tabelas_preco" to "anon";

-- grants
grant DELETE on table "public"."tabelas_preco" to "anon";

-- grants
grant TRUNCATE on table "public"."tabelas_preco" to "anon";

-- grants
grant REFERENCES on table "public"."tabelas_preco" to "anon";

-- grants
grant TRIGGER on table "public"."tabelas_preco" to "anon";

-- grants
grant MAINTAIN on table "public"."tabelas_preco" to "anon";

-- grants
grant INSERT on table "public"."tabelas_preco" to "authenticated";

-- grants
grant SELECT on table "public"."tabelas_preco" to "authenticated";

-- grants
grant UPDATE on table "public"."tabelas_preco" to "authenticated";

-- grants
grant DELETE on table "public"."tabelas_preco" to "authenticated";

-- grants
grant TRUNCATE on table "public"."tabelas_preco" to "authenticated";

-- grants
grant REFERENCES on table "public"."tabelas_preco" to "authenticated";

-- grants
grant TRIGGER on table "public"."tabelas_preco" to "authenticated";

-- grants
grant MAINTAIN on table "public"."tabelas_preco" to "authenticated";

-- grants
grant INSERT on table "public"."tabelas_preco" to "service_role";

-- grants
grant SELECT on table "public"."tabelas_preco" to "service_role";

-- grants
grant UPDATE on table "public"."tabelas_preco" to "service_role";

-- grants
grant DELETE on table "public"."tabelas_preco" to "service_role";

-- grants
grant TRUNCATE on table "public"."tabelas_preco" to "service_role";

-- grants
grant REFERENCES on table "public"."tabelas_preco" to "service_role";

-- grants
grant TRIGGER on table "public"."tabelas_preco" to "service_role";

-- grants
grant MAINTAIN on table "public"."tabelas_preco" to "service_role";

-- grants
revoke all on table "public"."transferencias" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."transferencias" to "postgres";

-- grants
grant SELECT on table "public"."transferencias" to "postgres";

-- grants
grant UPDATE on table "public"."transferencias" to "postgres";

-- grants
grant DELETE on table "public"."transferencias" to "postgres";

-- grants
grant TRUNCATE on table "public"."transferencias" to "postgres";

-- grants
grant REFERENCES on table "public"."transferencias" to "postgres";

-- grants
grant TRIGGER on table "public"."transferencias" to "postgres";

-- grants
grant MAINTAIN on table "public"."transferencias" to "postgres";

-- grants
grant INSERT on table "public"."transferencias" to "anon";

-- grants
grant SELECT on table "public"."transferencias" to "anon";

-- grants
grant UPDATE on table "public"."transferencias" to "anon";

-- grants
grant DELETE on table "public"."transferencias" to "anon";

-- grants
grant TRUNCATE on table "public"."transferencias" to "anon";

-- grants
grant REFERENCES on table "public"."transferencias" to "anon";

-- grants
grant TRIGGER on table "public"."transferencias" to "anon";

-- grants
grant MAINTAIN on table "public"."transferencias" to "anon";

-- grants
grant INSERT on table "public"."transferencias" to "authenticated";

-- grants
grant SELECT on table "public"."transferencias" to "authenticated";

-- grants
grant UPDATE on table "public"."transferencias" to "authenticated";

-- grants
grant DELETE on table "public"."transferencias" to "authenticated";

-- grants
grant TRUNCATE on table "public"."transferencias" to "authenticated";

-- grants
grant REFERENCES on table "public"."transferencias" to "authenticated";

-- grants
grant TRIGGER on table "public"."transferencias" to "authenticated";

-- grants
grant MAINTAIN on table "public"."transferencias" to "authenticated";

-- grants
grant INSERT on table "public"."transferencias" to "service_role";

-- grants
grant SELECT on table "public"."transferencias" to "service_role";

-- grants
grant UPDATE on table "public"."transferencias" to "service_role";

-- grants
grant DELETE on table "public"."transferencias" to "service_role";

-- grants
grant TRUNCATE on table "public"."transferencias" to "service_role";

-- grants
grant REFERENCES on table "public"."transferencias" to "service_role";

-- grants
grant TRIGGER on table "public"."transferencias" to "service_role";

-- grants
grant MAINTAIN on table "public"."transferencias" to "service_role";

-- grants
revoke all on table "public"."trocas_sp" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."trocas_sp" to "postgres";

-- grants
grant SELECT on table "public"."trocas_sp" to "postgres";

-- grants
grant UPDATE on table "public"."trocas_sp" to "postgres";

-- grants
grant DELETE on table "public"."trocas_sp" to "postgres";

-- grants
grant TRUNCATE on table "public"."trocas_sp" to "postgres";

-- grants
grant REFERENCES on table "public"."trocas_sp" to "postgres";

-- grants
grant TRIGGER on table "public"."trocas_sp" to "postgres";

-- grants
grant MAINTAIN on table "public"."trocas_sp" to "postgres";

-- grants
grant INSERT on table "public"."trocas_sp" to "anon";

-- grants
grant SELECT on table "public"."trocas_sp" to "anon";

-- grants
grant UPDATE on table "public"."trocas_sp" to "anon";

-- grants
grant DELETE on table "public"."trocas_sp" to "anon";

-- grants
grant TRUNCATE on table "public"."trocas_sp" to "anon";

-- grants
grant REFERENCES on table "public"."trocas_sp" to "anon";

-- grants
grant TRIGGER on table "public"."trocas_sp" to "anon";

-- grants
grant MAINTAIN on table "public"."trocas_sp" to "anon";

-- grants
grant INSERT on table "public"."trocas_sp" to "authenticated";

-- grants
grant SELECT on table "public"."trocas_sp" to "authenticated";

-- grants
grant UPDATE on table "public"."trocas_sp" to "authenticated";

-- grants
grant DELETE on table "public"."trocas_sp" to "authenticated";

-- grants
grant TRUNCATE on table "public"."trocas_sp" to "authenticated";

-- grants
grant REFERENCES on table "public"."trocas_sp" to "authenticated";

-- grants
grant TRIGGER on table "public"."trocas_sp" to "authenticated";

-- grants
grant MAINTAIN on table "public"."trocas_sp" to "authenticated";

-- grants
grant INSERT on table "public"."trocas_sp" to "service_role";

-- grants
grant SELECT on table "public"."trocas_sp" to "service_role";

-- grants
grant UPDATE on table "public"."trocas_sp" to "service_role";

-- grants
grant DELETE on table "public"."trocas_sp" to "service_role";

-- grants
grant TRUNCATE on table "public"."trocas_sp" to "service_role";

-- grants
grant REFERENCES on table "public"."trocas_sp" to "service_role";

-- grants
grant TRIGGER on table "public"."trocas_sp" to "service_role";

-- grants
grant MAINTAIN on table "public"."trocas_sp" to "service_role";

-- grants
revoke all on table "public"."vales_credito" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."vales_credito" to "postgres";

-- grants
grant SELECT on table "public"."vales_credito" to "postgres";

-- grants
grant UPDATE on table "public"."vales_credito" to "postgres";

-- grants
grant DELETE on table "public"."vales_credito" to "postgres";

-- grants
grant TRUNCATE on table "public"."vales_credito" to "postgres";

-- grants
grant REFERENCES on table "public"."vales_credito" to "postgres";

-- grants
grant TRIGGER on table "public"."vales_credito" to "postgres";

-- grants
grant MAINTAIN on table "public"."vales_credito" to "postgres";

-- grants
grant INSERT on table "public"."vales_credito" to "anon";

-- grants
grant SELECT on table "public"."vales_credito" to "anon";

-- grants
grant UPDATE on table "public"."vales_credito" to "anon";

-- grants
grant DELETE on table "public"."vales_credito" to "anon";

-- grants
grant TRUNCATE on table "public"."vales_credito" to "anon";

-- grants
grant REFERENCES on table "public"."vales_credito" to "anon";

-- grants
grant TRIGGER on table "public"."vales_credito" to "anon";

-- grants
grant MAINTAIN on table "public"."vales_credito" to "anon";

-- grants
grant INSERT on table "public"."vales_credito" to "authenticated";

-- grants
grant SELECT on table "public"."vales_credito" to "authenticated";

-- grants
grant UPDATE on table "public"."vales_credito" to "authenticated";

-- grants
grant DELETE on table "public"."vales_credito" to "authenticated";

-- grants
grant TRUNCATE on table "public"."vales_credito" to "authenticated";

-- grants
grant REFERENCES on table "public"."vales_credito" to "authenticated";

-- grants
grant TRIGGER on table "public"."vales_credito" to "authenticated";

-- grants
grant MAINTAIN on table "public"."vales_credito" to "authenticated";

-- grants
grant INSERT on table "public"."vales_credito" to "service_role";

-- grants
grant SELECT on table "public"."vales_credito" to "service_role";

-- grants
grant UPDATE on table "public"."vales_credito" to "service_role";

-- grants
grant DELETE on table "public"."vales_credito" to "service_role";

-- grants
grant TRUNCATE on table "public"."vales_credito" to "service_role";

-- grants
grant REFERENCES on table "public"."vales_credito" to "service_role";

-- grants
grant TRIGGER on table "public"."vales_credito" to "service_role";

-- grants
grant MAINTAIN on table "public"."vales_credito" to "service_role";

-- grants
revoke all on table "public"."vendas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."vendas" to "postgres";

-- grants
grant SELECT on table "public"."vendas" to "postgres";

-- grants
grant UPDATE on table "public"."vendas" to "postgres";

-- grants
grant DELETE on table "public"."vendas" to "postgres";

-- grants
grant TRUNCATE on table "public"."vendas" to "postgres";

-- grants
grant REFERENCES on table "public"."vendas" to "postgres";

-- grants
grant TRIGGER on table "public"."vendas" to "postgres";

-- grants
grant MAINTAIN on table "public"."vendas" to "postgres";

-- grants
grant INSERT on table "public"."vendas" to "anon";

-- grants
grant SELECT on table "public"."vendas" to "anon";

-- grants
grant UPDATE on table "public"."vendas" to "anon";

-- grants
grant DELETE on table "public"."vendas" to "anon";

-- grants
grant TRUNCATE on table "public"."vendas" to "anon";

-- grants
grant REFERENCES on table "public"."vendas" to "anon";

-- grants
grant TRIGGER on table "public"."vendas" to "anon";

-- grants
grant MAINTAIN on table "public"."vendas" to "anon";

-- grants
grant INSERT on table "public"."vendas" to "authenticated";

-- grants
grant SELECT on table "public"."vendas" to "authenticated";

-- grants
grant UPDATE on table "public"."vendas" to "authenticated";

-- grants
grant DELETE on table "public"."vendas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."vendas" to "authenticated";

-- grants
grant REFERENCES on table "public"."vendas" to "authenticated";

-- grants
grant TRIGGER on table "public"."vendas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."vendas" to "authenticated";

-- grants
grant INSERT on table "public"."vendas" to "service_role";

-- grants
grant SELECT on table "public"."vendas" to "service_role";

-- grants
grant UPDATE on table "public"."vendas" to "service_role";

-- grants
grant DELETE on table "public"."vendas" to "service_role";

-- grants
grant TRUNCATE on table "public"."vendas" to "service_role";

-- grants
grant REFERENCES on table "public"."vendas" to "service_role";

-- grants
grant TRIGGER on table "public"."vendas" to "service_role";

-- grants
grant MAINTAIN on table "public"."vendas" to "service_role";

-- grants
revoke all on table "public"."catalogo_app" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."catalogo_app" to "postgres";

-- grants
grant SELECT on table "public"."catalogo_app" to "postgres";

-- grants
grant UPDATE on table "public"."catalogo_app" to "postgres";

-- grants
grant DELETE on table "public"."catalogo_app" to "postgres";

-- grants
grant TRUNCATE on table "public"."catalogo_app" to "postgres";

-- grants
grant REFERENCES on table "public"."catalogo_app" to "postgres";

-- grants
grant TRIGGER on table "public"."catalogo_app" to "postgres";

-- grants
grant MAINTAIN on table "public"."catalogo_app" to "postgres";

-- grants
grant INSERT on table "public"."catalogo_app" to "anon";

-- grants
grant SELECT on table "public"."catalogo_app" to "anon";

-- grants
grant UPDATE on table "public"."catalogo_app" to "anon";

-- grants
grant DELETE on table "public"."catalogo_app" to "anon";

-- grants
grant TRUNCATE on table "public"."catalogo_app" to "anon";

-- grants
grant REFERENCES on table "public"."catalogo_app" to "anon";

-- grants
grant TRIGGER on table "public"."catalogo_app" to "anon";

-- grants
grant MAINTAIN on table "public"."catalogo_app" to "anon";

-- grants
grant INSERT on table "public"."catalogo_app" to "authenticated";

-- grants
grant SELECT on table "public"."catalogo_app" to "authenticated";

-- grants
grant UPDATE on table "public"."catalogo_app" to "authenticated";

-- grants
grant DELETE on table "public"."catalogo_app" to "authenticated";

-- grants
grant TRUNCATE on table "public"."catalogo_app" to "authenticated";

-- grants
grant REFERENCES on table "public"."catalogo_app" to "authenticated";

-- grants
grant TRIGGER on table "public"."catalogo_app" to "authenticated";

-- grants
grant MAINTAIN on table "public"."catalogo_app" to "authenticated";

-- grants
grant INSERT on table "public"."catalogo_app" to "service_role";

-- grants
grant SELECT on table "public"."catalogo_app" to "service_role";

-- grants
grant UPDATE on table "public"."catalogo_app" to "service_role";

-- grants
grant DELETE on table "public"."catalogo_app" to "service_role";

-- grants
grant TRUNCATE on table "public"."catalogo_app" to "service_role";

-- grants
grant REFERENCES on table "public"."catalogo_app" to "service_role";

-- grants
grant TRIGGER on table "public"."catalogo_app" to "service_role";

-- grants
grant MAINTAIN on table "public"."catalogo_app" to "service_role";

-- grants
revoke all on table "public"."pedidos_vendas" from PUBLIC, anon, authenticated, service_role;

-- grants
grant INSERT on table "public"."pedidos_vendas" to "postgres";

-- grants
grant SELECT on table "public"."pedidos_vendas" to "postgres";

-- grants
grant UPDATE on table "public"."pedidos_vendas" to "postgres";

-- grants
grant DELETE on table "public"."pedidos_vendas" to "postgres";

-- grants
grant TRUNCATE on table "public"."pedidos_vendas" to "postgres";

-- grants
grant REFERENCES on table "public"."pedidos_vendas" to "postgres";

-- grants
grant TRIGGER on table "public"."pedidos_vendas" to "postgres";

-- grants
grant MAINTAIN on table "public"."pedidos_vendas" to "postgres";

-- grants
grant INSERT on table "public"."pedidos_vendas" to "anon";

-- grants
grant SELECT on table "public"."pedidos_vendas" to "anon";

-- grants
grant UPDATE on table "public"."pedidos_vendas" to "anon";

-- grants
grant DELETE on table "public"."pedidos_vendas" to "anon";

-- grants
grant TRUNCATE on table "public"."pedidos_vendas" to "anon";

-- grants
grant REFERENCES on table "public"."pedidos_vendas" to "anon";

-- grants
grant TRIGGER on table "public"."pedidos_vendas" to "anon";

-- grants
grant MAINTAIN on table "public"."pedidos_vendas" to "anon";

-- grants
grant INSERT on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant SELECT on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant UPDATE on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant DELETE on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant TRUNCATE on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant REFERENCES on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant TRIGGER on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant MAINTAIN on table "public"."pedidos_vendas" to "authenticated";

-- grants
grant INSERT on table "public"."pedidos_vendas" to "service_role";

-- grants
grant SELECT on table "public"."pedidos_vendas" to "service_role";

-- grants
grant UPDATE on table "public"."pedidos_vendas" to "service_role";

-- grants
grant DELETE on table "public"."pedidos_vendas" to "service_role";

-- grants
grant TRUNCATE on table "public"."pedidos_vendas" to "service_role";

-- grants
grant REFERENCES on table "public"."pedidos_vendas" to "service_role";

-- grants
grant TRIGGER on table "public"."pedidos_vendas" to "service_role";

-- grants
grant MAINTAIN on table "public"."pedidos_vendas" to "service_role";

-- grants
revoke all on sequence "halloween_private"."audit_id_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "halloween_private"."audit_id_seq" to "postgres";

-- grants
grant UPDATE on sequence "halloween_private"."audit_id_seq" to "postgres";

-- grants
grant USAGE on sequence "halloween_private"."audit_id_seq" to "postgres";

-- grants
revoke all on sequence "halloween_private"."margin_cost_audit_id_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
revoke all on sequence "halloween_private"."sale_windows_id_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
revoke all on sequence "public"."ordens_servico_numero_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "public"."ordens_servico_numero_seq" to "postgres";

-- grants
grant UPDATE on sequence "public"."ordens_servico_numero_seq" to "postgres";

-- grants
grant USAGE on sequence "public"."ordens_servico_numero_seq" to "postgres";

-- grants
grant SELECT on sequence "public"."ordens_servico_numero_seq" to "anon";

-- grants
grant UPDATE on sequence "public"."ordens_servico_numero_seq" to "anon";

-- grants
grant USAGE on sequence "public"."ordens_servico_numero_seq" to "anon";

-- grants
grant SELECT on sequence "public"."ordens_servico_numero_seq" to "authenticated";

-- grants
grant UPDATE on sequence "public"."ordens_servico_numero_seq" to "authenticated";

-- grants
grant USAGE on sequence "public"."ordens_servico_numero_seq" to "authenticated";

-- grants
grant SELECT on sequence "public"."ordens_servico_numero_seq" to "service_role";

-- grants
grant UPDATE on sequence "public"."ordens_servico_numero_seq" to "service_role";

-- grants
grant USAGE on sequence "public"."ordens_servico_numero_seq" to "service_role";

-- grants
revoke all on sequence "public"."pedidos_app_operacao_eventos_id_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "postgres";

-- grants
grant UPDATE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "postgres";

-- grants
grant USAGE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "postgres";

-- grants
grant SELECT on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "anon";

-- grants
grant UPDATE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "anon";

-- grants
grant USAGE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "anon";

-- grants
grant SELECT on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "authenticated";

-- grants
grant UPDATE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "authenticated";

-- grants
grant USAGE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "authenticated";

-- grants
grant SELECT on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "service_role";

-- grants
grant UPDATE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "service_role";

-- grants
grant USAGE on sequence "public"."pedidos_app_operacao_eventos_id_seq" to "service_role";

-- grants
revoke all on sequence "public"."pedidos_numero_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "public"."pedidos_numero_seq" to "postgres";

-- grants
grant UPDATE on sequence "public"."pedidos_numero_seq" to "postgres";

-- grants
grant USAGE on sequence "public"."pedidos_numero_seq" to "postgres";

-- grants
grant SELECT on sequence "public"."pedidos_numero_seq" to "anon";

-- grants
grant UPDATE on sequence "public"."pedidos_numero_seq" to "anon";

-- grants
grant USAGE on sequence "public"."pedidos_numero_seq" to "anon";

-- grants
grant SELECT on sequence "public"."pedidos_numero_seq" to "authenticated";

-- grants
grant UPDATE on sequence "public"."pedidos_numero_seq" to "authenticated";

-- grants
grant USAGE on sequence "public"."pedidos_numero_seq" to "authenticated";

-- grants
grant SELECT on sequence "public"."pedidos_numero_seq" to "service_role";

-- grants
grant UPDATE on sequence "public"."pedidos_numero_seq" to "service_role";

-- grants
grant USAGE on sequence "public"."pedidos_numero_seq" to "service_role";

-- grants
revoke all on sequence "public"."remessas_estoque_codigo_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "public"."remessas_estoque_codigo_seq" to "postgres";

-- grants
grant UPDATE on sequence "public"."remessas_estoque_codigo_seq" to "postgres";

-- grants
grant USAGE on sequence "public"."remessas_estoque_codigo_seq" to "postgres";

-- grants
grant SELECT on sequence "public"."remessas_estoque_codigo_seq" to "anon";

-- grants
grant UPDATE on sequence "public"."remessas_estoque_codigo_seq" to "anon";

-- grants
grant USAGE on sequence "public"."remessas_estoque_codigo_seq" to "anon";

-- grants
grant SELECT on sequence "public"."remessas_estoque_codigo_seq" to "authenticated";

-- grants
grant UPDATE on sequence "public"."remessas_estoque_codigo_seq" to "authenticated";

-- grants
grant USAGE on sequence "public"."remessas_estoque_codigo_seq" to "authenticated";

-- grants
grant SELECT on sequence "public"."remessas_estoque_codigo_seq" to "service_role";

-- grants
grant UPDATE on sequence "public"."remessas_estoque_codigo_seq" to "service_role";

-- grants
grant USAGE on sequence "public"."remessas_estoque_codigo_seq" to "service_role";

-- grants
revoke all on sequence "public"."venda_numero_seq" from PUBLIC, anon, authenticated, service_role;

-- grants
grant SELECT on sequence "public"."venda_numero_seq" to "postgres";

-- grants
grant UPDATE on sequence "public"."venda_numero_seq" to "postgres";

-- grants
grant USAGE on sequence "public"."venda_numero_seq" to "postgres";

-- grants
grant SELECT on sequence "public"."venda_numero_seq" to "anon";

-- grants
grant UPDATE on sequence "public"."venda_numero_seq" to "anon";

-- grants
grant USAGE on sequence "public"."venda_numero_seq" to "anon";

-- grants
grant SELECT on sequence "public"."venda_numero_seq" to "authenticated";

-- grants
grant UPDATE on sequence "public"."venda_numero_seq" to "authenticated";

-- grants
grant USAGE on sequence "public"."venda_numero_seq" to "authenticated";

-- grants
grant SELECT on sequence "public"."venda_numero_seq" to "service_role";

-- grants
grant UPDATE on sequence "public"."venda_numero_seq" to "service_role";

-- grants
grant USAGE on sequence "public"."venda_numero_seq" to "service_role";

-- grants
revoke all on function "halloween_private"."activation_window"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."activation_window"() to "postgres";

-- grants
revoke all on function "halloween_private"."admin_state"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."admin_state"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."admin_state"(p_campaign text) to "authenticated";

-- grants
revoke all on function "halloween_private"."admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."admin_state_v2"(p_campaign text, p_search text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."admin_state_v2"(p_campaign text, p_search text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."admin_state_v2"(p_campaign text, p_search text, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."capture_os"(p_campaign text, p_os uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."capture_os"(p_campaign text, p_os uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."capture_sale"(p_campaign text, p_sale jsonb, p_customer text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."capture_sale"(p_campaign text, p_sale jsonb, p_customer text) to "postgres";

-- grants
revoke all on function "halloween_private"."catalog"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."catalog"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."catalog"(p_campaign text) to "anon";

-- grants
grant EXECUTE on function "halloween_private"."catalog"(p_campaign text) to "authenticated";

-- grants
revoke all on function "halloween_private"."catalog_for"(p_campaign text, p_excluded integer[]) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."catalog_for"(p_campaign text, p_excluded integer[]) to "postgres";

-- grants
revoke all on function "halloween_private"."catalog_for"(p_campaign text, p_excluded integer[], p_store uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."catalog_for"(p_campaign text, p_excluded integer[], p_store uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."client_tickets"(p_campaign text, p_customer text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."client_tickets"(p_campaign text, p_customer text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."client_tickets"(p_campaign text, p_customer text, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) to "authenticated";

-- grants
revoke all on function "halloween_private"."confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "authenticated";

-- grants
revoke all on function "halloween_private"."coupon_json"(p_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."coupon_json"(p_id uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."draw_pool"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."draw_pool"(p_campaign text) to "postgres";

-- grants
revoke all on function "halloween_private"."draw_pool_for"(p_campaign text, p_excluded integer[]) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."draw_pool_for"(p_campaign text, p_excluded integer[]) to "postgres";

-- grants
revoke all on function "halloween_private"."draw_pool_for"(p_campaign text, p_excluded integer[], p_store uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."draw_pool_for"(p_campaign text, p_excluded integer[], p_store uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "authenticated";

-- grants
revoke all on function "halloween_private"."issue_proof"(p_campaign text, p_kind text, p_id uuid, p_paid timestamp with time zone, p_receipts text[], p_origin text, p_actor uuid, p_reason text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."issue_proof"(p_campaign text, p_kind text, p_id uuid, p_paid timestamp with time zone, p_receipts text[], p_origin text, p_actor uuid, p_reason text) to "postgres";

-- grants
revoke all on function "halloween_private"."link_store_prize"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."link_store_prize"() to "postgres";

-- grants
revoke all on function "halloween_private"."lock_financial"(p_kind text, p_source uuid, p_refs text[]) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."lock_financial"(p_kind text, p_source uuid, p_refs text[]) to "postgres";

-- grants
revoke all on function "halloween_private"."lookup"(p_code text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."lookup"(p_code text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."lookup"(p_code text) to "authenticated";

-- grants
revoke all on function "halloween_private"."margin_effective"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."margin_effective"(p_campaign text) to "postgres";

-- grants
revoke all on function "halloween_private"."margin_reconcile"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."margin_reconcile"(p_campaign text) to "postgres";

-- grants
revoke all on function "halloween_private"."margin_window"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."margin_window"(p_campaign text) to "postgres";

-- grants
revoke all on function "halloween_private"."paid_os"(p_os uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."paid_os"(p_os uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."payment_pending"(p_campaign text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."payment_pending"(p_campaign text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."payment_pending"(p_campaign text, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) to "authenticated";

-- grants
revoke all on function "halloween_private"."payment_timestamp"(p_value text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."payment_timestamp"(p_value text) to "postgres";

-- grants
revoke all on function "halloween_private"."proof_evidence"(p_kind text, p_source uuid, p_refs text[]) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."proof_evidence"(p_kind text, p_source uuid, p_refs text[]) to "postgres";

-- grants
revoke all on function "halloween_private"."proof_valid"(p_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."proof_valid"(p_id uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."proof_window"(p_campaign text, p_created timestamp with time zone, p_paid timestamp with time zone, p_now timestamp with time zone) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."proof_window"(p_campaign text, p_created timestamp with time zone, p_paid timestamp with time zone, p_now timestamp with time zone) to "postgres";

-- grants
revoke all on function "halloween_private"."receipt_claimed"(p_campaign text, p_receipt text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."receipt_claimed"(p_campaign text, p_receipt text) to "postgres";

-- grants
revoke all on function "halloween_private"."receipt_day"(p_value timestamp with time zone) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."receipt_day"(p_value timestamp with time zone) to "postgres";

-- grants
revoke all on function "halloween_private"."redeem"(p_code text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."redeem"(p_code text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."redeem"(p_code text) to "authenticated";

-- grants
revoke all on function "halloween_private"."redeem_at"(p_code text, p_loja uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."redeem_at"(p_code text, p_loja uuid) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."redeem_at"(p_code text, p_loja uuid) to "authenticated";

-- grants
revoke all on function "halloween_private"."reissue"(p_code text, p_reason text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."reissue"(p_code text, p_reason text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."reissue"(p_code text, p_reason text) to "authenticated";

-- grants
revoke all on function "halloween_private"."release_expired"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."release_expired"(p_campaign text) to "postgres";

-- grants
revoke all on function "halloween_private"."require_staff"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."require_staff"() to "postgres";

-- grants
revoke all on function "halloween_private"."require_store"(p_store uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."require_store"(p_store uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."reserve_store_prize"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."reserve_store_prize"() to "postgres";

-- grants
revoke all on function "halloween_private"."resolve_ticket"(p_token text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."resolve_ticket"(p_token text) to "postgres";

-- grants
revoke all on function "halloween_private"."return_store_prize"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."return_store_prize"() to "postgres";

-- grants
revoke all on function "halloween_private"."sale_paid"(p_sale uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."sale_paid"(p_sale uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."sale_payment_proof"(p_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."sale_payment_proof"(p_id uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."sale_valid"(p_ticket uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."sale_valid"(p_ticket uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."sale_valid_legacy"(p_ticket uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."sale_valid_legacy"(p_ticket uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."set_coupon_validity"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."set_coupon_validity"() to "postgres";

-- grants
revoke all on function "halloween_private"."source_data"(p_kind text, p_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."source_data"(p_kind text, p_id uuid) to "postgres";

-- grants
revoke all on function "halloween_private"."spin"(p_token text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."spin"(p_token text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."spin"(p_token text) to "anon";

-- grants
grant EXECUTE on function "halloween_private"."spin"(p_token text) to "authenticated";

-- grants
revoke all on function "halloween_private"."surprise_catalog"(p_catalog jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."surprise_catalog"(p_catalog jsonb) to "postgres";

-- grants
revoke all on function "halloween_private"."sync_sales"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."sync_sales"() to "postgres";

-- grants
revoke all on function "halloween_private"."ticket"(p_token text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "halloween_private"."ticket"(p_token text) to "postgres";

-- grants
grant EXECUTE on function "halloween_private"."ticket"(p_token text) to "anon";

-- grants
grant EXECUTE on function "halloween_private"."ticket"(p_token text) to "authenticated";

-- grants
revoke all on function "public"."_audit_teste"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."_audit_teste"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."_audit_teste"() to "postgres";

-- grants
grant EXECUTE on function "public"."_audit_teste"() to "anon";

-- grants
grant EXECUTE on function "public"."_audit_teste"() to "authenticated";

-- grants
grant EXECUTE on function "public"."_audit_teste"() to "service_role";

-- grants
revoke all on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) to "postgres";

-- grants
grant EXECUTE on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) to "anon";

-- grants
grant EXECUTE on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) to "authenticated";

-- grants
grant EXECUTE on function "public"."aplicar_caixa_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_tipo text, p_caixa_sige text, p_loja_id uuid, p_valor numeric, p_motivo text, p_data timestamp with time zone, p_forma text) to "service_role";

-- grants
revoke all on function "public"."aplicar_desconto_fiado"(p_lancamento_id text, p_desconto numeric, p_motivo text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."aplicar_desconto_fiado"(p_lancamento_id text, p_desconto numeric, p_motivo text) to "postgres";

-- grants
grant EXECUTE on function "public"."aplicar_desconto_fiado"(p_lancamento_id text, p_desconto numeric, p_motivo text) to "service_role";

-- grants
revoke all on function "public"."aplicar_movimento_estoque_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_movimentos jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."aplicar_movimento_estoque_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_movimentos jsonb) to "postgres";

-- grants
grant EXECUTE on function "public"."aplicar_movimento_estoque_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_movimentos jsonb) to "authenticated";

-- grants
grant EXECUTE on function "public"."aplicar_movimento_estoque_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_movimentos jsonb) to "service_role";

-- grants
revoke all on function "public"."aplicar_transferencia_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_origem text, p_destino text, p_observacao text, p_itens jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."aplicar_transferencia_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_origem text, p_destino text, p_observacao text, p_itens jsonb) to "postgres";

-- grants
grant EXECUTE on function "public"."aplicar_transferencia_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_origem text, p_destino text, p_observacao text, p_itens jsonb) to "authenticated";

-- grants
grant EXECUTE on function "public"."aplicar_transferencia_sige"(p_evento_id uuid, p_loja text, p_sequencia bigint, p_sige_id text, p_origem text, p_destino text, p_observacao text, p_itens jsonb) to "service_role";

-- grants
revoke all on function "public"."atualizar_cancelamento_venda_pedido_app"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."atualizar_cancelamento_venda_pedido_app"() to "postgres";

-- grants
grant EXECUTE on function "public"."atualizar_cancelamento_venda_pedido_app"() to "service_role";

-- grants
revoke all on function "public"."atualizar_devolucao_pedido_app"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."atualizar_devolucao_pedido_app"() to "postgres";

-- grants
grant EXECUTE on function "public"."atualizar_devolucao_pedido_app"() to "service_role";

-- grants
revoke all on function "public"."atualizar_pagamento_pedido_app"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."atualizar_pagamento_pedido_app"() to "postgres";

-- grants
grant EXECUTE on function "public"."atualizar_pagamento_pedido_app"() to "service_role";

-- grants
revoke all on function "public"."bater_ponto"(p_usuario_id uuid, p_tipo text, p_loja_id text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."bater_ponto"(p_usuario_id uuid, p_tipo text, p_loja_id text) to "postgres";

-- grants
grant EXECUTE on function "public"."bater_ponto"(p_usuario_id uuid, p_tipo text, p_loja_id text) to "authenticated";

-- grants
grant EXECUTE on function "public"."bater_ponto"(p_usuario_id uuid, p_tipo text, p_loja_id text) to "service_role";

-- grants
revoke all on function "public"."cancelar_pedido_app"(p_pedido uuid, p_operador uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."cancelar_pedido_app"(p_pedido uuid, p_operador uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."cancelar_pedido_app"(p_pedido uuid, p_operador uuid) to "service_role";

-- grants
revoke all on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) to "postgres";

-- grants
grant EXECUTE on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) to "anon";

-- grants
grant EXECUTE on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) to "authenticated";

-- grants
grant EXECUTE on function "public"."cancelar_remessa_estoque"(p_remessa_id uuid, p_motivo text, p_user text) to "service_role";

-- grants
revoke all on function "public"."cancelar_venda"(p_venda_id uuid, p_motivo text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."cancelar_venda"(p_venda_id uuid, p_motivo text) to "postgres";

-- grants
grant EXECUTE on function "public"."cancelar_venda"(p_venda_id uuid, p_motivo text) to "authenticated";

-- grants
grant EXECUTE on function "public"."cancelar_venda"(p_venda_id uuid, p_motivo text) to "service_role";

-- grants
revoke all on function "public"."confirmar_pedido_app_unidade"(p_pedido uuid, p_unidade text, p_operador uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."confirmar_pedido_app_unidade"(p_pedido uuid, p_unidade text, p_operador uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."confirmar_pedido_app_unidade"(p_pedido uuid, p_unidade text, p_operador uuid) to "service_role";

-- grants
revoke all on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) to "postgres";

-- grants
grant EXECUTE on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) to "anon";

-- grants
grant EXECUTE on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) to "authenticated";

-- grants
grant EXECUTE on function "public"."confirmar_recebimento_remessa"(p_remessa_id uuid, p_user text) to "service_role";

-- grants
revoke all on function "public"."consulta_ia"(p_query text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."consulta_ia"(p_query text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."consulta_ia"(p_query text) to "postgres";

-- grants
grant EXECUTE on function "public"."consulta_ia"(p_query text) to "anon";

-- grants
grant EXECUTE on function "public"."consulta_ia"(p_query text) to "authenticated";

-- grants
grant EXECUTE on function "public"."consulta_ia"(p_query text) to "service_role";

-- grants
revoke all on function "public"."conta_pix_da_venda"(p_venda uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."conta_pix_da_venda"(p_venda uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."conta_pix_da_venda"(p_venda uuid) to "service_role";

-- grants
revoke all on function "public"."criar_pedido_app"(p_itens jsonb, p_chave text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."criar_pedido_app"(p_itens jsonb, p_chave text) to "postgres";

-- grants
grant EXECUTE on function "public"."criar_pedido_app"(p_itens jsonb, p_chave text) to "authenticated";

-- grants
grant EXECUTE on function "public"."criar_pedido_app"(p_itens jsonb, p_chave text) to "service_role";

-- grants
revoke all on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) to "postgres";

-- grants
grant EXECUTE on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) to "anon";

-- grants
grant EXECUTE on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) to "authenticated";

-- grants
grant EXECUTE on function "public"."criar_remessa_estoque"(p_origem text, p_destino text, p_itens jsonb, p_obs text, p_user text) to "service_role";

-- grants
revoke all on function "public"."dashboard_faturamento_metas"(p_de date, p_ate date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."dashboard_faturamento_metas"(p_de date, p_ate date) to "postgres";

-- grants
grant EXECUTE on function "public"."dashboard_faturamento_metas"(p_de date, p_ate date) to "authenticated";

-- grants
grant EXECUTE on function "public"."dashboard_faturamento_metas"(p_de date, p_ate date) to "service_role";

-- grants
revoke all on function "public"."dashboard_resumo"(p_de date, p_ate date, p_loja text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de date, p_ate date, p_loja text) to "postgres";

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de date, p_ate date, p_loja text) to "authenticated";

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de date, p_ate date, p_loja text) to "service_role";

-- grants
revoke all on function "public"."dashboard_resumo"(p_de30 date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de30 date) to "postgres";

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de30 date) to "authenticated";

-- grants
grant EXECUTE on function "public"."dashboard_resumo"(p_de30 date) to "service_role";

-- grants
revoke all on function "public"."definir_loja_lancamento"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."definir_loja_lancamento"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."definir_loja_lancamento"() to "postgres";

-- grants
grant EXECUTE on function "public"."definir_loja_lancamento"() to "anon";

-- grants
grant EXECUTE on function "public"."definir_loja_lancamento"() to "authenticated";

-- grants
grant EXECUTE on function "public"."definir_loja_lancamento"() to "service_role";

-- grants
revoke all on function "public"."encaminhar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."encaminhar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."encaminhar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid) to "service_role";

-- grants
revoke all on function "public"."enfileirar_pedido_app_credito"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."enfileirar_pedido_app_credito"() to "postgres";

-- grants
grant EXECUTE on function "public"."enfileirar_pedido_app_credito"() to "service_role";

-- grants
revoke all on function "public"."estornar_credito_cliente"(p_credito_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."estornar_credito_cliente"(p_credito_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."estornar_credito_cliente"(p_credito_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."estornar_credito_cliente"(p_credito_id uuid) to "service_role";

-- grants
revoke all on function "public"."estornar_nota_entrada"(p_nota_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."estornar_nota_entrada"(p_nota_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."estornar_nota_entrada"(p_nota_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."estornar_nota_entrada"(p_nota_id uuid) to "service_role";

-- grants
revoke all on function "public"."finalizar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid, p_deposito text, p_pagamentos jsonb, p_series jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."finalizar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid, p_deposito text, p_pagamentos jsonb, p_series jsonb) to "postgres";

-- grants
grant EXECUTE on function "public"."finalizar_pedido_app_pdv"(p_pedido uuid, p_unidade text, p_operador uuid, p_deposito text, p_pagamentos jsonb, p_series jsonb) to "service_role";

-- grants
revoke all on function "public"."finalizar_venda"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."finalizar_venda"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) to "postgres";

-- grants
grant EXECUTE on function "public"."finalizar_venda"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) to "authenticated";

-- grants
grant EXECUTE on function "public"."finalizar_venda"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) to "service_role";

-- grants
revoke all on function "public"."finalizar_venda_com_desconto_item"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."finalizar_venda_com_desconto_item"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) to "postgres";

-- grants
grant EXECUTE on function "public"."finalizar_venda_com_desconto_item"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text) to "service_role";

-- grants
revoke all on function "public"."finalizar_venda_halloween"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text, p_operation uuid, p_tabela_id text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."finalizar_venda_halloween"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text, p_operation uuid, p_tabela_id text) to "postgres";

-- grants
grant EXECUTE on function "public"."finalizar_venda_halloween"(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text, p_series jsonb, p_vendedor_id uuid, p_vendedor_nome text, p_credito_valor numeric, p_tipo_entrega text, p_endereco_entrega text, p_operation uuid, p_tabela_id text) to "service_role";

-- grants
revoke all on function "public"."halloween_admin_state"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_admin_state"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_admin_state"(p_campaign text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_admin_state"(p_campaign text) to "authenticated";

-- grants
revoke all on function "public"."halloween_admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_admin_state_for_store"(p_campaign text, p_store uuid, p_search text, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_admin_state_v2"(p_campaign text, p_search text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_admin_state_v2"(p_campaign text, p_search text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_admin_state_v2"(p_campaign text, p_search text, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_admin_state_v2"(p_campaign text, p_search text, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_catalog"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_catalog"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_catalog"(p_campaign text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_catalog"(p_campaign text) to "anon";

-- grants
grant EXECUTE on function "public"."halloween_catalog"(p_campaign text) to "authenticated";

-- grants
revoke all on function "public"."halloween_client_tickets"(p_campaign text, p_customer text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_client_tickets"(p_campaign text, p_customer text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_client_tickets"(p_campaign text, p_customer text, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_client_tickets"(p_campaign text, p_customer text, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_client_tickets_for_store"(p_campaign text, p_store uuid, p_customer text, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_configure"(p_campaign text, p_products jsonb, p_confirm boolean, p_active boolean) to "authenticated";

-- grants
revoke all on function "public"."halloween_configure_store_prize"(p_campaign text, p_store uuid, p_slot integer, p_quantity integer, p_confirm boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_configure_store_prize"(p_campaign text, p_store uuid, p_slot integer, p_quantity integer, p_confirm boolean) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_configure_store_prize"(p_campaign text, p_store uuid, p_slot integer, p_quantity integer, p_confirm boolean) to "authenticated";

-- grants
grant EXECUTE on function "public"."halloween_configure_store_prize"(p_campaign text, p_store uuid, p_slot integer, p_quantity integer, p_confirm boolean) to "service_role";

-- grants
revoke all on function "public"."halloween_confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_confirm_sale_time"(p_campaign text, p_sale uuid, p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "authenticated";

-- grants
revoke all on function "public"."halloween_issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_issue"(p_campaign text, p_ref text, p_customer text, p_amount integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_issue_os_manual"(p_campaign text, p_os uuid, p_receipts text[], p_paid_at timestamp with time zone, p_reason text, p_confirm boolean) to "authenticated";

-- grants
revoke all on function "public"."halloween_lookup"(p_code text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_lookup"(p_code text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_lookup"(p_code text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_lookup"(p_code text) to "authenticated";

-- grants
revoke all on function "public"."halloween_margin_correct_cost"(p_campaign text, p_item uuid, p_cost numeric, p_reason text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_margin_correct_cost"(p_campaign text, p_item uuid, p_cost numeric, p_reason text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_margin_correct_cost"(p_campaign text, p_item uuid, p_cost numeric, p_reason text) to "authenticated";

-- grants
grant EXECUTE on function "public"."halloween_margin_correct_cost"(p_campaign text, p_item uuid, p_cost numeric, p_reason text) to "service_role";

-- grants
revoke all on function "public"."halloween_margin_reconcile"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_margin_reconcile"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_margin_reconcile"(p_campaign text) to "service_role";

-- grants
revoke all on function "public"."halloween_margin_replay"(p_operation uuid, p_actor uuid, p_request jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_margin_replay"(p_operation uuid, p_actor uuid, p_request jsonb) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_margin_replay"(p_operation uuid, p_actor uuid, p_request jsonb) to "service_role";

-- grants
revoke all on function "public"."halloween_margin_state"(p_campaign text, p_store uuid, p_from date, p_to date, p_product text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_margin_state"(p_campaign text, p_store uuid, p_from date, p_to date, p_product text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_margin_state"(p_campaign text, p_store uuid, p_from date, p_to date, p_product text) to "authenticated";

-- grants
grant EXECUTE on function "public"."halloween_margin_state"(p_campaign text, p_store uuid, p_from date, p_to date, p_product text) to "service_role";

-- grants
revoke all on function "public"."halloween_payment_pending"(p_campaign text, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_payment_pending"(p_campaign text, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_payment_pending"(p_campaign text, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_payment_pending"(p_campaign text, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_payment_review"(p_campaign text, p_kind text, p_number integer, p_offset integer) to "authenticated";

-- grants
revoke all on function "public"."halloween_pdv_rules"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_pdv_rules"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_pdv_rules"(p_campaign text) to "service_role";

-- grants
revoke all on function "public"."halloween_redeem"(p_code text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_redeem"(p_code text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_redeem"(p_code text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_redeem"(p_code text) to "authenticated";

-- grants
revoke all on function "public"."halloween_redeem_at"(p_code text, p_loja uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_redeem_at"(p_code text, p_loja uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_redeem_at"(p_code text, p_loja uuid) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_redeem_at"(p_code text, p_loja uuid) to "authenticated";

-- grants
revoke all on function "public"."halloween_reissue"(p_code text, p_reason text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_reissue"(p_code text, p_reason text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_reissue"(p_code text, p_reason text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_reissue"(p_code text, p_reason text) to "authenticated";

-- grants
revoke all on function "public"."halloween_spin"(p_token text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_spin"(p_token text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_spin"(p_token text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_spin"(p_token text) to "anon";

-- grants
grant EXECUTE on function "public"."halloween_spin"(p_token text) to "authenticated";

-- grants
revoke all on function "public"."halloween_store_prizes_state"(p_campaign text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_store_prizes_state"(p_campaign text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_store_prizes_state"(p_campaign text) to "authenticated";

-- grants
grant EXECUTE on function "public"."halloween_store_prizes_state"(p_campaign text) to "service_role";

-- grants
revoke all on function "public"."halloween_ticket"(p_token text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."halloween_ticket"(p_token text) to "postgres";

-- grants
grant EXECUTE on function "public"."halloween_ticket"(p_token text) to "service_role";

-- grants
grant EXECUTE on function "public"."halloween_ticket"(p_token text) to "anon";

-- grants
grant EXECUTE on function "public"."halloween_ticket"(p_token text) to "authenticated";

-- grants
revoke all on function "public"."limpar_obs_cobranca"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."limpar_obs_cobranca"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."limpar_obs_cobranca"() to "postgres";

-- grants
grant EXECUTE on function "public"."limpar_obs_cobranca"() to "anon";

-- grants
grant EXECUTE on function "public"."limpar_obs_cobranca"() to "authenticated";

-- grants
grant EXECUTE on function "public"."limpar_obs_cobranca"() to "service_role";

-- grants
revoke all on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) to PUBLIC;

-- grants
grant EXECUTE on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) to "postgres";

-- grants
grant EXECUTE on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) to "anon";

-- grants
grant EXECUTE on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) to "authenticated";

-- grants
grant EXECUTE on function "public"."marcar_lembrete_feito"(p_lembrete_id uuid, p_perfil_id uuid, p_data date, p_comprovante_url text) to "service_role";

-- grants
revoke all on function "public"."movimentar_estoque"(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb, p_observacao text, p_user text, p_created_at timestamp with time zone) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."movimentar_estoque"(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb, p_observacao text, p_user text, p_created_at timestamp with time zone) to "postgres";

-- grants
grant EXECUTE on function "public"."movimentar_estoque"(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb, p_observacao text, p_user text, p_created_at timestamp with time zone) to "authenticated";

-- grants
grant EXECUTE on function "public"."movimentar_estoque"(p_produto_id text, p_deposito_id text, p_operacao text, p_quantidade numeric, p_series jsonb, p_observacao text, p_user text, p_created_at timestamp with time zone) to "service_role";

-- grants
revoke all on function "public"."pedido_app_venda_revertida"(p_venda uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."pedido_app_venda_revertida"(p_venda uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."pedido_app_venda_revertida"(p_venda uuid) to "service_role";

-- grants
revoke all on function "public"."pessoas_set_nome_norm"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."pessoas_set_nome_norm"() to "postgres";

-- grants
grant EXECUTE on function "public"."pessoas_set_nome_norm"() to "authenticated";

-- grants
grant EXECUTE on function "public"."pessoas_set_nome_norm"() to "service_role";

-- grants
revoke all on function "public"."processar_pedidos_app_credito"(p_limite integer) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."processar_pedidos_app_credito"(p_limite integer) to "postgres";

-- grants
grant EXECUTE on function "public"."processar_pedidos_app_credito"(p_limite integer) to "service_role";

-- grants
revoke all on function "public"."produtos_set_busca_norm"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."produtos_set_busca_norm"() to "postgres";

-- grants
grant EXECUTE on function "public"."produtos_set_busca_norm"() to "authenticated";

-- grants
grant EXECUTE on function "public"."produtos_set_busca_norm"() to "service_role";

-- grants
revoke all on function "public"."receber_fiado_reais"(p_lancamento_id text, p_valor numeric, p_forma text, p_historico jsonb, p_conta_id uuid, p_loja_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."receber_fiado_reais"(p_lancamento_id text, p_valor numeric, p_forma text, p_historico jsonb, p_conta_id uuid, p_loja_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."receber_fiado_reais"(p_lancamento_id text, p_valor numeric, p_forma text, p_historico jsonb, p_conta_id uuid, p_loja_id uuid) to "service_role";

-- grants
revoke all on function "public"."receber_fiados_vale"(p_pessoa_id text, p_alocacoes jsonb, p_operacao_id uuid, p_loja_id uuid, p_usuario text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."receber_fiados_vale"(p_pessoa_id text, p_alocacoes jsonb, p_operacao_id uuid, p_loja_id uuid, p_usuario text) to "postgres";

-- grants
grant EXECUTE on function "public"."receber_fiados_vale"(p_pessoa_id text, p_alocacoes jsonb, p_operacao_id uuid, p_loja_id uuid, p_usuario text) to "service_role";

-- grants
revoke all on function "public"."receber_lancamentos_lote"(p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid, p_operacao_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."receber_lancamentos_lote"(p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid, p_operacao_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."receber_lancamentos_lote"(p_alocacoes jsonb, p_forma text, p_conta_id uuid, p_loja_id uuid, p_operacao_id uuid) to "service_role";

-- grants
revoke all on function "public"."receber_nota_entrada"(p_nota_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."receber_nota_entrada"(p_nota_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."receber_nota_entrada"(p_nota_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."receber_nota_entrada"(p_nota_id uuid) to "service_role";

-- grants
revoke all on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) to PUBLIC;

-- grants
grant EXECUTE on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "anon";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_lancamento"(p_lancamento_id text, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "service_role";

-- grants
revoke all on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) to PUBLIC;

-- grants
grant EXECUTE on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "anon";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."reclassificar_forma_venda"(p_pagamento_id uuid, p_forma_nova text, p_motivo text, p_usuario_id uuid) to "service_role";

-- grants
revoke all on function "public"."reconferir_reversao_pedido_app"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."reconferir_reversao_pedido_app"() to "postgres";

-- grants
grant EXECUTE on function "public"."reconferir_reversao_pedido_app"() to "service_role";

-- grants
revoke all on function "public"."registrar_devolucao"(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb, p_reembolsos jsonb) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."registrar_devolucao"(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb, p_reembolsos jsonb) to "postgres";

-- grants
grant EXECUTE on function "public"."registrar_devolucao"(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb, p_reembolsos jsonb) to "authenticated";

-- grants
grant EXECUTE on function "public"."registrar_devolucao"(p_venda_id uuid, p_deposito_id text, p_pessoa_id text, p_pessoa_nome text, p_vendedor_nome text, p_motivo text, p_tipo_credito text, p_itens jsonb, p_lancamento_pendente boolean, p_series jsonb, p_reembolsos jsonb) to "service_role";

-- grants
revoke all on function "public"."registrar_operacao_pedido_app"(p_pedido uuid, p_unidade text, p_operador uuid, p_versao integer, p_tipo text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."registrar_operacao_pedido_app"(p_pedido uuid, p_unidade text, p_operador uuid, p_versao integer, p_tipo text) to "postgres";

-- grants
grant EXECUTE on function "public"."registrar_operacao_pedido_app"(p_pedido uuid, p_unidade text, p_operador uuid, p_versao integer, p_tipo text) to "service_role";

-- grants
revoke all on function "public"."relatorio_lucro_mensal"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."relatorio_lucro_mensal"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."relatorio_lucro_mensal"() to "postgres";

-- grants
grant EXECUTE on function "public"."relatorio_lucro_mensal"() to "anon";

-- grants
grant EXECUTE on function "public"."relatorio_lucro_mensal"() to "authenticated";

-- grants
grant EXECUTE on function "public"."relatorio_lucro_mensal"() to "service_role";

-- grants
revoke all on function "public"."reservar_chat"(p_chave text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."reservar_chat"(p_chave text) to "postgres";

-- grants
grant EXECUTE on function "public"."reservar_chat"(p_chave text) to "service_role";

-- grants
revoke all on function "public"."resumo_caixa"(p_data date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_caixa"(p_data date) to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_caixa"(p_data date) to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_caixa"(p_data date) to "anon";

-- grants
grant EXECUTE on function "public"."resumo_caixa"(p_data date) to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_caixa"(p_data date) to "service_role";

-- grants
revoke all on function "public"."resumo_clientes"(p_de date, p_ate date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_clientes"(p_de date, p_ate date) to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_clientes"(p_de date, p_ate date) to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_clientes"(p_de date, p_ate date) to "anon";

-- grants
grant EXECUTE on function "public"."resumo_clientes"(p_de date, p_ate date) to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_clientes"(p_de date, p_ate date) to "service_role";

-- grants
revoke all on function "public"."resumo_estoque"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_estoque"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_estoque"() to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_estoque"() to "anon";

-- grants
grant EXECUTE on function "public"."resumo_estoque"() to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_estoque"() to "service_role";

-- grants
revoke all on function "public"."resumo_fiados"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_fiados"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_fiados"() to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_fiados"() to "anon";

-- grants
grant EXECUTE on function "public"."resumo_fiados"() to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_fiados"() to "service_role";

-- grants
revoke all on function "public"."resumo_formas"(p_de date, p_ate date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_formas"(p_de date, p_ate date) to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_formas"(p_de date, p_ate date) to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_formas"(p_de date, p_ate date) to "anon";

-- grants
grant EXECUTE on function "public"."resumo_formas"(p_de date, p_ate date) to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_formas"(p_de date, p_ate date) to "service_role";

-- grants
revoke all on function "public"."resumo_vendas"(p_de date, p_ate date) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."resumo_vendas"(p_de date, p_ate date) to PUBLIC;

-- grants
grant EXECUTE on function "public"."resumo_vendas"(p_de date, p_ate date) to "postgres";

-- grants
grant EXECUTE on function "public"."resumo_vendas"(p_de date, p_ate date) to "anon";

-- grants
grant EXECUTE on function "public"."resumo_vendas"(p_de date, p_ate date) to "authenticated";

-- grants
grant EXECUTE on function "public"."resumo_vendas"(p_de date, p_ate date) to "service_role";

-- grants
revoke all on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) to PUBLIC;

-- grants
grant EXECUTE on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) to "anon";

-- grants
grant EXECUTE on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) to "authenticated";

-- grants
grant EXECUTE on function "public"."reverter_reclassificacao_forma"(p_reclassificacao_id uuid, p_usuario_id uuid) to "service_role";

-- grants
revoke all on function "public"."sincronizar_estado_pedido_app"(p_pedido uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."sincronizar_estado_pedido_app"(p_pedido uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."sincronizar_estado_pedido_app"(p_pedido uuid) to "service_role";

-- grants
revoke all on function "public"."sincronizar_item_tabela_custo"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."sincronizar_item_tabela_custo"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."sincronizar_item_tabela_custo"() to "postgres";

-- grants
grant EXECUTE on function "public"."sincronizar_item_tabela_custo"() to "anon";

-- grants
grant EXECUTE on function "public"."sincronizar_item_tabela_custo"() to "authenticated";

-- grants
grant EXECUTE on function "public"."sincronizar_item_tabela_custo"() to "service_role";

-- grants
revoke all on function "public"."transferir_estoque"(p_produto_id text, p_origem text, p_destino text, p_quantidade numeric, p_series jsonb, p_obs text, p_user text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."transferir_estoque"(p_produto_id text, p_origem text, p_destino text, p_quantidade numeric, p_series jsonb, p_obs text, p_user text) to "postgres";

-- grants
grant EXECUTE on function "public"."transferir_estoque"(p_produto_id text, p_origem text, p_destino text, p_quantidade numeric, p_series jsonb, p_obs text, p_user text) to "authenticated";

-- grants
grant EXECUTE on function "public"."transferir_estoque"(p_produto_id text, p_origem text, p_destino text, p_quantidade numeric, p_series jsonb, p_obs text, p_user text) to "service_role";

-- grants
revoke all on function "public"."usar_credito_cliente"(p_pessoa_id text, p_valor numeric, p_descricao text, p_loja_id uuid) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."usar_credito_cliente"(p_pessoa_id text, p_valor numeric, p_descricao text, p_loja_id uuid) to "postgres";

-- grants
grant EXECUTE on function "public"."usar_credito_cliente"(p_pessoa_id text, p_valor numeric, p_descricao text, p_loja_id uuid) to "service_role";

-- grants
revoke all on function "public"."usuario_e_funcionario"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."usuario_e_funcionario"() to "postgres";

-- grants
grant EXECUTE on function "public"."usuario_e_funcionario"() to "anon";

-- grants
grant EXECUTE on function "public"."usuario_e_funcionario"() to "authenticated";

-- grants
grant EXECUTE on function "public"."usuario_e_funcionario"() to "service_role";

-- grants
revoke all on function "public"."usuario_interno"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."usuario_interno"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."usuario_interno"() to "postgres";

-- grants
grant EXECUTE on function "public"."usuario_interno"() to "anon";

-- grants
grant EXECUTE on function "public"."usuario_interno"() to "authenticated";

-- grants
grant EXECUTE on function "public"."usuario_interno"() to "service_role";

-- grants
revoke all on function "public"."vale_usado_mes_anterior"() from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."vale_usado_mes_anterior"() to PUBLIC;

-- grants
grant EXECUTE on function "public"."vale_usado_mes_anterior"() to "postgres";

-- grants
grant EXECUTE on function "public"."vale_usado_mes_anterior"() to "anon";

-- grants
grant EXECUTE on function "public"."vale_usado_mes_anterior"() to "authenticated";

-- grants
grant EXECUTE on function "public"."vale_usado_mes_anterior"() to "service_role";

-- grants
revoke all on function "public"."validar_operador_pedido_app"(p_operador uuid, p_unidade text) from PUBLIC, anon, authenticated, service_role;

-- grants
grant EXECUTE on function "public"."validar_operador_pedido_app"(p_operador uuid, p_unidade text) to "postgres";

-- default_privileges
alter default privileges for role postgres in schema "public" revoke all on sequences from PUBLIC, anon, authenticated, service_role;

-- default_privileges
alter default privileges for role postgres in schema "public" grant SELECT, UPDATE, USAGE on sequences to "postgres";

-- default_privileges
alter default privileges for role postgres in schema "public" grant SELECT, UPDATE, USAGE on sequences to "anon";

-- default_privileges
alter default privileges for role postgres in schema "public" grant SELECT, UPDATE, USAGE on sequences to "authenticated";

-- default_privileges
alter default privileges for role postgres in schema "public" grant SELECT, UPDATE, USAGE on sequences to "service_role";

-- default_privileges
alter default privileges for role postgres in schema "public" revoke all on functions from PUBLIC, anon, authenticated, service_role;

-- default_privileges
alter default privileges for role postgres in schema "public" grant EXECUTE on functions to "postgres";

-- default_privileges
alter default privileges for role postgres in schema "public" grant EXECUTE on functions to "anon";

-- default_privileges
alter default privileges for role postgres in schema "public" grant EXECUTE on functions to "authenticated";

-- default_privileges
alter default privileges for role postgres in schema "public" grant EXECUTE on functions to "service_role";

-- default_privileges
alter default privileges for role postgres in schema "public" revoke all on tables from PUBLIC, anon, authenticated, service_role;

-- default_privileges
alter default privileges for role postgres in schema "public" grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables to "postgres";

-- default_privileges
alter default privileges for role postgres in schema "public" grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables to "anon";

-- default_privileges
alter default privileges for role postgres in schema "public" grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables to "authenticated";

-- default_privileges
alter default privileges for role postgres in schema "public" grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables to "service_role";
