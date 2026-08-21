-- Nome próprio da loja (ex: "Petrópolis", "Teresópolis"), escolhido pelo
-- usuário antes de logar no Mercado Livre — mesmo padrão do SIGE. Cai pro
-- ml_nickname/ml_user_id quando não preenchido (conexões antigas, ou se
-- o campo ficar em branco por algum motivo).
alter table integracoes_mercado_livre add column if not exists nome_loja text;
