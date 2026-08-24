-- Versao de 9 argumentos (sem p_series) ficou obsoleta desde que o suporte
-- a IMEI foi adicionado. Sem a trava de excesso nem tratamento de IMEI que a
-- versao de 10 argumentos tem. Confirmado que o unico call site do app
-- (app/painel/devolucoes/actions.ts) sempre passa p_series, entao nunca
-- chamou essa versao - mas ela continuava la, pronta pra ser chamada por
-- engano por qualquer codigo futuro que esquecesse esse argumento.
drop function if exists public.registrar_devolucao(uuid, text, text, text, text, text, text, jsonb, boolean);
