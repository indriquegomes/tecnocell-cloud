-- Clientes do app compartilham o Auth com o SaaS, mas não devem listar
-- os perfis e permissões da equipe. A função SECURITY DEFINER consulta
-- perfis sem depender desta política e aceita apenas funcionários ativos.
begin;

alter table public.perfis enable row level security;

create policy app_somente_internos on public.perfis
  as restrictive for select to authenticated
  using (public.usuario_interno());

commit;
