-- Nota de cobrança (Isa 30/09): anotação rápida na tela de Fiados sobre o cliente
-- (ex.: "é devolução, não cobrar" / "só falar com a Duda"). Some sozinha quando o
-- cliente zera a dívida — um trigger limpa o campo quando não resta fiado pendente.

alter table pessoas add column if not exists obs_cobranca text;

create or replace function public.limpar_obs_cobranca()
returns trigger
language plpgsql
as $$
declare
  p_id text := coalesce(new.pessoa_id, old.pessoa_id);
begin
  if p_id is not null then
    if not exists (
      select 1 from lancamentos l
      where l.pessoa_id = p_id
        and l.tipo = 'receber'
        and l.status = 'pendente'
        and coalesce(l.valor, 0) - coalesce(l.valor_pago, 0) > 0.01
    ) then
      update pessoas set obs_cobranca = null where id = p_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists limpar_obs_cobranca_trigger on lancamentos;
create trigger limpar_obs_cobranca_trigger
after update or delete on lancamentos
for each row execute function public.limpar_obs_cobranca();
