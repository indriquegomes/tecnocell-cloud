-- Zera financeiro (contas a pagar/receber) — pedido do dono, seguindo o
-- zeramento de vendas e compras. NÃO toca em creditos_clientes (vale-crédito),
-- caixa nem estoque.

truncate table lancamentos restart identity;
