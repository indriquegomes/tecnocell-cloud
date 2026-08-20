-- Corrige a FK de vendas.ml_conexao_id: a intencao original (documentada
-- na migration de 2026-08-20-mercado-livre-multiconta.sql e no design doc)
-- era "uma venda real nunca some so porque a conexao foi desconectada
-- depois". Uma FK sem "on delete" vira NO ACTION por padrao no Postgres,
-- que faz o oposto: BLOQUEIA apagar a conexao assim que ela tiver
-- qualquer venda. "on delete set null" e o que de fato preserva a venda
-- (ml_order_id continua, ela some so da visao por conexao, ja deletada).

alter table vendas drop constraint vendas_ml_conexao_id_fkey;
alter table vendas
  add constraint vendas_ml_conexao_id_fkey
  foreign key (ml_conexao_id) references integracoes_mercado_livre(id)
  on delete set null;
