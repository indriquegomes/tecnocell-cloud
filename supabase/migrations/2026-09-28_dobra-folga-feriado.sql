-- Dobra de horas em folga/feriado: pontos guarda a escolha na entrada, banco_horas guarda
-- se a dobra já foi confirmada pelo master.
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS dobra_tipo text;   -- null | 'extra' | 'troca'
ALTER TABLE pontos ADD COLUMN IF NOT EXISTS dobra_data date;   -- dia da troca (só em 'troca')
ALTER TABLE banco_horas ADD COLUMN IF NOT EXISTS confirmado boolean NOT NULL DEFAULT true;
