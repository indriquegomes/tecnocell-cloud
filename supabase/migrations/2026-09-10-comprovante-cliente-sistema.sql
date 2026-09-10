-- Dono corrige o nome do comprador (nome no Pix nem sempre bate com o cliente do sistema).
alter table comprovantes_pix add column if not exists cliente_sistema text;
