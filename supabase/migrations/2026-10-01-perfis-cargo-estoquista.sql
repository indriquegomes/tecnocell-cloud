-- Libera 'estoquista' (além de 'estagiária') como rótulo de cargo no perfil.
alter table public.perfis drop constraint if exists perfis_cargo_check;
alter table public.perfis add constraint perfis_cargo_check check (cargo in ('dono', 'vendedor', 'gerente', 'estagiária', 'estoquista'));
