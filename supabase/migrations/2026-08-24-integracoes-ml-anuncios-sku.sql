-- A tela "Meus Anúncios" do SIGE (referência do usuário) tem coluna de SKU.
-- buscarAnunciosDoVendedor já busca o SKU pra ligar automaticamente com
-- produtos.codigo na importação, mas nunca salvava o valor em si.
alter table integracoes_mercado_livre_anuncios add column if not exists sku text;
