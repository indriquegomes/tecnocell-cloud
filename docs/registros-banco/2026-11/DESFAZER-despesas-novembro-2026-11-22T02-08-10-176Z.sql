DELETE FROM movimentos_caixa WHERE lancamento_id IN ('afe63c67-9c16-47b9-a77e-7776d2e346ac','bf0a40f7-247d-4111-809c-85e40b4d6505','33e764c1-1db8-4514-903e-57507b0f2bec') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('afe63c67-9c16-47b9-a77e-7776d2e346ac','bf0a40f7-247d-4111-809c-85e40b4d6505','33e764c1-1db8-4514-903e-57507b0f2bec');
