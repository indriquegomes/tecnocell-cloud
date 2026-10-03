-- Clientes do app usam o mesmo Auth do SaaS. Políticas permissivas antigas
-- deixam qualquer authenticated acessar estas tabelas internas.
-- usuario_interno() só aceita auth.uid() com perfil ativo em public.perfis.
begin;

alter table public.lancamentos enable row level security;
alter table public.formas_pagamento enable row level security;
alter table public.sync_log enable row level security;

create policy app_somente_internos on public.lancamentos
  as restrictive for all to authenticated
  using (public.usuario_interno())
  with check (public.usuario_interno());

create policy app_somente_internos on public.formas_pagamento
  as restrictive for all to authenticated
  using (public.usuario_interno())
  with check (public.usuario_interno());

create policy app_somente_internos on public.sync_log
  as restrictive for all to authenticated
  using (public.usuario_interno())
  with check (public.usuario_interno());

commit;
