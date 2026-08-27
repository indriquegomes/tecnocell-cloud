-- Chave Pix e titular na conta, pra sair na cobrança do cliente.
--
-- Hoje as meninas cobram fiado na mão pelo WhatsApp: mandam o card da dívida
-- e, separado, um contato com o Pix. O sistema não guardava chave Pix em
-- lugar nenhum, então a cobrança automática (que já existe na tela de Fiados)
-- saía sem o Pix e ninguém usava.
--
-- Mora na CONTA, não em Configurações, porque conta já é por loja: cliente de
-- Teresópolis recebe a chave da conta "PIX Teresópolis" sem ninguém escolher.
--
-- titular = o nome que aparece pro cliente ao pagar. Fica explícito de
-- propósito: hoje o Pix da loja está em nome de terceiro ("TAN SHAOJUN"), e
-- cliente que vê nome diferente do da loja desconfia de golpe. Deixando o
-- campo visível, quem cadastra vê o que o cliente vai ver.
alter table contas add column if not exists chave_pix text;
alter table contas add column if not exists titular   text;

comment on column contas.chave_pix is 'Chave Pix desta conta — sai na cobrança do cliente';
comment on column contas.titular   is 'Nome que aparece pro cliente ao pagar o Pix desta conta';
