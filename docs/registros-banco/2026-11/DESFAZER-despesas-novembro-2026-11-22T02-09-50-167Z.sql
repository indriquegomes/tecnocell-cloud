DELETE FROM movimentos_caixa WHERE lancamento_id IN ('264176ef-c220-47d8-a464-3c5638671688','92ac8c2d-98ba-4286-836c-9999fef032b9','bcaf5f82-be98-4836-891e-9c30fa4251c2') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('264176ef-c220-47d8-a464-3c5638671688','92ac8c2d-98ba-4286-836c-9999fef032b9','bcaf5f82-be98-4836-891e-9c30fa4251c2');
