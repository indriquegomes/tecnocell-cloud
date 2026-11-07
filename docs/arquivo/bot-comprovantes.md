# Bot de Comprovantes Pix (Telegram) — Handoff

> Cole este documento numa conversa nova pra dar contexto completo do bot.
> Última atualização: 28/07/2026. **Estado atual: DESLIGADO (manual).**

## 1. O que é
Bot que **confere os Pix do dia por comprovante**. As atendentes mandam os comprovantes
(foto / PDF / link) nos grupos do Telegram; o bot **lê valor e destinatário com IA** e
**soma numa planilha do Google Sheets** — pra bater o total de Pix sem contar na mão.

**2 lojas / 2 grupos:** Petrópolis e Teresópolis. **Regra de ouro: o GRUPO define a loja**
(comprovante postado no grupo X é da loja X, nunca mover por destinatário).

## 2. Arquitetura / fluxo
1. Atendente manda comprovante no grupo →
2. **Telegram → webhook na Vercel** → grava no banco como `recebido`.
3. **Leitura (IA Haiku):** 2 leituras + desempate no valor → valor, cliente (quem pagou),
   destinatário (quem recebeu), `transacao_id` (E2E), data.
4. **Dedup** por `transacao_id` (mesmo Pix 2x conta 1x).
5. **Agrupa por destinatário** + **escreve na planilha** (uma aba por loja), com total e
   avisos (⚠️ valor incerto / data ≠ hoje / duplicado / não lido).

## 3. Código
- **Arquivo único:** `app/api/telegram/comprovante/route.ts` (Next.js 16, App Router).
- Funções-chave: `processa` (pipeline por mensagem), `extraiUm` (leitura IA, 2 chamadas +
  best-of-3), `deduplica` (por tx, por período), `escreveSheet` (Google Sheets via REST+JWT),
  `agrupaPorDestino` (union-find nome+CNPJ), `fechar`/`abrir`, `processaReenvio`/`processaReler`
  (workers pausados que se auto-chamam via `?job=`), `reconcilaApagados` (**espelho — DESATIVADO**).
- Modelo trocável por env `COMPROVANTE_MODELO` (default `claude-haiku-4-5`). Drenagem por
  mensagem: env `COMPROVANTE_DRENA` (default 2).

## 4. Comandos
- `/abrir` — inicia o caixa; a partir daí os comprovantes contam.
- `/fechar` — encerra + resumo (total + por destinatário) + reenvia o arquivo de imagens
  (pausado, em segundo plano, se auto-chamando).
- `/revisar` — relê **todos** os comprovantes do período (pausado). *(NÃO remove mais apagados.)*

## 5. Infra + variáveis de ambiente (NOMES, não valores)
- **Vercel** (Hobby, maxDuration 60s) — recebe/processa. Projeto `tecnocell-cloud`.
- **Supabase** — banco. Tabelas: `comprovantes_pix`, `pix_periodos`.
- **Anthropic (Haiku)** — leitura das imagens.
- **Google Sheets** — planilha final (`COMPROVANTES_SHEET_ID`).
- Env: `TELEGRAM_TOKEN_PETROPOLIS`/`_TERESOPOLIS`, `TELEGRAM_GRUPO_PETROPOLIS`/`_TERESOPOLIS`,
  `TELEGRAM_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `COMPROVANTE_MODELO`, `COMPROVANTE_DRENA`,
  `GOOGLE_SA_JSON`, `COMPROVANTES_SHEET_ID`, `NEXT_PUBLIC_SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_SESSION`/`_API_ID`/`_API_HASH` (GramJS, espelho).

## 6. Banco (essencial)
- `comprovantes_pix`: `telegram_chat_id`, `telegram_message_id` (únicos juntos), `recebido_em`,
  `formato` (foto/pdf/link), `arquivo_file_id`, `arquivo_url`, `valor`, `data_pix`, `pagador`,
  `destinatario`, `transacao_id`, `status`, `extraido_raw` (JSON).
- `status`: `recebido` (não lido) · `extraido` · `data_divergente` · `incompleto` · `duplicado`
  · `ilegivel` · `nao_comprovante` · `apagado`.
- `pix_periodos`: `telegram_chat_id`, `aberto_em`, `fechado_em`, `reenvio_ativo`/`reenvio_cursor`.

## 7. 🔴 Estado ATUAL: DESLIGADO
- **Webhooks removidos** nos 2 bots (`deleteWebhook`) → o bot **não recebe nada**.
- Worker local parado. **Modo 100% manual.**
- As imagens do último caixa do **Teresópolis foram reenviadas ao grupo** (35/35).
- Última planilha: Teresópolis ~R$6.256,84 · Petrópolis ~R$1.698,00.

## 8. Como RELIGAR
1. **Anthropic:** ligar recarga automática + **girar a chave** (a atual apareceu num print).
2. Re-setar os webhooks (um por bot):
   `POST https://api.telegram.org/bot<TOKEN>/setWebhook`
   com `url=https://tecnocell-cloud.vercel.app/api/telegram/comprovante?loja=petropolis|teresopolis`
   e header/param `secret_token=<TELEGRAM_WEBHOOK_SECRET>`.
3. Testar com um comprovante sintético (POST no webhook, msg fake, cleanup) e conferir leitura.

## 9. ⚠️ Lições / armadilhas (importantes)
- **Chave Anthropic sem crédito → bot para de ler CALADO** (erro só aparece no log). Sempre
  recarga automática. Diagnóstico rápido: POST sintético no webhook + olhar `extraido_raw.ultima_falha`.
- **Espelho de apagados foi REMOVIDO.** O grupo tem mensagem que SOME sozinha (auto-delete /
  limpeza — 147 de 313 msgs sumiram). O espelho lia "msg não está no grupo" = "comprovante
  apagado" e tirava da planilha, mas **o pagamento é real** → zerou o caixa (67 comprovantes).
  **Deletar mensagem ≠ pagamento inválido.** Não reativar sem repensar totalmente.
- **Todo fetch externo precisa de timeout** (`fetchT`, 12s) — sem isso, Google/Telegram travado
  congela a função nos 60s e o comprovante fica "não lido".
- **`transacao_id`** é normalizado (só letras/números) — a IA lê com espaço/char invisível e
  furava o dedup.
- **Parser robusto** (`primeiroJson`): a IA às vezes "pensa" depois do JSON; pega o 1º `{...}`.
- **Imagem enviada como ARQUIVO** vira `document` (não `photo`) → fallback `sendPhoto`→`sendDocument`.
- **Chave do `.env.local` ≠ chave do Vercel** — podem ser contas diferentes; a do Vercel zerou.

## 10. Pendências
- 🔴 **PicPay do Felipe Gomes** (2 PDFs, 28/07 11:36) NÃO entraram no banco — o bot não recebeu.
  Investigar por quê (formato? webhook? álbum?).
- Repensar se/como remover comprovante da planilha (já que o espelho saiu) — talvez comando
  explícito, não por deleção no Telegram.
- Ideia futura: leitura 100% LOCAL (worker que puxa do banco + IA local Qwen3-VL) — testbed
  pronto em `C:\Users\usuario\projetos\teste-ia-comprovantes`.

## 11. Commits recentes relevantes (main)
`32c097b` remove espelho · `8314b13` trava anti-falso-positivo · `3e45fba` fetch timeout ·
`ac89e49` Haiku · `f0f28b6` reenvio pausado do /fechar · `09e383c` normaliza transacao_id ·
`faa9f92` parser robusto · `446b403` dedup não ressuscita apagado.
