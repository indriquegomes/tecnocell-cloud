-- ============================================================
-- Máquinas de cartão + taxas editáveis (Etapa 2). Tira o TAXAS chumbado do PDV.
--
-- taxas_credito: array de % por parcela, 0-indexed (índice 0 = 1x, 1 = 2x...).
-- taxa_debito: % no débito. max_parcelas: nº de parcelas oferecidas.
-- Seed = TON e Pagbank com as taxas que estavam no código.
-- Idempotente. Seguro reaplicar.
-- ============================================================

create table if not exists maquinas_cartao (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  taxa_debito   numeric(6,2) default 0,
  taxas_credito jsonb default '[]'::jsonb,
  max_parcelas  int default 1,
  ativo         boolean default true,
  created_at    timestamptz default now()
);

insert into maquinas_cartao (nome, taxa_debito, taxas_credito, max_parcelas)
select 'TON', 3, '[5,9.38,10.38,11.38,12.38,13.38,14.38,15.38,16.38,16.38]'::jsonb, 10
where not exists (select 1 from maquinas_cartao where lower(nome) = 'ton');

insert into maquinas_cartao (nome, taxa_debito, taxas_credito, max_parcelas)
select 'Pagbank', 3, '[5,8.4,10.6,12.8,15,17.2,19.4,21.6,23.8,26]'::jsonb, 10
where not exists (select 1 from maquinas_cartao where lower(nome) = 'pagbank');
