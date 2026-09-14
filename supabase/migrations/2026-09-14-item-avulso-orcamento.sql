-- Item avulso no orçamento: item sem produto cadastrado (vai encomendar).
-- Guarda o nome livre direto no item do pedido (o produto_id fica nulo).
alter table itens_pedido add column if not exists nome text;
