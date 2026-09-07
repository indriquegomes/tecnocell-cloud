begin;
alter table public.reclassificacoes_forma enable row level security;
revoke all on table public.reclassificacoes_forma from public, anon, authenticated;
grant all on table public.reclassificacoes_forma to service_role;
commit;
