-- Aviso que sai na nota/cupom do cliente (pessoas.aviso_nota).
-- Separado do aviso interno (nao_vender/nao_vender_motivo): o cupom é entregue
-- ao cliente e não pode carregar mensagem interna (dívida, cobrança). Ex.:
-- "Entregar na TRICELL curso" ou "Só receber diante do pagamento".
alter table public.pessoas add column if not exists aviso_nota text;
