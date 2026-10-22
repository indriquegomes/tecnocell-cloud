-- PIN de 4 dígitos pra bater o ponto (evita bater no login errado).
-- Default '1234' — cada pessoa troca no Meu Perfil.
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pin_ponto text NOT NULL DEFAULT '1234';
