-- Origem do movimento de caixa: 'financeiro' (botão "Pago" do Financeiro) ou
-- 'pdv' (recebimento de fiado no PDV). Antes o PDV não ligava lancamento_id;
-- agora liga (pra auditoria de qual fiado/loja gerou o movimento). Sem origem,
-- o "Desfazer pagamento" do Financeiro apagaria TAMBÉM o movimento do PDV e
-- tiraria dinheiro real da gaveta.
alter table public.movimentos_caixa
  add column if not exists origem text;

-- Movimentos antigos com lancamento_id foram todos criados pelo Financeiro
-- (o PDV só passou a gravar lancamento_id agora). Marca pra preservar o botão
-- "Desfazer" deles.
update public.movimentos_caixa
   set origem = 'financeiro'
 where lancamento_id is not null
   and origem is null;
