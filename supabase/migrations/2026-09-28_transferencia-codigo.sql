-- Código de controle de transferência (TED1, TED2, ...) pra saber qual cupom aprovar.
-- Sequência global: cada remessa nova ganha o próximo número, na ordem de criação.

CREATE SEQUENCE IF NOT EXISTS remessas_estoque_codigo_seq;

ALTER TABLE remessas_estoque ADD COLUMN IF NOT EXISTS codigo text;

-- Backfill das remessas já existentes (na ordem de criação, desempate por id).
WITH numeradas AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM remessas_estoque
)
UPDATE remessas_estoque r
SET codigo = 'TED' || n.n
FROM numeradas n
WHERE r.id = n.id AND r.codigo IS NULL;

-- A sequência passa a apontar pro próximo número (count = maior número já usado).
SELECT setval('remessas_estoque_codigo_seq', (SELECT count(*) FROM remessas_estoque));

ALTER TABLE remessas_estoque
  ALTER COLUMN codigo SET DEFAULT 'TED' || nextval('remessas_estoque_codigo_seq'::regclass)::text,
  ALTER COLUMN codigo SET NOT NULL;
