-- Revisar/aplicar antes de liberar a aprovação de contas pelo painel.
-- Se houver vínculos duplicados, o índice falha; não apagar nem escolher contas automaticamente.
create unique index if not exists cadastros_clientes_pessoa_unica
  on public.cadastros_clientes (pessoa_id)
  where pessoa_id is not null;
