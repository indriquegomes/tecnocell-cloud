-- Fornecedor: chave Pix + formas de pagamento no cadastro.
-- chave_pix = a chave pra copiar na hora de pagar o fornecedor.
-- tipo_chave_pix = CPF/CNPJ/email/celular/aleatoria.
-- formas_pagamento = lista das formas que o fornecedor aceita (Pix, Boleto, TED, Dinheiro, Cartao).
-- forma_padrao = a forma que ja vem marcada ao pagar.
alter table public.pessoas
  add column if not exists chave_pix text,
  add column if not exists tipo_chave_pix text,
  add column if not exists formas_pagamento text[] default '{}',
  add column if not exists forma_padrao text;
