-- Desfazer pagamento ATOMICO: apaga o movimento do caixa e volta o lançamento
-- pra pendente numa transação só. Antes o TypeScript fazia delete + update em
-- comandos separados — se o update falhasse no meio, o movimento já tinha sumido
-- e o lançamento seguia 'pago' (gaveta e dívida ficavam inconsistentes).
create or replace function public.desfazer_pagamento_atomico(p_lancamento_id text, p_novo_pago numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from movimentos_caixa
  where lancamento_id = p_lancamento_id
    and tipo in ('recebimento', 'retirada')
    and origem = 'financeiro';

  update lancamentos
  set status = 'pendente',
      valor_pago = p_novo_pago,
      data_pagamento = null,
      forma_pagamento = null,
      comprovante_url = null,
      updated_at = now()
  where id = p_lancamento_id;
end;
$$;
