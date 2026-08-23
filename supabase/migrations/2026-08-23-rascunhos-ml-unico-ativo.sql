-- Trava no banco pra não nascer um segundo rascunho ativo do mesmo produto
-- na mesma conexão. A tela já verifica isso antes de inserir
-- (app/painel/integracoes/produtos/actions.ts, criarRascunhoEIrPraEdicao),
-- mas a checagem lá não é atômica — dois cliques quase simultâneos podem
-- passar os dois pela checagem antes de qualquer um inserir. Índice parcial
-- porque um rascunho já publicado não conta (o produto pode ganhar um novo
-- rascunho depois, pra outra conexão ou uma reedição futura).
create unique index if not exists idx_rascunhos_ml_ativo_unico
  on rascunhos_anuncio_ml(produto_id, conexao_id)
  where status <> 'publicado';
