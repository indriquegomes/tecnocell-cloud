-- ============================================================
-- Cargos (modelo Discord): o cargo é a fonte da verdade das permissões.
-- Mudou o cargo → todos os usuários daquele cargo mudam junto.
-- perfis.cargo_id aponta pro cargo; se null, usa as permissões individuais do perfil.
-- Idempotente. Seguro reaplicar.
-- ============================================================

create table if not exists cargos (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,
  permissoes text[] default '{}',
  is_master  boolean default false,
  ativo      boolean default true,
  created_at timestamptz default now()
);

alter table perfis add column if not exists cargo_id uuid references cargos(id);

-- Cargos iniciais úteis (só cria se ainda não existir)
insert into cargos (nome, permissoes, is_master)
select 'Gerente', '{}', true
where not exists (select 1 from cargos where lower(nome) = 'gerente');

insert into cargos (nome, permissoes)
select 'Vendedora', array['pdv','vendas','devolucoes','clientes','pedidos']
where not exists (select 1 from cargos where lower(nome) = 'vendedora');

insert into cargos (nome, permissoes)
select 'Estoquista', array['estoque','produtos','compras']
where not exists (select 1 from cargos where lower(nome) = 'estoquista');
