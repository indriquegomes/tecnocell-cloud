# Bot de Comprovantes Pix — Erros, Causas e o que a v2 DEVE fazer

> Documento para passar à próxima versão do bot. Cada erro real que deu, a causa-raiz, e a
> trava que a v2 precisa ter pra não repetir. Contexto: bot lê comprovantes Pix (foto/PDF/link)
> nos grupos do Telegram (Petrópolis e Teresópolis), extrai valor+destinatário com IA e soma
> numa planilha, pra bater o total de Pix do dia sem contar na mão. **Regra de ouro: o GRUPO
> define a loja** (comprovante no grupo X é da loja X, nunca mover por destinatário).

## Tabela de erros

| # | Erro (o que deu) | Causa-raiz | O que a v2 DEVE fazer |
|---|---|---|---|
| 1 | Produção parou de ler **calada** (foto e PDF) | Chave Anthropic do Vercel era de **outra conta**, com crédito zerado. Erro só no log. | Chave única com **recarga automática**. **Alerta ativo** quando a IA falhar (mandar no grupo "⚠️ não consegui ler, crédito/erro"). Nunca falhar em silêncio. |
| 2 | Caixa **zerado** — 67 comprovantes reais marcados apagados | "Espelho" tirava da planilha o que sumia do grupo. Mas o grupo tem **auto-delete** (147/313 msgs somem sozinhas). "Msg sumiu" ≠ "pagamento inválido". | **Nunca** usar presença-no-grupo como fonte de verdade. Remoção só por **comando explícito** (ex: `/remover <id>`), nunca por deleção no Telegram. |
| 3 | Perdeu R$126 (2 Pix reais) | **Dedup por (valor+nome)** juntou 2 pagamentos iguais do mesmo cliente no mesmo dia (comum no atacado) como se fosse 1. | Dedup **SÓ por `transacao_id` (E2E)** normalizado. Sem ID nos dois, **não** afirmar duplicado — marcar "conferir", nunca somar zero. |
| 4 | Comprovante ficava "não lido" pra sempre | `fetch` externo (Google/Telegram) sem timeout **congelava a função** até os 60s da Vercel. | Timeout em **toda** chamada externa (12s). Retry com backoff. Fila de "não lido" com reprocesso automático. |
| 5 | Duplicados ressuscitavam | Agrupamento de dedup reincluía status `apagado`/`duplicado`. | Dedup ignora quem já está fora (apagado/duplicado). |
| 6 | Dois IDs iguais não batiam no dedup | `transacao_id` vinha com espaço/char invisível da leitura da IA. | Normalizar ID (só `[A-Za-z0-9]`) e validar formato E2E (`E` + 31 alfanum). |
| 7 | Parser quebrava | A IA às vezes "pensa" texto depois do JSON. | Parser que pega o **primeiro `{...}` balanceado** (respeitando strings), não `JSON.parse` cru. |
| 8 | Fotos sumiam no `/fechar` | Reenvio em massa estourava flood do Telegram + limite de 60s da função. | Reenvio **pausado/enfileirado**, worker que se auto-chama; respeitar rate-limit do Telegram. |
| 9 | Imagem não reenviava | Imagem mandada como **arquivo** vira `document`, não `photo`; `sendPhoto` falhava. | Fallback `sendPhoto` → `sendDocument`. |
| 10 | Dados de um cliente apareciam em outro comprovante | Scripts manuais de correção **contaminaram** linhas (escreveram no registro errado). | Toda escrita em comprovante faz **backup imediato** antes; correção sempre por `id` único, nunca por texto/valor. |
| 11 | Leitura "0 linhas" falsa | Query no Supabase com **coluna errada** (`remetente` em vez de `pagador`) → erro **silencioso** (`data=null`). | Sempre checar `.error` do Supabase; nunca tratar `null` como "vazio". |
| 12 | Valor lido errado (troca destinatário/pagador, centavos) | Leitura única da IA erra às vezes. | **2 leituras**; se o valor divergir, 3ª como desempate; marcar "⚠️ conferir valor" quando não bater. |

## Causas-raiz sistêmicas (o que a arquitetura da v2 tem que assumir)

1. **O grupo do Telegram NÃO é confiável como memória** — mensagens somem (auto-delete).
   O **banco é a fonte de verdade**, não o grupo. Nunca reconstruir a partir do grupo.
2. **Falha de IA/infra tem que GRITAR** — sem crédito, timeout, erro de parse: alerta no grupo
   + registro do motivo no banco (`ultima_falha`). O pior caso é parar em silêncio.
3. **Dedup só por ID de transação (E2E).** Valor+nome gera falso-duplicado e some dinheiro.
4. **Idempotência real** — mesma mensagem processada 2× não pode duplicar nem sumir; chave
   única `(chat_id, message_id)` e dedup por E2E.
5. **Conferência = comparar com o caixa por valor.** A funcionalidade mais útil provou ser
   bater a lista do bot contra a contagem real (por destinatário). A v2 deveria ter um
   "modo conciliação": cola o total/quebra do caixa e o bot aponta o que falta/sobra.
6. **Não depender de PC ligado** — o bot local caiu 3× (PC dormiu/net caiu). v2 real = na nuvem.

## Comandos (v1, manter na v2)
- `/abrir` — inicia o caixa; a partir daí conta.
- `/fechar` — encerra + resumo (total + por destinatário) + reenvia as imagens.
- `/revisar` — relê todos os comprovantes do período. *(NÃO remover apagados — espelho foi removido.)*
- **Novo sugerido:** `/remover <id>` (remoção explícita) e `/conciliar` (bater com o caixa).

## Estado atual
Bot **DESLIGADO** (webhooks removidos, modo manual). Detalhes de infra/como religar em
`docs/bot-comprovantes.md`. Incidente completo do dia em `docs/incidente-comprovantes-28-07.md`.
