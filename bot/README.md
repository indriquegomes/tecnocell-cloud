# Bot de Comprovantes Pix — versão LOCAL (v2)

Reescrita do zero do bot que conferia os Pix por comprovante. Roda **no PC**, por
**long polling** (sem webhook, sem Vercel), com banco **SQLite local** e a mesma
**planilha do Google** que as meninas já usam.

## Rodar

```
node bot/run.mjs          # liga o bot (Ctrl+C para parar)
node bot/testa.mjs        # teste de bancada, não toca em Telegram nem Google
node bot/testa.mjs --sheet          # escreve de verdade numa aba "TESTE" da planilha
node bot/testa.mjs --ia caminho.jpg # testa a chave da Anthropic numa imagem
```

Lê as variáveis do `.env.local` da raiz do repo (nada é copiado pra cá):
`TELEGRAM_TOKEN_PETROPOLIS/_TERESOPOLIS`, `TELEGRAM_GRUPO_PETROPOLIS/_TERESOPOLIS`,
`ANTHROPIC_API_KEY`, `COMPROVANTE_MODELO` (default `claude-haiku-4-5`),
`GOOGLE_SA_JSON`, `COMPROVANTES_SHEET_ID`.
Opcionais: `BOT_DB` (caminho do banco), `BOT_SHEET_DEBOUNCE` (ms, default 4000).

Banco em `bot/data/bot.db` (fora do git).

## Comandos no grupo

| comando | o que faz |
|---|---|
| `/abrir` | começa a contagem; a partir daí os comprovantes contam |
| `/fechar` | **lê o que faltou**, fecha, manda o resumo e reenvia o arquivo de imagens |
| `/revisar` | relê todos os comprovantes do período |
| `/status` | parcial ao vivo: total, duplicados, quantos ainda não foram lidos |

## Abas da planilha

**As abas antigas (`Petrópolis` / `Teresópolis`) continuam funcionando igual e não foram
tocadas.** O bot só criou abas **novas**, ao lado:

| aba | o que mostra |
|---|---|
| `Resumo` | as duas lojas na mesma tela: situação da contagem, total, o que falta conferir |
| `Alertas` | só o que precisa de olho humano — não lido, valor incerto, duplicado, sem destinatário |
| `Histórico` | uma linha por caixa fechado (data, loja, total, quem abriu/fechou). Cresce sozinho. |

Criar as abas novas na planilha de verdade: `node bot/testa.mjs --abas`.

## O que mudou em relação ao bot antigo (e por quê)

1. **`/fechar` não fecha mais no escuro.** Antes ele somava com comprovante não lido
   (valor `null` = R$ 0) e dizia "35 comprovantes" como se estivesse tudo certo. Agora
   ele **drena a fila antes de fechar** e, se sobrar algum, escreve em letras garrafais
   que **o total está incompleto**.
2. **A fila de leitura não trava mais.** Antes, "pendente" era quem estivesse sem valor
   **ou sem destinatário ou sem `transacao_id`** — então um comprovante lido certinho, mas
   sem E2E visível (PicPay, print cortado), voltava pra fila **pra sempre** e ocupava os
   dois únicos slots de drenagem. Agora pendente é só quem **nunca foi lido**.
3. **Erro de infra não condena mais comprovante bom.** Anthropic sem crédito / 429 / 5xx /
   rede caída não conta tentativa: agenda um retry com backoff. Só falha de **conteúdo**
   (a IA não devolve JSON legível) leva a `ilegivel` depois de 3 vezes. E se der 3 falhas
   de API em série, o bot **pausa a leitura por 5 min** e diz isso no `/status`.
4. **Rede de segurança a cada 30s.** Um tick interno relê o que ficou pendente. Não
   precisa mais chegar mensagem nova pra o bot acordar (na Vercel isso exigiria cron).
5. **Sem corrida na planilha.** Um processo, uma fila em série, e a escrita é
   **coalescida** (marca sujo → escreve uma vez). O bot antigo reescrevia a planilha
   inteira 2× por mensagem — numa rajada de fotos, dezenas de `clear`+`write` concorrentes.
6. **Sem cap de 1000 linhas.** O dedup lia o grupo inteiro pelo PostgREST, que corta em
   1000 e sem ordem definida. Em SQLite a query devolve tudo.
7. **Nada se perde se o PC cair.** O `offset` do polling só avança **depois** de processar
   a mensagem, e o reenvio do arquivo retoma do cursor salvo ao religar.
8. **Espelho de apagados continua fora.** Mensagem sumir do grupo **não** quer dizer que o
   pagamento não existe (o grupo tem auto-delete). Foi isso que zerou o caixa em 28/07.

## Auditoria por área (28/07) — bugs achados e corrigidos

Cada bug virou **teste** em `testa.mjs` (33 checagens). É esse o loop: bug achado → corrigido
→ teste que impede ele de voltar.

| área | bug | correção |
|---|---|---|
| Telegram | resumo com muitos destinatários passa de 4096 chars e o Telegram **recusa a mensagem inteira** — o fechamento não aparecia | `fatia()` quebra em pedaços por linha |
| Telegram | flood-control (429 + `retry_after`) era ignorado: mensagem perdida calada | espera o `retry_after` e repete (2×) |
| Telegram | falha de envio não aparecia em lugar nenhum | log de toda chamada que volta `ok:false` |
| Planilha | `escreveJa` **desistia calado** se já houvesse escrita em curso → `/fechar` podia deixar a planilha velha | espera a escrita em curso e escreve de novo |
| Planilha | credencial errada = retry a cada 4s pra sempre | backoff até 5 min + invalida o cache da aba |
| IA | `ultimoErro` nunca limpava: o fechamento culpava um erro já resolvido | zera quando uma leitura dá certo |
| IA | link fora do ar virava "conteúdo" e queimava tentativa até `ilegivel` | checa `r.ok` e trata como falha transitória |
| IA | anexo >5MB dava 400 e virava "ilegível" sem explicação | detecta o tamanho e diz pra reenviar como foto |
| Fluxo | comprovante mandado **com a contagem fechada** era guardado e sumia calado | o bot responde na hora (1× a cada 10 min) |
| Fluxo | reenvio do arquivo usava o período *atual*: um `/abrir` no meio fazia mandar os arquivos errados | o arquivo é do período **fechado** (`porPeriodoId`) |
| Fluxo | `/fechar` ignorava quem estava esperando backoff de rede | `forcaRetry()` antes de somar |
| Fluxo | dedup varria o grupo inteiro a cada mensagem | janela de 15 dias |
| Runtime | sem internet = erro no log a cada 5s pra sempre | backoff até 60s, loga a 1ª e a cada 10ª, avisa quando volta |
| Runtime | Ctrl+C matava no seco, WAL pendurado | espera a fila e fecha o banco |
| Runtime | nada dizia que o bot estava vivo | sinal de vida a cada 10 min com o tamanho da fila |

## Limites conhecidos

- **Depende do PC ligado.** Se a máquina dorme ou cai a internet, o bot para — e ninguém
  avisa. Os comprovantes não se perdem (o Telegram guarda os updates por ~24h e o offset
  não avançou), mas a planilha fica velha até religar.
- **O banco é local.** `bot/data/bot.db` é a única cópia do caixa. Vale copiar o arquivo
  pra outro lugar de vez em quando.
- **A chave da Anthropic precisa ter crédito.** Sem crédito o bot recebe e guarda tudo,
  mas não lê — e agora ele **fala** isso (no `/status` e no `/fechar`).
