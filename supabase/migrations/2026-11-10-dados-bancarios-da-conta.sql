-- Dados bancários da conta: banco, agência e número da conta.
--
-- Por que existe: a conta guardava só nome, chave Pix e titular. Sem o número da
-- conta não dá para amarrar o saldo do app ao extrato do banco — e foi assim que a
-- conta "PagBank" de Petrópolis ficou sem identidade (e chegou a carregar a chave de
-- um fornecedor). Com estes três campos, a conta passa a ser identificável contra o
-- extrato: banco 290 (PagSeguro), agência 0001, conta 74488464-4.

alter table public.contas add column if not exists banco text;
alter table public.contas add column if not exists agencia text;
alter table public.contas add column if not exists numero_conta text;
