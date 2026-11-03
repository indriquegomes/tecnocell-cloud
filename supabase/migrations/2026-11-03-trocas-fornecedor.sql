-- ============================================================================
-- TROCAS COM FORNECEDOR (garantia / RMA)
-- 03/11/2026 — pedido do dono.
--
-- Regra da loja: cliente devolve peça com defeito, a peça vai para São Paulo
-- trocar no fornecedor, e depois volta. Hoje essa peça não saía do estoque e o
-- custo ficava fantasma. Esta migration cria:
--   1) o tipo de movimento 'troca' (saída da peça defeituosa)
--   2) a tabela `trocas`, a fila que vai do balcão até a peça voltar
-- ============================================================================

-- 1) O CHECK de `movimentacoes_estoque.operacao` precisa aceitar 'troca'.
--    (a 2026-07-13 já reescreveu essa constraint para incluir 'perda')
alter table public.movimentacoes_estoque drop constraint if exists movimentacoes_estoque_operacao_check;
alter table public.movimentacoes_estoque
  add constraint movimentacoes_estoque_operacao_check
  check (operacao in ('entrada', 'saida', 'ajuste', 'perda', 'uso_interno', 'troca'));

-- 2) A fila de trocas.
--    fornecedor_id fica NULO até o dono classificar na aba (pedido dele: a
--    atendente não escolhe fornecedor no balcão, quem organiza é ele depois).
create table if not exists public.trocas (
  id                    uuid primary key default gen_random_uuid(),
  -- peça que saiu
  produto_id            text not null,
  produto_nome          text,
  quantidade            numeric(12,3) not null default 1,
  custo                 numeric(12,2) not null default 0,
  -- de onde saiu
  loja_id               uuid,
  deposito_saida_id     text,
  -- rastro do balcão
  pessoa_nome           text,
  venda_id              uuid,
  devolucao_id          uuid,
  motivo                text,
  -- classificação feita na aba
  fornecedor_id         text,
  fornecedor_nome       text,
  status                text not null default 'aberta'
                        check (status in ('aberta', 'enviada', 'retornou', 'perdida', 'cancelada')),
  -- datas
  data_saida            timestamptz not null default now(),
  data_envio            timestamptz,
  data_retorno          timestamptz,
  -- retorno: mesma peça ou substituta
  produto_retorno_id    text,
  produto_retorno_nome  text,
  custo_retorno         numeric(12,2),
  perda                 numeric(12,2),
  nota_entrada_id       uuid,
  movimentacao_id       uuid,
  -- auditoria
  criado_por            uuid,
  observacao            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists trocas_status_idx on public.trocas (status);
create index if not exists trocas_fornecedor_idx on public.trocas (fornecedor_id);
create index if not exists trocas_data_idx on public.trocas (data_saida desc);

-- Só o service role (server actions) acessa. Nenhuma policy = anon/authenticated
-- não veem nem escrevem direto.
alter table public.trocas enable row level security;

comment on table public.trocas is 'Fila de peças em troca com fornecedor (garantia). Sai do estoque como operacao=troca e volta pelo check na aba Trocas.';
comment on column public.trocas.fornecedor_id is 'Preenchido depois, na aba Trocas — a atendente não escolhe fornecedor no balcão.';
comment on column public.trocas.perda is 'Diferença de custo quando a peça substituta é mais barata que a que saiu.';
