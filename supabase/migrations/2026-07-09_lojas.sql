-- ============================================================
-- Multiloja — Passo 1: tabela lojas + depositos.loja_id.
--
-- Hierarquia: LOJA (Teresópolis, Petrópolis) → DEPÓSITOS (cada loja tem 2-3).
-- 'lojas' são as unidades da PRÓPRIA rede (não confundir com 'empresas', que
-- é o cadastro de fornecedores). Usuárias revezam entre lojas — a loja não fica
-- amarrada ao usuário; o PDV escolhe a loja (lembrada por computador).
--
-- Seed: cria as 2 lojas reais e liga os depósitos existentes por nome. Os
-- detalhes (CNPJ, endereço, telefone) o dono edita depois no cadastro.
-- Idempotente. Seguro reaplicar.
-- ============================================================

create table if not exists lojas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cnpj       text,
  telefone   text,
  endereco   text,
  cidade     text,
  uf         text,
  ativa      boolean default true,
  created_at timestamptz default now()
);

alter table depositos add column if not exists loja_id uuid references lojas(id);

insert into lojas (nome) select 'Petrópolis'  where not exists (select 1 from lojas where nome = 'Petrópolis');
insert into lojas (nome) select 'Teresópolis' where not exists (select 1 from lojas where nome = 'Teresópolis');

update depositos set loja_id = (select id from lojas where nome = 'Petrópolis')
  where loja_id is null and nome ilike '%petr%';
update depositos set loja_id = (select id from lojas where nome = 'Teresópolis')
  where loja_id is null and nome ilike '%teres%';
