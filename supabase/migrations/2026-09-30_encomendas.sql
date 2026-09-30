-- ENCOMENDAS de clientes (pedido do dono 30/09): cliente quer peça que não tem em
-- estoque. Fluxo: PDV cria (sinal opcional vira vale normal) → Estoque lista →
-- Compras "ENCOMENDAS ESPECIAIS" aprova quando a peça chega (entra no estoque).

create table if not exists encomendas (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text,                        -- cliente (null se não tiver cadastro)
  pessoa_nome text not null,             -- nome do cliente (pra lista/telegram)
  produto_id text,                       -- produto já cadastrado (null = temporário)
  item_nome text not null,               -- nome do item (real ou temporário)
  temporario boolean not null default false, -- item ainda sem cadastro no sistema
  quantidade numeric not null default 1,
  valor_venda numeric,                   -- preço acertado no balcão (default ATACADO1)
  custo numeric,                         -- preenchido pela estoquista quando chega
  sinal numeric not null default 0,      -- sinal pago (0 = sem sinal)
  sinal_forma text,                      -- forma do sinal (pix, dinheiro...)
  status text not null default 'aberta', -- aberta | aprovada | cancelada
  loja_id uuid,                          -- loja da encomenda
  created_by text,                       -- vendedora que criou
  observacoes text,
  created_at timestamptz not null default now(),
  aprovado_em timestamptz                -- quando a peça foi aprovada/entrou
);

create index if not exists encomendas_loja_status_idx on encomendas (loja_id, status);
create index if not exists encomendas_pessoa_idx on encomendas (pessoa_id);
