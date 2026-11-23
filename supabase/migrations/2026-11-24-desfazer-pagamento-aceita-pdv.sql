-- ============================================================
-- DESFAZER PAGAMENTO — passa a valer também para recebimento baixado pelo PDV.
--
-- Antes: a RPC só apagava movimento `origem = 'financeiro'`. Quitação feita no F9 do
-- PDV tem origem 'pdv', então o botão "Desfazer" do Financeiro ficava desabilitado e
-- avisava "use a tela de recebimento (Fiados)" — tela que não tem desfazer. Na prática,
-- quitação errada no balcão só se corrigia por SQL.
--
-- Agora aceita as duas origens. As travas ficam em quem chama (action desfazerPagamento):
-- só o MESMO dia, caixa aberto, e com confirmação. Aqui é só o trabalho atômico.
--
-- Quem pode desfazer o quê continua igual: 'pagar' sempre; 'receber' só quando existe
-- movimento do caixa ligado ao lançamento (é o que prova que o dinheiro entrou).
--
-- Idempotente. Seguro reaplicar.
-- ============================================================
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
    and origem in ('financeiro', 'pdv', 'correcao');

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
