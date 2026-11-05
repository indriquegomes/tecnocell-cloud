-- Remove toda a promoção de Halloween (campanha encerrada). Decisão do dono (04/11/2026).
-- Droppa o schema halloween_private e todas as funções públicas halloween_*.

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname AS nome, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'halloween%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.nome) || '(' || r.args || ') CASCADE';
  END LOOP;
END $do$;

DROP SCHEMA IF EXISTS halloween_private CASCADE;
