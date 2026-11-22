DELETE FROM movimentos_caixa WHERE lancamento_id IN ('9093bd8b-70c1-4240-b38f-9b6bc1b07971','b5bda9a3-a2f3-410d-8cbf-c9ade00e56c5') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('9093bd8b-70c1-4240-b38f-9b6bc1b07971','b5bda9a3-a2f3-410d-8cbf-c9ade00e56c5');
