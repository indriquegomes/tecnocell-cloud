DELETE FROM movimentos_caixa WHERE lancamento_id IN ('4fa61213-ff00-4cc4-b290-14787a14e6b7','a67b80ad-5b02-4857-80df-638e52f5e027') AND origem = 'financeiro';
DELETE FROM lancamentos WHERE id IN ('4fa61213-ff00-4cc4-b290-14787a14e6b7','a67b80ad-5b02-4857-80df-638e52f5e027');
