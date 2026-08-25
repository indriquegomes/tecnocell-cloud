-- Trava a duplicidade de código de produto no próprio banco.
--
-- app/painel/produtos/actions.ts (criarProduto) já checa duplicidade antes de
-- inserir ("já existe um produto ATIVO com o código X"), mas é um SELECT
-- seguido de INSERT — sem trava no banco, duas criações quase simultâneas com
-- o mesmo código passam as duas pela checagem (nenhuma vê o insert da outra
-- ainda) e o banco aceita as duas. Confirmado em teste de propósito 25/08:
-- duas abas criando produto com o mesmo código ao mesmo tempo => 2 produtos
-- com código idêntico, mesmo com a checagem no código.
--
-- Índice único PARCIAL (só entre ativos) replica exatamente a regra que o
-- app já checa — produto inativo pode repetir código de um produto ativo
-- diferente (comportamento já existente, não muda).
create unique index if not exists produtos_codigo_ativo_unique
  on produtos (codigo)
  where ativo = true and codigo is not null;
