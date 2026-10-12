-- Ordem manual dos cargos (posição na lista). Número menor = aparece primeiro.
-- Regra: cargo master (acesso total) no topo, depois por QUANTIDADE de permissões
-- (mais permissões = mais acima). NULL cai pro fim e ordena pelo nome.
ALTER TABLE cargos ADD COLUMN IF NOT EXISTS ordem integer;

UPDATE cargos SET ordem = 1 WHERE nome = 'Gerente';
UPDATE cargos SET ordem = 2 WHERE nome = 'dev tester';
UPDATE cargos SET ordem = 3 WHERE nome = 'Caixa / Financeiro';
UPDATE cargos SET ordem = 4 WHERE nome = 'Estoquista';
UPDATE cargos SET ordem = 5 WHERE nome = 'Vendedor';
UPDATE cargos SET ordem = 6 WHERE nome = 'MOTOBOY';
