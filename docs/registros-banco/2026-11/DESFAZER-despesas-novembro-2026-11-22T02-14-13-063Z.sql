DELETE FROM movimentos_caixa WHERE lancamento_id IN ('cbdfef0c-8614-4a65-af93-03fdf0432ca1','259ea06a-18b0-4660-b372-4ece6e50491b') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('cbdfef0c-8614-4a65-af93-03fdf0432ca1','259ea06a-18b0-4660-b372-4ece6e50491b');
