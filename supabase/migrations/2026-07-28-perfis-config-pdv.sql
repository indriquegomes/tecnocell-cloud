-- Config operacional por usuário (paridade SIGE: Empresas do Usuário + Config PDV)
-- lojas_permitidas: quais lojas o usuário pode operar. NULL/vazio = todas (sem restrição).
-- pdv_loja_id / pdv_deposito_id: o que já vem selecionado ao abrir o PDV.
-- caixa_numero: nº do caixa (informativo, aparece no cupom/relatório).
--
-- depósitos usam id TEXT (herança SIGE); lojas usam uuid (tabela nova).

alter table perfis
  add column if not exists lojas_permitidas uuid[],
  add column if not exists pdv_loja_id      uuid,
  add column if not exists pdv_deposito_id  text,
  add column if not exists caixa_numero     int;
