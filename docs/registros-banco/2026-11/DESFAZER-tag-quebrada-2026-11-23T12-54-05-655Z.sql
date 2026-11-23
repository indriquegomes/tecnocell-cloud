-- volta o item da devolução para 'ok' e devolve 1 unidade ao estoque da loja
UPDATE itens_devolucao SET status_produto = 'ok' WHERE id = 'bcdc7a5e-6f81-4aca-941b-811fc0030849';
SELECT public.movimentar_estoque('69d7ab578543e4a9a57c25f2', '63d9054d59a9c829747233d4', 'entrada', 1, '[]'::jsonb, 'DESFAZER: baixa da TAG quebrada', null, now());
