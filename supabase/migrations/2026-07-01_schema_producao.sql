-- ============================================================
-- TecnoCell — DUMP DO SCHEMA REAL DE PRODUÇÃO (2026-07-01)
-- Extraído via pg direto do banco (sem Docker). Reconstrução de DDL:
-- tabelas (colunas/tipos/PK/FK/default) + funções/RPCs completas.
-- Complementa supabase/schema.sql (que não versionava as tabelas centrais).
-- ============================================================

create table if not exists caixas (
  id uuid default uuid_generate_v4() not null,
  status text default 'aberto'::text,
  valor_abertura numeric(12,2) default 0,
  valor_fechamento numeric(12,2),
  obs_abertura text,
  obs_fechamento text,
  usuario_id uuid,
  aberto_em timestamptz default now(),
  fechado_em timestamptz,
  primary key (id)
);

create table if not exists categorias (
  hierarquia text not null,
  nome text not null,
  descricao text,
  id uuid default uuid_generate_v4(),
  primary key (hierarquia)
);

create table if not exists chat_mensagens (
  id uuid default uuid_generate_v4() not null,
  sessao_id uuid,
  role text,
  content text not null,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (sessao_id) references chat_sessoes(id)
);

create table if not exists chat_sessoes (
  id uuid default uuid_generate_v4() not null,
  tipo text default 'cliente'::text,
  usuario_id uuid,
  created_at timestamptz default now(),
  primary key (id)
);

create table if not exists configuracoes (
  chave text not null,
  valor jsonb default '{}'::jsonb,
  primary key (chave)
);

create table if not exists consignados (
  id text default (gen_random_uuid())::text not null,
  pessoa_id text,
  pessoa_nome text,
  deposito_id text,
  observacoes text,
  status text default 'aberto'::text not null,
  total numeric(12,2) default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  primary key (id),
  foreign key (pessoa_id) references pessoas(id),
  foreign key (deposito_id) references depositos(id)
);

create table if not exists creditos_clientes (
  id uuid default gen_random_uuid() not null,
  pessoa_id text,
  pessoa_nome text not null,
  valor numeric(12,2) not null,
  tipo text not null,
  descricao text,
  devolucao_id uuid,
  venda_id text,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (pessoa_id) references pessoas(id),
  foreign key (devolucao_id) references devolucoes(id)
);

create table if not exists depositos (
  id text not null,
  nome text not null,
  empresa_id text,
  empresa text,
  created_at timestamptz default now(),
  descricao text,
  ativo boolean default true,
  responsavel text,
  telefone text,
  email text,
  cep text,
  cidade text,
  uf text,
  primary key (id)
);

create table if not exists devolucoes (
  id uuid default gen_random_uuid() not null,
  venda_id uuid,
  deposito_id uuid,
  pessoa_nome text,
  vendedor_nome text,
  motivo text,
  valor_total numeric(12,2) default 0 not null,
  tipo_credito text default 'sem_reembolso'::text,
  status text default 'concluida'::text,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (venda_id) references vendas(id)
);

create table if not exists empresas (
  id uuid default uuid_generate_v4() not null,
  nome text not null,
  cnpj text,
  telefone text,
  email text,
  endereco text,
  cidade text,
  estado text,
  ativa boolean default true,
  created_at timestamptz default now(),
  primary key (id)
);

create table if not exists estoque (
  id uuid default uuid_generate_v4() not null,
  produto_id text,
  deposito_id text,
  quantidade numeric(12,3) default 0,
  updated_at timestamptz default now(),
  primary key (id),
  foreign key (produto_id) references produtos(id),
  foreign key (deposito_id) references depositos(id)
);

create table if not exists formas_pagamento (
  id text not null,
  nome text not null,
  ativo boolean default true,
  primary key (id)
);

create table if not exists itens_consignado (
  id text default (gen_random_uuid())::text not null,
  consignado_id text not null,
  produto_id text,
  nome text not null,
  codigo text,
  quantidade numeric(12,3) default 1 not null,
  preco_unitario numeric(12,2) default 0 not null,
  devolvido numeric(12,3) default 0 not null,
  created_at timestamptz default now() not null,
  primary key (id),
  foreign key (consignado_id) references consignados(id),
  foreign key (produto_id) references produtos(id)
);

create table if not exists itens_devolucao (
  id uuid default gen_random_uuid() not null,
  devolucao_id uuid,
  produto_id text,
  nome text not null,
  quantidade numeric(12,3) default 1 not null,
  preco_unitario numeric(12,2) default 0 not null,
  total_item numeric(12,2) default 0 not null,
  status_produto text default 'ok'::text,
  primary key (id),
  foreign key (devolucao_id) references devolucoes(id)
);

