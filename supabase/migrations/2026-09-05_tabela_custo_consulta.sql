alter table tabelas_preco
  add column if not exists usa_preco_custo boolean not null default false;

create unique index if not exists tabelas_preco_unica_custo
  on tabelas_preco (usa_preco_custo)
  where usa_preco_custo;

do $$
declare
  v_tabela_id uuid;
begin
  select id into v_tabela_id from tabelas_preco where usa_preco_custo limit 1;
  if v_tabela_id is null then
    select id into v_tabela_id from tabelas_preco where upper(trim(nome)) = 'CUSTO' limit 1;
    if v_tabela_id is null then
      insert into tabelas_preco (nome, descricao, ativa, usa_preco_custo)
      values ('CUSTO', 'Consulta do preço de custo atual', true, true)
      returning id into v_tabela_id;
    else
      update tabelas_preco
      set ativa = true, usa_preco_custo = true
      where id = v_tabela_id;
    end if;
  end if;

  delete from itens_tabela_preco where tabela_id = v_tabela_id;
  insert into itens_tabela_preco (tabela_id, produto_id, preco, quantidade_minima)
  select v_tabela_id, id, coalesce(preco_custo, 0), 1
  from produtos
  where ativo;
end $$;

create or replace function sincronizar_item_tabela_custo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tabela_id uuid;
begin
  select id into v_tabela_id from tabelas_preco where usa_preco_custo limit 1;
  if v_tabela_id is null then return new; end if;

  if new.ativo then
    insert into itens_tabela_preco (tabela_id, produto_id, preco, quantidade_minima)
    values (v_tabela_id, new.id, coalesce(new.preco_custo, 0), 1)
    on conflict (tabela_id, produto_id, quantidade_minima)
    do update set preco = excluded.preco;
  else
    delete from itens_tabela_preco
    where tabela_id = v_tabela_id and produto_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_item_tabela_custo on produtos;
create trigger trg_sincronizar_item_tabela_custo
after insert or update of preco_custo, ativo on produtos
for each row execute function sincronizar_item_tabela_custo();
