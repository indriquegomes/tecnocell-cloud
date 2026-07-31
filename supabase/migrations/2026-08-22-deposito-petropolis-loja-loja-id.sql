-- Depósito "PETRÓPOLIS LOJA" estava com loja_id NULL, então sumia de qualquer
-- agrupamento de estoque/movimentação por loja (relatório porloja, dropdowns).
-- Reclamação Isa 29/07: "TÁ FALTANDO DEPÓSITO (Petrópolis Loja)".
-- O irmão PETRÓPOLIS ESTOQUE já aponta pra Petrópolis; alinhamos o LOJA também.
update depositos
   set loja_id = 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946' -- Petrópolis
 where id = '63d9054d59a9c829747233d4'                   -- PETRÓPOLIS LOJA
   and loja_id is null;
