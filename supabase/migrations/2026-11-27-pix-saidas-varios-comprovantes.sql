-- 27/11/2026 — uma mensagem pode trazer VÁRIOS comprovantes.
--
-- Print de conversa (WhatsApp) costuma vir com dois ou três comprovantes
-- empilhados na mesma imagem. O robô lia um único PIX e o resto desaparecia sem
-- aviso: em 27/11/2026 chegaram R$ 15,00 (Cauê) e R$ 77,00 (Larissa) na mesma
-- foto, e o grupo recebeu resposta só do segundo. O cartão da devolução também
-- chega como imagem e era lido como se fosse comprovante, criando um PIX
-- inventado com o valor do reembolso.
--
-- `ordem` diz qual comprovante da mensagem é a linha: 1, 2, 3… e 0 para o
-- cartão da devolução (a imagem que só traz os rótulos NOME DO CLIENTE EM
-- SISTEMA / VALOR DO REEMBOLSO). O vínculo com o Financeiro é por linha, então
-- cada PIX precisa da sua.
--
-- O índice antigo (chat, mensagem) passa a incluir `ordem`; o nome do constraint
-- é o que o Postgres deu ao `unique (telegram_chat_id, telegram_message_id)`.

alter table pix_saidas add column if not exists ordem int not null default 1;

alter table pix_saidas
  drop constraint if exists pix_saidas_telegram_chat_id_telegram_message_id_key;

create unique index if not exists idx_pix_saidas_msg_ordem
  on pix_saidas (telegram_chat_id, telegram_message_id, ordem);
