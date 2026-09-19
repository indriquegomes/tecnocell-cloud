-- Liga o movimento de caixa ao lançamento que o gerou.
--
-- A coluna movimentos_caixa.lancamento_id já existia manual em produção, mas nunca
-- foi registrada em migration nem gravada pelo código. Ela é o elo que permite o
-- "Desfazer pagamento" do Financeiro apagar o movimento certo (em vez de deixar
-- dinheiro fantasma na gaveta quando se exclui um lançamento quitado).
--
-- Em produção esta migration é no-op (coluna já existe); serve pra ambientes novos
-- e registra o índice usado pelo desfazer.
alter table public.movimentos_caixa
  add column if not exists lancamento_id text;

create index if not exists movimentos_caixa_lancamento_id_idx
  on public.movimentos_caixa (lancamento_id);
