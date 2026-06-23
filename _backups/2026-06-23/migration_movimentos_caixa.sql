-- Movimentos do caixa: reforços (entradas) e retiradas (sangrias)
CREATE TABLE IF NOT EXISTS movimentos_caixa (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  caixa_id      uuid         REFERENCES caixas(id) ON DELETE CASCADE,
  tipo          text         NOT NULL CHECK (tipo IN ('reforco', 'retirada')),
  motivo        text,
  forma_pagamento text       NOT NULL DEFAULT 'Dinheiro',
  valor         numeric(10,2) NOT NULL CHECK (valor > 0),
  created_at    timestamptz  DEFAULT now()
);

ALTER TABLE movimentos_caixa ENABLE ROW LEVEL SECURITY;
-- service_role bypasses RLS; sem policies públicas = tabela privada
