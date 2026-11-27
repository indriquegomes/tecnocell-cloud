-- ============================================================================
-- BRINDES DE CAMPANHA (Black Friday TEC BLACK, 27/11/2026)
--
-- Duas promoções desta campanha não são desconto, são brinde:
--   1. comprou uma tela  → ganha uma película do MESMO modelo (R$ 0,00);
--   2. cliente que passar do valor mínimo → ganha 1 Smart Ring (R$ 0,00),
--      UMA vez em toda a campanha.
--
-- Nada aqui altera preço, custo ou o RPC finalizar_venda. Só duas coisas novas:
--
--   1) itens_venda.brinde — marca a linha que saiu de graça, pra conferência e
--      relatório. Sem isso o brinde fica indistinguível de uma venda a R$ 0.
--
--   2) brindes_concedidos — o cadeado do brinde único. A chave primária é a
--      promoção, então um INSERT por promoção é atômico: dois caixas ao mesmo
--      tempo, um concede e o outro recebe "já concedido".
--      Ponte: para virar "1 por dia" troque a PK por (promocao_id, dia) — a
--      coluna dia já está aqui de propósito.
--
-- Reversão: `drop table if exists brindes_concedidos;` e
--           `alter table itens_venda drop column if exists brinde;`
-- ============================================================================

alter table public.itens_venda add column if not exists brinde boolean not null default false;

create table if not exists public.brindes_concedidos (
  promocao_id uuid not null references public.promocoes(id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  venda_id uuid,
  brinde_produto_id text references public.produtos(id),
  criado_em timestamptz not null default now(),
  primary key (promocao_id)
);

-- Só o service role (o PDV) toca nesta tabela.
alter table public.brindes_concedidos enable row level security;
revoke all on public.brindes_concedidos from public, anon, authenticated;
grant all on public.brindes_concedidos to service_role;
