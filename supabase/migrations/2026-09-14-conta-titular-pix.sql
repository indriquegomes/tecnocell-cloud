-- Nome do titular da conta PIX (sai na resposta do bot junto da chave).
-- Quando trocar o PIX, troca chave_pix E titular_pix na mesma conta.
alter table contas add column if not exists titular_pix text;

-- preenche o titular atual da conta "PIX"
update contas set titular_pix = 'STOR ONE LTDA' where nome = 'PIX' and (titular_pix is null or titular_pix = '');
