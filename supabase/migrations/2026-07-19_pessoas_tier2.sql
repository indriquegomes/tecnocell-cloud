-- ============================================================
-- Pessoas Tier 2: RG, origem (como conheceu a loja) e vendedor responsável.
-- vendedor_id aponta pro perfil (usuário) dono da conta do cliente.
-- Idempotente. Seguro reaplicar.
-- ============================================================

alter table pessoas add column if not exists rg          text;
alter table pessoas add column if not exists origem      text;
alter table pessoas add column if not exists vendedor_id uuid;
