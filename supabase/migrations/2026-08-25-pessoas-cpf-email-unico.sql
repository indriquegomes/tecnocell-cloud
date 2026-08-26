-- Mesma corrida de produtos.codigo (migration 2026-08-25-produtos-codigo-unico-ativo),
-- confirmada de novo em teste de propósito 25/08: duas abas cadastrando cliente com
-- o mesmo CPF ao mesmo tempo = 2 cadastros com CPF idêntico, mesmo com a checagem
-- de "já existe" no código (SELECT antes do INSERT, sem trava no banco).
--
-- app/painel/clientes/actions.ts já documentava isso: "pessoas não tem constraint
-- única em cpf_cnpj/email — essas checagens são a única coisa que evita duplicidade."
--
-- NULL não conflita com NULL num índice único do Postgres — vários clientes sem
-- CPF preenchido continuam permitidos, como já era.
--
-- ⚠️ Aplicada em 26/08 SÓ a parte de cpf_cnpj. A de email (que existia aqui
-- originalmente) foi retirada: checando antes de aplicar, já existem >10
-- clientes reais (importados do SIGE, mesmo created_at, CPFs diferentes)
-- compartilhando o mesmo e-mail — o e-mail da própria loja usado como
-- preenchimento pra quem não tinha e-mail próprio. Criar o índice único
-- falharia direto (dados já duplicados), e mesmo limpando seria uma decisão
-- de negócio (bloquear e-mail repetido?) que não é pra decidir sozinho.
-- Pendente de decisão consciente do dono antes de reconsiderar.
create unique index if not exists pessoas_cpf_cnpj_unique
  on pessoas (cpf_cnpj)
  where cpf_cnpj is not null;
