-- "Caixa do Pix": abrir/fechar a contagem do dia pelo Telegram (/abrir e /fechar).
-- Enquanto um período está aberto (fechado_em null), os comprovantes daquele grupo
-- contam pra ele. No /fechar: total por destinatário no chat + reenvio das imagens.
create table if not exists pix_periodos (
  id text primary key,
  telegram_chat_id bigint not null,
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  aberto_por text,
  fechado_por text
);
create index if not exists idx_pix_periodos_aberto on pix_periodos (telegram_chat_id, fechado_em);
