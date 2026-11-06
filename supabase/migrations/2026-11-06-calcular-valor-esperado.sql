-- Calcula o valor ESPERADO da gaveta de um caixa, direto no banco.
-- Replica o saldo da gaveta da tela de Operacao do PDV (page.tsx):
--   abertura + vendas em DINHEIRO + fiado recebido em dinheiro + reforco em
--   dinheiro - sangria em dinheiro - devolucao em dinheiro.
-- Usado no fechamento pra NAO confiar no valor que o navegador manda.
--
-- ETAPA 1: funcao criada mas ainda nao ligada ao fecharCaixa — precisa testar
-- contra caixas fechados reais antes de virar a fonte de verdade (etapa 2).
create or replace function public.calcular_valor_esperado(p_caixa_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abertura numeric := 0;
  v_vendas_dinheiro numeric := 0;
  v_fiado_dinheiro numeric := 0;
  v_reforco_dinheiro numeric := 0;
  v_retirada_dinheiro numeric := 0;
  v_devolucao_dinheiro numeric := 0;
begin
  select coalesce(valor_abertura, 0) into v_abertura
  from caixas where id = p_caixa_id;

  -- Vendas pagas em DINHEIRO (a verdade dos recebimentos e pagamentos_venda)
  select coalesce(sum(pv.valor), 0) into v_vendas_dinheiro
  from pagamentos_venda pv
  join vendas v on v.id = pv.venda_id
  join formas_pagamento fp on fp.id = pv.forma_pagamento_id
  where v.caixa_id = p_caixa_id
    and v.status = 'concluida'
    and coalesce(fp.tipo, 'outros') = 'dinheiro';

  -- Fiado recebido em dinheiro
  select coalesce(sum(valor), 0) into v_fiado_dinheiro
  from movimentos_caixa
  where caixa_id = p_caixa_id and tipo = 'recebimento'
    and lower(coalesce(forma_pagamento, '')) like '%dinheiro%';

  -- Reforco em dinheiro
  select coalesce(sum(valor), 0) into v_reforco_dinheiro
  from movimentos_caixa
  where caixa_id = p_caixa_id and tipo = 'reforco'
    and lower(coalesce(forma_pagamento, '')) like '%dinheiro%';

  -- Sangria em dinheiro
  select coalesce(sum(valor), 0) into v_retirada_dinheiro
  from movimentos_caixa
  where caixa_id = p_caixa_id and tipo = 'retirada'
    and lower(coalesce(forma_pagamento, '')) like '%dinheiro%';

  -- Devolucao em dinheiro
  select coalesce(sum(valor), 0) into v_devolucao_dinheiro
  from movimentos_caixa
  where caixa_id = p_caixa_id and tipo = 'devolucao'
    and lower(coalesce(forma_pagamento, '')) like '%dinheiro%';

  return round(v_abertura + v_vendas_dinheiro + v_fiado_dinheiro + v_reforco_dinheiro - v_retirada_dinheiro - v_devolucao_dinheiro, 2);
end;
$$;
