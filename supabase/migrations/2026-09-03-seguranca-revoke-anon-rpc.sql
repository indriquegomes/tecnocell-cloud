-- SEGURANÇA — bloqueia chamada dos RPCs de dinheiro/estoque pela chave PÚBLICA.
-- Achado no conselho de prontidão (Claude): os RPCs security definer estavam com
-- EXECUTE liberado pra anon → qualquer um com a chave pública chamava via REST.
-- "ALL FUNCTIONS" evita o erro 42725 (função sobrecarregada, ex dashboard_resumo):
-- não precisa listar assinatura por assinatura.
-- O app chama os RPCs via service role (createServiceClient) = superuser, NÃO afetado.

revoke execute on all functions in schema public from anon, public;
