-- Índices em foreign key sem cobertura (achado do advisor de performance
-- do Supabase). produto_id é consultado a cada carregamento de Meus
-- Produtos (app/painel/integracoes/produtos/page.tsx, .in('produto_id', ...)).
create index if not exists idx_ml_anuncios_produto
  on integracoes_mercado_livre_anuncios(produto_id);
create index if not exists idx_ml_pedidos_pendentes_conexao
  on integracoes_mercado_livre_pedidos_pendentes(conexao_id);
