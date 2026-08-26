-- Achado em teste de erros (documentado em memória, corrigido agora): estornarCredito
-- (app/painel/vales-credito/actions.ts) fazia SELECT (já foi estornado? procurando um
-- texto fixo em `descricao`) + INSERT sem trava — duplo-clique quase simultâneo em
-- "Estornar" podia gerar 2 linhas de estorno, subtraindo o saldo do cliente em dobro.
--
-- Correção: coluna própria pra referenciar QUAL crédito está sendo estornado (em vez
-- de comparar texto), com índice único parcial — o próprio banco recusa um segundo
-- estorno do mesmo crédito, venha de onde vier a chamada. Já aplicada e reverificada
-- ao vivo nesta sessão (2 estornos simultâneos do mesmo crédito → só 1 aceito, o outro
-- toma 23505).
alter table creditos_clientes add column if not exists estorna_credito_id uuid references creditos_clientes(id);

create unique index if not exists creditos_clientes_estorno_unico
  on creditos_clientes (estorna_credito_id)
  where tipo = 'estorno' and estorna_credito_id is not null;
