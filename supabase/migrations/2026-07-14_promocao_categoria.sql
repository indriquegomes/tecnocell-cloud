-- ============================================================
-- PROMOÇÃO POR CATEGORIA (pedido da Isa: promoção de PELÍCULA sem catar
-- as 327 películas na mão).
--
-- A promoção continua guardando PRODUTO A PRODUTO (itens_promocao) — a lógica de
-- preço do PDV não muda em nada. Isso é dinheiro; não se mexe nela por conveniência
-- de cadastro. O que muda é o CADASTRO: escolhe-se a categoria e o sistema despeja
-- todos os produtos ativos dela de uma vez.
--
-- Como é uma FOTOGRAFIA, produto novo cadastrado depois não entra sozinho. Por isso
-- guardamos aqui QUAL categoria foi usada: a tela compara com os produtos atuais da
-- categoria e avisa "3 produtos novos ainda não estão nesta promoção — [Incluir]".
--
-- Aponta pra categorias.HIERARQUIA (o código "0005"), não pro id nem pro nome — é o
-- que a FK de produtos.categoria usa.
-- ============================================================

alter table promocoes
  add column if not exists categoria text references categorias(hierarquia);
