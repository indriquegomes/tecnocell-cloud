-- criado_por em lancamentos: guarda quem deu o desconto/perdão no fiado.
-- O código do desconto (aplicarDescontoCrediario) grava a despesa com esta coluna;
-- sem ela o insert falhava em silêncio e a "Perda com fiado"/"Desconto concedido"
-- não entrava no resultado do mês. Descoberto em 17/11/2026 com o perdão de
-- R$ 55,00 do Luís Paulo; 8 descontos desde 13/11 ficaram sem a despesa.
alter table public.lancamentos add column if not exists criado_por uuid;
