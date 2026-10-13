-- Segurança: trava o login após logout — o master libera na tela de Usuários.
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS login_bloqueado boolean NOT NULL DEFAULT false;
