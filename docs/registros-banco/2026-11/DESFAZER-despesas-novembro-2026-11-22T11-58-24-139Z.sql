DELETE FROM movimentos_caixa WHERE lancamento_id IN ('1309c6da-8315-46d5-be90-fbb4bf46ff8b','1458df17-affb-4527-b546-6704e89c8ae3') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('1309c6da-8315-46d5-be90-fbb4bf46ff8b','1458df17-affb-4527-b546-6704e89c8ae3');
