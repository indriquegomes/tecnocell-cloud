-- Consulta read-only pra IA do chat (funcionário): qualquer SELECT, sem escrita.
-- Transação/consulta é só leitura — INSERT/UPDATE/DELETE/DDL são bloqueados.
CREATE OR REPLACE FUNCTION public.consulta_ia(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := trim(p_query);
  r jsonb;
BEGIN
  IF q IS NULL OR q = '' THEN
    RAISE EXCEPTION 'consulta vazia';
  END IF;
  -- permite ponto-e-vírgula final, rejeita o resto (bloqueia múltiplas instruções)
  q := regexp_replace(q, ';\s*$', '');
  IF q ~ ';' THEN
    RAISE EXCEPTION 'múltiplas instruções não permitidas';
  END IF;
  -- só SELECT
  IF q !~* '^\s*select\y' THEN
    RAISE EXCEPTION 'apenas consulta SELECT é permitida';
  END IF;
  -- bloqueia escrita/DDL
  IF q ~* '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|reindex|into|set|reset)\y' THEN
    RAISE EXCEPTION 'consulta bloqueada';
  END IF;
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (SELECT * FROM (' || q || ') sub LIMIT 200) t' INTO r;
  RETURN coalesce(r, '[]'::jsonb);
END;
$$;
