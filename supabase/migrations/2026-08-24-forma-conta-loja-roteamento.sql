-- Roteamento do recebido por LOJA (Isa): a MESMA forma de pagamento cai na conta
-- da loja onde a venda foi feita. Ex.: PIX em Petrópolis → conta PIX Petrópolis;
-- PIX em Teresópolis → conta PIX Teresópolis. Sem duplicar a forma.
--
-- VAZIO (sem linha para uma forma/loja) = usa forma.conta_destino_id (comportamento
-- atual). Então é backward-compatible: nada muda até popular esta tabela.
-- Dinheiro continua caindo no CAIXA da loja (não precisa entrar aqui).
create table if not exists forma_conta_loja (
  forma_id text not null references formas_pagamento(id) on delete cascade,
  loja_id  uuid not null references lojas(id) on delete cascade,
  conta_id uuid not null references contas(id) on delete cascade,
  primary key (forma_id, loja_id)
);

create index if not exists idx_forma_conta_loja_forma on forma_conta_loja(forma_id);
