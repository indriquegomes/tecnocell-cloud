-- Origem da venda: separa venda do app de venda importada do SIGE.
--
-- Hoje as 42.328 vendas do SIGE estão marcadas com uso_interno = true só para ficarem
-- fora dos relatórios. O efeito colateral é que "uso interno" (consumo da loja) ficou
-- com 42 mil linhas de venda histórica e qualquer relatório desse campo vira lixo.
--
-- Esta coluna não muda nenhum número: os relatórios continuam filtrando uso_interno.
-- Ela existe para que, quando alguém quiser limpar o uso interno, tenha como separar
-- venda importada de venda do app sem depender do uso_interno.
--
-- Aplicada em 10/11/2026 pelo agente a pedido do dono.

alter table vendas add column if not exists origem text;

alter table vendas alter column origem set default 'app';

update vendas
   set origem = case when coalesce(numero, 0) >= 100000 then 'sige' else 'app' end
 where origem is null;

create index if not exists vendas_origem_idx on vendas (origem);

comment on column vendas.origem is
  'app = venda feita no TecnoCell · sige = importada do histórico do SIGE (não entra em relatório; a exclusão continua sendo por uso_interno)';