create table if not exists itens_nota_entrada (
  id uuid default uuid_generate_v4() not null,
  nota_id uuid,
  produto_id text,
  quantidade numeric(12,3) default 1,
  preco_unitario numeric(12,2) default 0,
  total_item numeric(12,2) default 0,
  deposito_id text,
  primary key (id),
  foreign key (nota_id) references notas_entrada(id),
  foreign key (produto_id) references produtos(id),
  foreign key (deposito_id) references depositos(id)
);

create table if not exists itens_os (
  id uuid default uuid_generate_v4() not null,
  os_id uuid,
  tipo text default 'peca'::text,
  produto_id text,
  nome text not null,
  quantidade numeric(12,3) default 1,
  preco_unitario numeric(12,2) default 0,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (os_id) references ordens_servico(id),
  foreign key (produto_id) references produtos(id)
);

create table if not exists itens_pedido (
  id uuid default uuid_generate_v4() not null,
  pedido_id uuid,
  produto_id text,
  quantidade numeric(12,3) default 1,
  preco_unitario numeric(12,2) default 0,
  total_item numeric(12,2) default 0,
  primary key (id),
  foreign key (pedido_id) references pedidos(id),
  foreign key (produto_id) references produtos(id)
);

create table if not exists itens_promocao (
  id uuid default gen_random_uuid() not null,
  promocao_id uuid not null,
  produto_id text not null,
  preco_promocional numeric(10,2),
  quantidade_x integer,
  quantidade_y integer,
  primary key (id),
  foreign key (promocao_id) references promocoes(id)
);

create table if not exists itens_tabela_preco (
  id uuid default uuid_generate_v4() not null,
  tabela_id uuid,
  produto_id text,
  preco numeric(10,2) not null,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (tabela_id) references tabelas_preco(id),
  foreign key (produto_id) references produtos(id)
);

create table if not exists itens_venda (
  id uuid default gen_random_uuid() not null,
  venda_id uuid,
  produto_id text,
  quantidade integer not null,
  preco_unitario numeric(10,2) not null,
  desconto_item numeric(10,2) default 0,
  total_item numeric(10,2) not null,
  primary key (id),
  foreign key (venda_id) references vendas(id),
  foreign key (produto_id) references produtos(id)
);

create table if not exists lancamentos (
  id text default gen_random_uuid() not null,
  codigo integer,
  descricao text,
  valor numeric(12,2),
  data_competencia timestamptz,
  data_vencimento timestamptz,
  data_pagamento timestamptz,
  tipo text,
  status text,
  forma_pagamento text,
  pessoa_nome text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  venda_id uuid,
  valor_pago numeric(12,2) default 0,
  historico_pagamentos jsonb default '[]'::jsonb,
  primary key (id)
);

create table if not exists marcas (
  nome text not null,
  primary key (nome)
);

create table if not exists movimentacoes_estoque (
  id uuid default gen_random_uuid() not null,
  produto_id text not null,
  deposito_id text not null,
  operacao text not null,
  quantidade integer not null,
  qtd_anterior integer default 0 not null,
  qtd_nova integer not null,
  observacao text,
  criado_por text,
  created_at timestamptz default now() not null,
  primary key (id)
);

create table if not exists movimentos_caixa (
  id uuid default gen_random_uuid() not null,
  caixa_id uuid,
  tipo text not null,
  motivo text,
  forma_pagamento text default 'Dinheiro'::text not null,
  valor numeric(10,2) not null,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (caixa_id) references caixas(id)
);

create table if not exists notas_entrada (
  id uuid default uuid_generate_v4() not null,
  numero text,
  fornecedor_id text,
  data_emissao date,
  data_entrada date default CURRENT_DATE,
  valor_total numeric(12,2) default 0,
  status text default 'pendente'::text,
  observacoes text,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (fornecedor_id) references pessoas(id)
);

create table if not exists numeros_serie (
  id uuid default uuid_generate_v4() not null,
  produto_id text,
  deposito_id text,
  serie text not null,
  status text default 'em_estoque'::text,
  custo numeric(12,2),
  venda_id text,
  observacao text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id),
  foreign key (produto_id) references produtos(id),
  foreign key (deposito_id) references depositos(id)
);

create table if not exists ordens_servico (
  id uuid default uuid_generate_v4() not null,
  numero integer default nextval('ordens_servico_numero_seq'::regclass) not null,
  pessoa_id text,
  pessoa_nome text,
  equipamento text not null,
  marca text,
  modelo text,
  serial_imei text,
  defeito_relatado text not null,
  diagnostico text,
  status text default 'aberta'::text not null,
  tecnico_nome text,
  total_pecas numeric(12,2) default 0,
  total_mao_obra numeric(12,2) default 0,
  total numeric(12,2) default 0,
  observacoes text,
  deposito_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (id),
  foreign key (pessoa_id) references pessoas(id),
  foreign key (deposito_id) references depositos(id)
);

