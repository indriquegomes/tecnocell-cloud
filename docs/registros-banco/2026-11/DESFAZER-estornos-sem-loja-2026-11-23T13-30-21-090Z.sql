INSERT INTO creditos_clientes (id, pessoa_id, pessoa_nome, loja_id, tipo, valor, descricao, created_at) VALUES ('c87a7c3d-9ee0-4276-b90c-59d829ff9d0d', '63d91dae59a9c82974728b08', 'RODRIGO PEREIRA (SEMPRE INCLUIR PEL R$ 1,80)', NULL, 'estorno', 1000, 'Estorno do crédito — peças devolvidas em 16/11 já pagas no reembolso de 1.530,90 (PIX de 19/11)', '2026-11-23T01:44:36.18263+00:00');
UPDATE creditos_clientes SET loja_id = NULL, estorna_credito_id = NULL WHERE id = 'db4d0f16-116f-47ec-88af-5b1b1c215a85';
UPDATE creditos_clientes SET loja_id = NULL, estorna_credito_id = NULL WHERE id = 'c0f82859-870b-4909-91c0-3eac9fabedab';
DELETE FROM creditos_clientes WHERE estorna_credito_id = '290ab413-ec58-4af0-a92c-fb6df2efe7ec' AND tipo = 'estorno' AND descricao LIKE '%(dividido: crédito 290ab413)%';
DELETE FROM creditos_clientes WHERE estorna_credito_id = 'ad17c33d-70f0-49f5-ac16-0a130b5c4680' AND tipo = 'estorno' AND descricao LIKE '%(dividido: crédito ad17c33d)%';
