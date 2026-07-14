-- ============================================================
-- FIADO RECEBIDO ENTRA NO CAIXA.
--
-- O buraco: a Duda cobrava R$50 de fiado em espécie, a cédula ia pra gaveta, e o caixa
-- não sabia de nada. No fechamento a contagem dava R$50 a MAIS que o esperado e o
-- sistema acusava SOBRA — culpando justamente quem tinha feito tudo certo.
--
-- A correção registra o recebimento como um movimento do caixa (tipo 'recebimento'),
-- mas o CHECK da tabela só aceitava 'reforco' e 'retirada' — o insert falhava CALADO.
-- Mesmo padrão que já mordeu no 'perda' do estoque.
-- ============================================================

alter table movimentos_caixa drop constraint if exists movimentos_caixa_tipo_check;

alter table movimentos_caixa add constraint movimentos_caixa_tipo_check
  check (tipo in ('reforco', 'retirada', 'recebimento'));
