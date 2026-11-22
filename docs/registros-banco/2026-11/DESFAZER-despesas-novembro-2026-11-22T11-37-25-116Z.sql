DELETE FROM movimentos_caixa WHERE lancamento_id IN ('ac078275-2f6c-42cd-8b66-cec52f92eb56','5d2d9d9c-24a4-4777-8cf2-babc56e3891e') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('ac078275-2f6c-42cd-8b66-cec52f92eb56','5d2d9d9c-24a4-4777-8cf2-babc56e3891e');
