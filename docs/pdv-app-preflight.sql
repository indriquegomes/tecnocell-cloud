-- SOMENTE LEITURA. Executar exclusivamente em TECNOCELL.CLAUD
-- project ref rbjwbfekkhebaschiqda. Não contém dados de clientes nem credenciais.
select p.oid::regprocedure::text as assinatura,
       pg_get_functiondef(p.oid) as definicao
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'finalizar_venda', 'finalizar_venda_com_desconto_item',
  'confirmar_pedido_app_unidade', 'cancelar_pedido_app',
  'validar_operador_pedido_app'
) order by p.proname, p.oid::regprocedure::text;

select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in (
  'pedidos_app','pedidos_app_atendimentos','pedidos_app_unidades',
  'vendas','itens_venda','pagamentos_venda','caixas','depositos','estoque'
) order by table_name,ordinal_position;

select c.relname as tabela,t.tgname as trigger,pg_get_triggerdef(t.oid) as definicao
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('vendas','itens_venda','pagamentos_venda')
and not t.tgisinternal order by c.relname,t.tgname;

select c.relname as tabela,k.conname,pg_get_constraintdef(k.oid) as definicao
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('pedidos_app','pedidos_app_atendimentos')
order by c.relname,k.conname;

select version,name from supabase_migrations.schema_migrations order by version desc limit 12;
