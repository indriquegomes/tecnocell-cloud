-- UMA DATA SÓ PARA O PAGAMENTO.
--
-- NÃO APLICADA AINDA. Precisa da palavra-chave do dono e de janela fora do
-- expediente. Só age em escrita nova: nenhuma linha existente muda.
--
-- O problema que isto fecha: `lancamentos.data_pagamento` é timestamptz e hoje
-- recebe três formatos diferentes, dependendo de quem grava:
--
--   (now() at time zone 'America/Sao_Paulo')::date   -> 00:00:00+00
--        A data "de Brasília" vira meia-noite UTC, que é 21h do DIA ANTERIOR
--        em Brasília. Quem lê convertendo pra Brasília vê o dia errado.
--   new Date().toISOString()                          -> hora exata em UTC
--        Depois das 21h de Brasília cai no dia seguinte.
--   meio-dia de Brasília                              -> 15:00:00+00
--        A única forma em que TODO leitor chega no mesmo dia.
--
-- A função abaixo normaliza qualquer escrita nova para o terceiro formato,
-- preservando o DIA que o autor quis:
--
--   1. Meia-noite UTC exata = marca do cast ::date. A data UTC é a que o autor
--      digitou, então ela vira meio-dia de Brasília DELA.
--   2. Dia em Brasília diferente do dia em UTC (pagamento feito entre 21h e
--      23h59 de Brasília). Vale o dia de Brasília, porque é o dia em que o
--      dinheiro entrou de verdade.
--   3. Todo o resto já lê o mesmo dia nos dois leitores: não é tocado, para
--      não perder a hora real do pagamento.
--
-- Por que meio-dia: é o meio do dia de Brasília, longe das bordas. Qualquer
-- leitor, convertendo pra Brasília ou cortando o texto em UTC, chega no mesmo
-- dia — inclusive na virada do mês. É a mesma âncora que a maior parte dos
-- registros já usa (a maioria dos pagamentos do banco está em 15:00:00+00).
--
-- NÃO uniformizar `valor_pago` aqui de propósito: `operacao/page.tsx` usa
-- "valor_pago > 0" para saber quanto da venda foi pago como fiado DEPOIS da
-- venda. Preencher valor_pago em toda linha paga faria a tela de caixa contar
-- a venda inteira como fiado abatido. Regra de um campo por vez.

create or replace function public.normalizar_data_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia_utc date;
  v_dia_sp  date;
begin
  -- Só interessa o instante em que o lançamento passa a PAGO. Pendente e
  -- cancelado seguem como estão: mudar isso perderia data já gravada.
  if new.status is distinct from 'pago' then
    return new;
  end if;

  -- Pagou e não mandou data: o dia do pagamento é hoje, em Brasília.
  if new.data_pagamento is null then
    new.data_pagamento := ((now() at time zone 'America/Sao_Paulo')::date + time '12:00')
                          at time zone 'America/Sao_Paulo';
    return new;
  end if;

  v_dia_utc := (new.data_pagamento at time zone 'UTC')::date;
  v_dia_sp  := (new.data_pagamento at time zone 'America/Sao_Paulo')::date;

  -- Já lê o mesmo dia nos dois leitores: nada a fazer (preserva a hora real).
  if v_dia_utc = v_dia_sp then
    return new;
  end if;

  if (new.data_pagamento at time zone 'UTC')::time = time '00:00:00' then
    -- Marca do cast ::date: o dia que o autor quis é o dia em UTC.
    new.data_pagamento := (v_dia_utc + time '12:00') at time zone 'America/Sao_Paulo';
  else
    -- Pagamento real perto da meia-noite: vale o dia de Brasília.
    new.data_pagamento := (v_dia_sp + time '12:00') at time zone 'America/Sao_Paulo';
  end if;

  return new;
end;
$$;

revoke all on function public.normalizar_data_pagamento() from public, anon, authenticated;

drop trigger if exists normalizar_data_pagamento on public.lancamentos;
create trigger normalizar_data_pagamento
  before insert or update on public.lancamentos
  for each row execute function public.normalizar_data_pagamento();

-- Conferência depois de aplicar (só leitura, nada muda):
--   -- 1. nenhum pagamento NOVO deve nascer em 00:00:00+00
--   select count(*) from lancamentos
--    where status = 'pago' and updated_at > now() - interval '1 day'
--      and (data_pagamento at time zone 'UTC')::time = time '00:00:00';
--
--   -- 2. o dia em UTC e o dia em Brasília têm de bater em tudo que foi pago hoje
--   select count(*) from lancamentos
--    where status = 'pago' and updated_at > now() - interval '1 day'
--      and (data_pagamento at time zone 'UTC')::date
--          <> (data_pagamento at time zone 'America/Sao_Paulo')::date;
--
-- Os dois têm de devolver 0. As 1.847 linhas antigas em 00:00:00+00 continuam
-- como estão: corrigir registro antigo é outra migration, com backup antes.
