-- Libera 'freelancer' como rótulo de cargo no perfil (funcionária freelancer).
-- 'cargo' é um rótulo de texto exibido no RH; a permissão real vem de cargo_id.
alter table public.perfis drop constraint if exists perfis_cargo_check;
alter table public.perfis add constraint perfis_cargo_check check (cargo in ('dono', 'vendedor', 'gerente', 'estagiária', 'estoquista', 'freelancer'));
