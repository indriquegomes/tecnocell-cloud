create table if not exists public.chat_limites (
  chave text primary key, janela timestamptz not null, chamadas integer not null
);
alter table public.chat_limites enable row level security;
revoke all on public.chat_limites from public, anon, authenticated;
grant all on public.chat_limites to service_role;
create or replace function public.reservar_chat(p_chave text) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_n integer; v_janela timestamptz := date_trunc('minute',now());
begin
  if p_chave is null or length(p_chave)>100 then return false; end if;
  insert into chat_limites values('global',v_janela,1)
  on conflict(chave) do update set janela=excluded.janela,
    chamadas=case when chat_limites.janela=excluded.janela then chat_limites.chamadas+1 else 1 end
  returning chamadas into v_n;
  if v_n>100 then return false; end if;
  insert into chat_limites values('cliente:'||p_chave,v_janela,1)
  on conflict(chave) do update set janela=excluded.janela,
    chamadas=case when chat_limites.janela=excluded.janela then chat_limites.chamadas+1 else 1 end
  returning chamadas into v_n;
  delete from chat_limites where janela < now()-interval '1 day';
  return v_n<=20;
end;
$$;
revoke all on function public.reservar_chat(text) from public,anon,authenticated;
grant execute on function public.reservar_chat(text) to service_role;
