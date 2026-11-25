-- Segredo de servidor fora do código e fora de `configuracoes`.
--
-- Por que não usar `configuracoes`: aquela tabela tem policy `auth_config` (ALL) para
-- o papel `authenticated`, ou seja, QUALQUER pessoa logada lê o conteúdo. Um token de
-- bot lá vazaria para toda a equipe.
--
-- Aqui: RLS ligado e ZERO policy. Só a service role (rotas e actions do servidor) lê.
-- Nada disso vai para o navegador; nenhuma tela mostra segredo.
--
-- A ordem de leitura no código é: variável de ambiente primeiro (padrão do projeto),
-- esta tabela como alternativa quando a variável não existe.

create table if not exists segredos (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz default now() not null
);

alter table segredos enable row level security;

-- Sem policy de propósito: quem tenta ler com a chave anon/usuário recebe zero linha
-- (RLS ligado sem policy = nada passa). Não criar policy aqui sem revisar quem lê.
