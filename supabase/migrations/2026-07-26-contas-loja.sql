-- Linka cada Conta (Caixa/Banco) a uma LOJA (empresa).
-- Reclamação da Isa: "linkar todos os caixas a alguma empresa" — hoje as contas
-- não têm loja, então uma venda em dinheiro não sabe em qual Caixa cair.
-- Parte 1 (só o vínculo). O roteamento venda→caixa-da-loja vem depois.
alter table contas add column if not exists loja_id uuid;

comment on column contas.loja_id is 'Loja (empresa) dona desta conta/caixa. Null = geral/sem loja.';
