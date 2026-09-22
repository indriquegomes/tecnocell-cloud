-- 22/09/2026: estrutura financeira das lojas — folha de pagamento.
-- 1) chave_pix no perfil do funcionário (dado dele, junto do salário).
-- 2) comprovante_url no lançamento (comprovante do Pix anexado ao pagar).
alter table perfis add column if not exists chave_pix text;
alter table lancamentos add column if not exists comprovante_url text;
