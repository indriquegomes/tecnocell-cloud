-- SOMENTE LEITURA. Projeto obrigatório: TECNOCELL.CLAUD / rbjwbfekkhebaschiqda.
-- Comparar antes de aplicar 20261020123000. Não altera venda #8414.
select p.oid::regprocedure as assinatura,
       pg_get_userbyid(p.proowner) as proprietario,
       p.prosecdef as security_definer,
       p.proconfig as configuracao,
       md5(regexp_replace(p.prosrc,'\s+','','g')) as corpo_md5,
       md5(regexp_replace(p.prosrc,'\s+','','g')) = '105c08d1e80ecae93fd321b936c429d1' as corresponde_base_local,
       pg_get_functiondef(p.oid) as definicao
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='registrar_devolucao';

select version,name from supabase_migrations.schema_migrations where version='20261020123000';
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and ((table_name='devolucoes' and column_name in ('caixa_id','abate_fiado','reembolsos'))
 or (table_name='lancamentos' and column_name='devolucao_id')) order by table_name,column_name;

-- Foto sem dados pessoais: hashes de linhas históricas para comparar antes/depois.
select 'venda' as origem,md5(to_jsonb(v)::text) as hash_registro from public.vendas v
where id='aa4482d0-f479-4507-b5c6-cc45165d6271'
union all
select 'devolucao',md5((to_jsonb(d) - array['caixa_id','abate_fiado','reembolsos'])::text) from public.devolucoes d
where id='84ff07bb-f0f9-422f-94a5-522cf0f9f4e1'
union all
select 'lancamento',md5((to_jsonb(l) - 'devolucao_id')::text) from public.lancamentos l
where id in ('1de7acdb-7f03-4fa7-945d-1176fc28ee3e','0586d31b-26bc-4c78-b644-cc9f8e3244a5');
-- Os hashes excluem somente as novas colunas NULL para permitir comparação após o DDL.
