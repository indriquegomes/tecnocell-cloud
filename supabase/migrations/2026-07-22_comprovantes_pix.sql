-- ============================================================
-- Comprovantes de Pix via Telegram — conferência "Pix sem comprovante = furo".
--
-- comprovantes_pix: cada comprovante que cai no grupo do Telegram (foto/PDF/link).
--   valor/data/pagador são extraídos depois (IA); nome_digitado é a msg de texto que
--   vem logo APÓS o comprovante. cliente_id casa com pessoas (null até casar).
--   unique(chat_id, message_id) dá dedup — o poller pode rodar de novo sem duplicar.
--
-- apelidos_cliente: aprende que "Cabral" = cliente Atoscel. Casa nome que varia.
--
-- Tabelas NOVAS e aditivas. Não tocam em nada existente. Idempotente (IF NOT EXISTS).
-- ============================================================

create table if not exists comprovantes_pix (
  id uuid default gen_random_uuid() primary key,
  telegram_chat_id bigint,
  telegram_message_id bigint,
  recebido_em timestamptz default now(),
  formato text,                     -- foto | pdf | link | texto
  arquivo_file_id text,             -- file_id do Telegram (foto/documento)
  arquivo_url text,                 -- link do recibo (infinitepay etc.)
  valor numeric(12,2),              -- extraído depois (null até extrair)
  data_pix date,                    -- data do comprovante (extraída)
  pagador text,                     -- o "De" do comprovante (extraído)
  nome_digitado text,               -- a mensagem de texto que veio logo depois
  cliente_id text,                  -- pessoas.id (null até casar)
  status text default 'recebido',   -- recebido | extraido | conciliado | furo
  extraido_raw jsonb,               -- json bruto da extração
  unique (telegram_chat_id, telegram_message_id)
);

create table if not exists apelidos_cliente (
  id uuid default gen_random_uuid() primary key,
  apelido text not null unique,
  cliente_id text,                  -- pessoas.id
  criado_em timestamptz default now()
);

create index if not exists idx_comprovantes_recebido on comprovantes_pix (recebido_em);
create index if not exists idx_comprovantes_status on comprovantes_pix (status);
