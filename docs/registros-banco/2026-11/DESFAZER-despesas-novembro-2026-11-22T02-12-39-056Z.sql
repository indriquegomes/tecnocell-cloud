DELETE FROM movimentos_caixa WHERE lancamento_id IN ('3080d556-4ae1-45cd-a652-857de9dc4fc2','dbfe7087-37be-42ee-9b6e-23831876f49e') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('3080d556-4ae1-45cd-a652-857de9dc4fc2','dbfe7087-37be-42ee-9b6e-23831876f49e');
