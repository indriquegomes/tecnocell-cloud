-- RLS da tabela trocas_sp (criada sem RLS). O app usa service role (bypassa),
-- mas habilitar fecha a porta do acesso anon pela API pública. Mesmo padrão de logs_atividade.
alter table public.trocas_sp enable row level security;
drop policy if exists trocas_sp_auth on public.trocas_sp;
create policy trocas_sp_auth on public.trocas_sp
  for all to authenticated using (true) with check (true);
