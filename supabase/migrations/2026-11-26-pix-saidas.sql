-- ============================================================
-- Bot NOVO: PIX de SAÍDA (devolução/estorno pago para o cliente).
--
-- Tabela PRÓPRIA de propósito: o bot de comprovantes de ENTRADA
-- (`comprovantes_pix`, `app/api/telegram/comprovante/route.ts`) não é tocado por
-- este robô — nem código, nem tabela. São dois robôs com dois tokens.
--
-- O vínculo com o Financeiro fica AQUI (`lancamento_id`), não na tabela
-- `lancamentos`: assim "esta linha já tem comprovante" é uma pergunta de uma
-- coluna só, e desfazer a conciliação é apagar o vínculo — o lançamento continua
-- com o histórico dele intacto.
--
-- Aditiva e idempotente. Não altera tabela existente.
-- ============================================================

create table if not exists pix_saidas (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null,
  telegram_message_id bigint,
  telegram_user_id bigint,              -- quem mandou o print no grupo
  telegram_user_nome text,
  loja_id uuid references lojas(id),
  recebido_em timestamptz default now(),
  formato text,                         -- foto | pdf
  arquivo_file_id text,
  valor numeric(12,2),
  dia date,                             -- dia do PIX (do ID E2E quando existe)
  pagador text,                         -- quem PAGOU (nossa conta, se é saída)
  pagador_doc text,
  destinatario text,                    -- quem RECEBEU (o cliente)
  destinatario_doc text,
  transacao_id text,                    -- ID E2E: o mesmo PIX reenviado não concilia duas vezes
  status text default 'recebido',       -- recebido | extraido | ilegivel | nao_saida | conciliado | sem_par
  extraido_raw jsonb,
  -- conciliação
  lancamento_id uuid references lancamentos(id),
  conciliado_em timestamptz,
  conciliado_por text,
  unique (telegram_chat_id, telegram_message_id)
);

create index if not exists idx_pix_saidas_recebido on pix_saidas (recebido_em desc);
create index if not exists idx_pix_saidas_status on pix_saidas (status);
create index if not exists idx_pix_saidas_lancamento on pix_saidas (lancamento_id) where lancamento_id is not null;
-- mesmo PIX postado duas vezes no grupo não deve virar duas linhas conciliadas
create unique index if not exists idx_pix_saidas_transacao
  on pix_saidas (transacao_id) where transacao_id is not null and status = 'conciliado';

-- Só o service role (o bot) enxerga esta tabela. RLS sem policy = ninguém logado
-- pelo app lê/escreve; o bot usa a service key e passa por cima.
alter table pix_saidas enable row level security;