create table if not exists pagamentos_venda (
  id uuid default uuid_generate_v4() not null,
  venda_id uuid not null,
  forma_pagamento_id text,
  valor numeric(12,2) not null,
  taxa numeric(12,2) default 0 not null,
  maquina text,
  parcelas integer default 1 not null,
  status text default 'pago'::text not null,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (forma_pagamento_id) references formas_pagamento(id)
);

create table if not exists pedidos (
  id uuid default gen_random_uuid() not null,
  numero integer default nextval('pedidos_numero_seq'::regclass) not null,
  tipo text default 'orcamento'::text,
  status text default 'rascunho'::text,
  pessoa_id text,
  total numeric(12,2) default 0,
  desconto numeric(12,2) default 0,
  observacoes text,
  data_validade date,
  created_at timestamptz default now(),
  deposito_id text,
  tabela_preco_id text,
  forma_pagamento_id text,
  vendedor_id uuid,
  vendedor_nome text,
  origem text default 'balcao'::text,
  frete numeric(10,2) default 0,
  referencia_cliente text,
  termos_condicoes text,
  motivo_cancelamento text,
  primary key (id),
  foreign key (pessoa_id) references pessoas(id)
);

create table if not exists perfis (
  id uuid not null,
  nome text not null,
  cargo text default 'vendedor'::text not null,
  permissoes _text default '{}'::text[],
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_master boolean default false,
  primary key (id)
);

create table if not exists pessoas (
  id text default gen_random_uuid() not null,
  nome text not null,
  tipo text,
  pessoa_fisica boolean default true,
  cpf_cnpj text,
  email text,
  telefone text,
  cidade text,
  estado text,
  ultima_alteracao timestamptz,
  created_at timestamptz default now(),
  endereco text,
  bairro text,
  cep text,
  primary key (id)
);

create table if not exists produtos (
  id text default gen_random_uuid() not null,
  nome text not null,
  descricao text,
  preco numeric(12,2) default 0,
  preco_custo numeric(12,2) default 0,
  categoria text,
  marca text,
  ativo boolean default true,
  visivel_catalogo boolean default true,
  imagem_url text,
  codigo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  ean text,
  fornecedor_id text,
  prateleira text,
  estoque_minimo integer default 0,
  controla_serie boolean default false,
  modelo text,
  unidade text default 'UN'::text,
  primary key (id),
  foreign key (categoria) references categorias(hierarquia),
  foreign key (fornecedor_id) references pessoas(id)
);

create table if not exists promocoes (
  id uuid default uuid_generate_v4() not null,
  nome text not null,
  tipo text default 'percentual'::text,
  valor numeric(12,2) default 0,
  data_inicio date,
  data_fim date,
  ativa boolean default true,
  descricao text,
  created_at timestamptz default now(),
  quantidade_x integer,
  quantidade_y integer,
  primary key (id)
);

create table if not exists sync_log (
  id uuid default uuid_generate_v4() not null,
  endpoint text not null,
  status text,
  registros integer default 0,
  mensagem text,
  synced_at timestamptz default now(),
  primary key (id)
);

create table if not exists tabelas_preco (
  id uuid default uuid_generate_v4() not null,
  nome text not null,
  descricao text,
  ativa boolean default true,
  created_at timestamptz default now(),
  primary key (id)
);

create table if not exists vales_credito (
  id uuid default uuid_generate_v4() not null,
  pessoa_id text,
  valor numeric(12,2) default 0,
  saldo numeric(12,2) default 0,
  motivo text,
  status text default 'ativo'::text,
  created_at timestamptz default now(),
  primary key (id),
  foreign key (pessoa_id) references pessoas(id)
);

create table if not exists vendas (
  id uuid default gen_random_uuid() not null,
  data timestamptz default now(),
  total numeric(10,2) default 0 not null,
  desconto numeric(10,2) default 0,
  forma_pagamento_id text,
  pessoa_id text,
  status text default 'concluida'::text,
  observacoes text,
  created_at timestamptz default now(),
  numero integer,
  vendedor_id uuid,
  vendedor_nome text,
  primary key (id),
  foreign key (forma_pagamento_id) references formas_pagamento(id),
  foreign key (pessoa_id) references pessoas(id)
);

-- ============================================================
-- FUNÇÕES / RPCs (1)
-- ============================================================

CREATE OR REPLACE FUNCTION public.finalizar_venda(p_itens jsonb, p_pagamentos jsonb, p_pessoa_id text, p_desconto numeric, p_observacoes text, p_deposito_id text)
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
  v_today              date;
  v_now                timestamptz;
  v_estoque_atualizado jsonb := '{}'::jsonb;
