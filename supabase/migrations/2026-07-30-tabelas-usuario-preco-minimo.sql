-- Tabelas de preço visíveis por usuário + preço mínimo por produto (paridade SIGE)
-- tabelas_permitidas: quais tabelas o usuário vê no PDV. NULL/vazio = todas.
-- preco_minimo: piso de venda do produto. NULL/0 = sem piso.
--   Vender abaixo do piso exige a permissão 'venda_abaixo_minimo' (limite de operação).

alter table perfis   add column if not exists tabelas_permitidas uuid[];
alter table produtos add column if not exists preco_minimo numeric;
