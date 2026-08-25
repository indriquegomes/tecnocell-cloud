-- Mesma corrida de produtos.codigo (migration 2026-08-25-produtos-codigo-unico-ativo),
-- confirmada de novo em teste de propósito 25/08: duas abas cadastrando cliente com
-- o mesmo CPF ao mesmo tempo = 2 cadastros com CPF idêntico, mesmo com a checagem
-- de "já existe" no código (SELECT antes do INSERT, sem trava no banco).
--
-- app/painel/clientes/actions.ts já documentava isso: "pessoas não tem constraint
-- única em cpf_cnpj/email — essas checagens são a única coisa que evita duplicidade."
--
-- NULL não conflita com NULL num índice único do Postgres — vários clientes sem
-- CPF/e-mail preenchido continuam permitidos, como já era.
create unique index if not exists pessoas_cpf_cnpj_unique
  on pessoas (cpf_cnpj)
  where cpf_cnpj is not null;

create unique index if not exists pessoas_email_unique
  on pessoas (email)
  where email is not null;