begin
  v_today := current_date;
  v_now   := now();

  -- Calcular totais
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_subtotal := v_subtotal
      + (v_item->>'quantidade')::numeric
      * (v_item->>'preco_unitario')::numeric;
  end loop;

  v_total_produtos := greatest(0, v_subtotal - p_desconto);

  for v_pag in select * from jsonb_array_elements(p_pagamentos) loop
    v_total_taxas := v_total_taxas + (v_pag->>'taxa')::numeric;
  end loop;

  v_total := v_total_produtos + v_total_taxas;

  if jsonb_array_length(p_pagamentos) = 1 then
    v_forma_pag_id := p_pagamentos->0->>'forma_pagamento_id';
  end if;

  -- Validar e debitar estoque
  for v_item in select * from jsonb_array_elements(p_itens) loop
    select id, quantidade
    into   v_estoque_id, v_qtd_disponivel
    from   estoque
    where  deposito_id = p_deposito_id
      and  produto_id  = (v_item->>'produto_id')
    for update;

    if not found then
      raise exception 'Produto "%" não encontrado no estoque do depósito',
        v_item->>'nome';
    end if;

    if v_qtd_disponivel < (v_item->>'quantidade')::numeric then
      raise exception 'Estoque insuficiente para "%" (disponível: %)',
        v_item->>'nome', v_qtd_disponivel;
    end if;

    v_nova_qtd := v_qtd_disponivel - (v_item->>'quantidade')::numeric;

    update estoque
    set    quantidade = v_nova_qtd, updated_at = v_now
    where  id = v_estoque_id;

    v_estoque_atualizado := v_estoque_atualizado
      || jsonb_build_object(v_item->>'produto_id', v_nova_qtd);
  end loop;

  -- Gerar número sequencial de venda
  v_venda_numero := nextval('venda_numero_seq');

  -- Inserir venda
  insert into vendas (numero, total, desconto, forma_pagamento_id, pessoa_id, observacoes, status)
  values (
    v_venda_numero,
    v_total,
    p_desconto,
    v_forma_pag_id,
    p_pessoa_id,
    nullif(p_observacoes, ''),
    'concluida'
  )
  returning id into v_venda_id;

  -- Inserir itens
  insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, desconto_item, total_item)
  select
    v_venda_id,
    (item->>'produto_id'),
    (item->>'quantidade')::numeric,
    (item->>'preco_unitario')::numeric,
    0,
    (item->>'quantidade')::numeric * (item->>'preco_unitario')::numeric
  from jsonb_array_elements(p_itens) as item;

  -- Inserir pagamentos
  insert into pagamentos_venda (venda_id, forma_pagamento_id, valor, taxa, maquina, parcelas, status)
  select
    v_venda_id,
    pag->>'forma_pagamento_id',
    (pag->>'valor')::numeric,
    (pag->>'taxa')::numeric,
    nullif(pag->>'maquina', ''),
    (pag->>'parcelas')::int,
    pag->>'status'
  from jsonb_array_elements(p_pagamentos) as pag;

  -- Calcular pago vs fiado
  select
    coalesce(sum(case when pag->>'status' = 'pago'
      then (pag->>'valor')::numeric + (pag->>'taxa')::numeric else 0 end), 0),
    coalesce(sum(case when pag->>'status' = 'pendente'
      then (pag->>'valor')::numeric else 0 end), 0)
  into v_pago_total, v_fiado_total
  from jsonb_array_elements(p_pagamentos) as pag;

  -- Lançamento pago
  if v_pago_total > 0 then
    insert into lancamentos
      (descricao, valor, tipo, data_competencia, data_vencimento, status, data_pagamento, updated_at)
    values (
      'Venda #' || v_venda_numero,
      v_pago_total, 'receber',
      v_today, v_today, 'pago', v_today, v_now
    );
  end if;

  -- Lançamento fiado
  if v_fiado_total > 0 then
    if p_pessoa_id is not null then
      select nome into v_pessoa_nome from pessoas where id = p_pessoa_id;
    end if;
    insert into lancamentos
      (descricao, valor, tipo, data_competencia, data_vencimento, status, pessoa_nome, updated_at)
    values (
      'A Receber — Fiado #' || v_venda_numero,
      v_fiado_total, 'receber',
      v_today, v_today, 'pendente', v_pessoa_nome, v_now
    );
  end if;

  return jsonb_build_object(
    'venda_id',           v_venda_id,
    'venda_numero',       v_venda_numero,
    'total',              v_total,
    'estoque_atualizado', v_estoque_atualizado
  );
end;
$function$
;

