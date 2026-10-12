-- Index pro "Desfazer" do Financeiro: acha rápido os lançamentos que geraram
-- movimento de caixa (movimentos_caixa.lancamento_id). Já aplicado no banco.
CREATE INDEX IF NOT EXISTS movimentos_caixa_lancamento_id_idx ON public.movimentos_caixa USING btree (lancamento_id);
