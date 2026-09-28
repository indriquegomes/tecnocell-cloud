-- Feriados (nacionais e municipais por cidade) — usado no ponto pra dobrar horas
-- e nos lembretes de "vamos abrir?" 7 dias antes de feriado municipal.
CREATE TABLE IF NOT EXISTS feriados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidade text NOT NULL,             -- 'todas' (nacional) | 'petropolis' | 'teresopolis'
  data date NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'municipal',  -- 'nacional' | 'municipal'
  created_at timestamptz DEFAULT now(),
  UNIQUE (cidade, data)
);

CREATE INDEX IF NOT EXISTS idx_feriados_data ON feriados (data);
