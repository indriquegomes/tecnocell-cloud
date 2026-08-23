-- Faltavam dois campos reais que o Mercado Livre exige pra publicar
-- (achado testando de verdade, ver commit): tipo de anúncio (grátis,
-- clássico, premium... a lista de opções e os nomes variam por categoria e
-- pelo plano da conta, por isso não é um enum fixo) e condição do produto
-- (novo/usado — estava fixo em "novo" no código, errado).
alter table rascunhos_anuncio_ml add column if not exists listing_type_id text;
alter table rascunhos_anuncio_ml add column if not exists condicao text not null default 'new' check (condicao in ('new', 'used'));
