-- ID único da transação Pix (E2E / "ID da transação" do comprovante) — chave de DUPLICATA.
-- Dois comprovantes com o mesmo transacao_id = a MESMA transação → o 2º é duplicado (não soma).
-- É o jeito confiável de deduplicar (não por valor/pagador iguais, que podem ser pagamentos distintos).
alter table comprovantes_pix add column if not exists transacao_id text;
create index if not exists idx_comprovantes_transacao on comprovantes_pix (telegram_chat_id, transacao_id);
