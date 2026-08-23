-- Fecha exposição real: essas 4 tabelas da integração Mercado Livre
-- estavam com RLS desligado (achado do advisor de segurança do Supabase),
-- diferente do resto do banco onde toda tabela tem RLS ligado (mesmo sem
-- policy, como bloqueio padrão contra a chave pública anon via PostgREST).
-- integracoes_mercado_livre guarda access_token/refresh_token de verdade —
-- ficavam teoricamente legíveis por qualquer requisição direta à API REST
-- do Supabase com a chave anon.
-- Sem policy porque toda a aplicação acessa essas tabelas só via
-- createServiceClient() (service role, ignora RLS) — conferido: nenhum
-- arquivo do módulo de integrações usa createClient() (client de sessão).
alter table integracoes_mercado_livre enable row level security;
alter table integracoes_mercado_livre_anuncios enable row level security;
alter table integracoes_mercado_livre_pedidos_pendentes enable row level security;
alter table rascunhos_anuncio_ml enable row level security;
