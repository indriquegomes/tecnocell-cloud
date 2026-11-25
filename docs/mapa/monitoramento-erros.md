# Monitoramento de erro em uso

Como o sistema descobre sozinho que algo deu errado na mão de quem estava
trabalhando — e como o dono fica sabendo na hora.

## Peças

| Peça | Onde | O que faz |
|---|---|---|
| `erros_app` | banco | Uma linha por problema: hora, tela, título curto, quem usava (`usuario_id`). RLS ligado **sem policy** — só a service role lê |
| `lib/erros.ts` | código | `registrarErro()` — grava, nunca lança. Texto saneado em `lib/erros-texto.ts` |
| `POST /api/erros` | rota | Recebe o problema do navegador (sendBeacon). Aberta de propósito: erro no login também conta |
| `components/MonitorErros.tsx` | layout raiz | Escuta `window.onerror` e `unhandledrejection` em toda tela |
| `app/error.tsx`, `app/painel/error.tsx` | telas de erro | Erro de componente também é enviado (o React não passa pelo `window.onerror`) |
| `GET /api/vigia/erros` | rota + cron 10 min (24h) | Agrupa o que chegou, avisa **uma vez** no grupo privado do dono, marca `avisado_em` **só do que o Telegram aceitou**, e grava a hora da passada (`configuracoes` → `erros_vigia`) |
| Descoberta do destino | dentro do vigia | O dono **não digita `chat_id`**: ou cria o grupo com "erro" no nome e põe o bot dentro, ou só manda um "oi" para o bot. O vigia lê `getUpdates`, prefere grupo com "erro" no título, aceita conversa direta como alternativa (o bot é dedicado) e salva em `configuracoes` → `erros_chat`. Ao achar, manda uma mensagem única de "monitoramento conectado" |
| `GET /api/erros/novos` | rota (master) | Contagem da última hora para o **alerta na tela** |
| `components/AlertaErros.tsx` | layout do painel (só master) | Aviso no canto da tela: "2 problemas na última hora" + link para a Saúde. Consulta de minuto em minuto |
| Tela Saúde do sistema | `/painel/saude` | Bloco "Telas com problema hoje" + "último check do vigia: há X min" (master-only) |

## Mensagem só quando há problema

Não existe resumo diário. Telegram que manda "está tudo bem" toda noite treina a
pessoa a ignorar o grupo — e o dia em que houver problema real a mensagem passa
despercebida. **Silêncio = nada aconteceu.** A prova de vida do vigia (hora da
última passada) aparece na tela Saúde, que é onde se vai olhar quando se quer
saber, não no bolso de quem trabalha.

## Aviso só no horário da loja

O cron roda **24h** (144 chamadas por dia, uma consulta vazia na maioria — custo
irrelevante perto do cron de 1 minuto que o projeto já tem), mas **a mensagem só
sai com a loja funcionando** (`dentroDoHorarioDeAviso`, testado nas bordas):

- abre **08:00**;
- fecha na hora configurada em `configuracoes.pdv` (a mesma do aviso de caixa),
  **com folga de 90 min** — problema na hora de fechar a gaveta ainda avisa;
- **domingo em silêncio**.

Fora do horário o erro **continua sendo gravado** (aparece na tela Saúde) e é
anunciado na primeira passada depois de abrir: a janela de leitura começa no
último envio bem-sucedido (`inicioDaJanela`), então o atrasado da madrugada entra
com a contagem de ocorrências, e nada se perde.

Quem quiser mexer nisso: `ABRE_MIN` e `FOLGA_FECHAMENTO_MIN` em
`lib/vigia-erros.ts`. A marca `erros_vigia.fora_de_horario` mostra na tela se o
vigia está em horário de aviso ou pausado.

## Três regras que não podem ser quebradas

1. **Nada de dado de cliente.** Nome, valor, CPF, telefone e IMEI não entram:
   `limparTexto` apaga sequência de 6+ dígitos e documento/telefone formatado, e
   o título é curto por desenho.
2. **Mesmo problema não avisa de novo antes de 1 hora** (`SILENCIO_MIN`). O
   silêncio é lido do `avisado_em` das linhas que **foram** anunciadas — linha de
   grupo silenciado não é marcada, senão o silêncio se renovaria para sempre e um
   defeito que dura o dia inteiro seria anunciado uma única vez. Aviso repetido
   faz a equipe parar de ler — foi o que aconteceu com o comprovante PIX em
   19/11/2026.
2b. **`avisado_em` só é marcado quando o Telegram aceitou.** Marcar mesmo com o
   envio falho enterraria o aviso em silêncio: a linha nunca voltaria a ser
   selecionada e ninguém saberia do problema.
3. **O título do aviso é estável por tipo** (`Tela não carregou (TypeError)`), não
   pela mensagem. Mensagem muda a cada ocorrência e, como o agrupamento é pelo
   título, cada variação viraria um aviso novo. O texto completo fica no campo
   `mensagem` e aparece na tela Saúde.
4. **Pessoa sempre pelo nome completo**: o aviso busca `perfis.nome` pelo
   `usuario_id`. Sem o nome, não cita ninguém — nunca mostra login.
5. **Volume travado em três lugares**: o navegador manda no máximo 5 por tela e
   1 por minuto do mesmo problema; a rota aceita 20 por minuto por IP; o vigia
   agrupa e respeita 1 hora. Histórico é apagado sozinho aos 60 dias.

## Quem vê

Só o master. A tela mora em `/painel/saude` (`'master'` em `lib/permissoes.ts`),
e o aviso vai para o grupo privado do Telegram (`TELEGRAM_GRUPO_ERROS`), nunca
para o grupo da loja.

## Onde mora o token do bot

Ordem de leitura (`lib/segredos.ts`):

1. **Variável de ambiente** `TELEGRAM_TOKEN_ERROS` (padrão do projeto).
2. **Tabela `segredos`** (chave `telegram_token_erros`) — alternativa usada quando a
   variável não está cadastrada no ambiente. Criada em 25/11 e já com o token do
   @Tecnocellerros_bot gravado.
3. `TELEGRAM_TOKEN_PETROPOLIS` como último recurso — **não serve** para entregar o
   aviso: outro bot não pode falar no chat privado do bot de erro.

A tabela `segredos` tem RLS ligado e **zero policy** de propósito: `configuracoes`
é legível por qualquer pessoa logada (policy `auth_config`), então token lá vazaria
para a equipe. Conferido com a chave anon: leitura volta **vazia**; com service role
volta a linha. Nada de segredo é enviado ao navegador nem aparece em tela.

Quando a variável na Vercel for cadastrada, ela passa a valer automaticamente (vem
primeiro) e a linha da tabela pode ser apagada.

## Variáveis de ambiente (Vercel)

- `TELEGRAM_TOKEN_ERROS` — token do bot que manda o aviso. **Opcional** enquanto a
  linha existir em `segredos`; recomendado cadastrar (variável é o lugar certo de
  segredo, e não depende de banco).
- `TELEGRAM_GRUPO_ERROS` — **opcional**. Serve para fixar o destino à mão; sem
  ela o vigia descobre o grupo/conversa sozinho.
- `CRON_SECRET` — se existir, é exigido como `Authorization: Bearer` no vigia
  (é o caso em produção: sem o Bearer a rota responde 401).

## Por que a descoberta pode falhar

`getUpdates` responde **409** quando o bot tem webhook ativo. Os bots das lojas
(comprovante Pix) usam webhook — por isso o certo é um **bot só de erro**
(criado no @BotFather), sem webhook. Com ele a descoberta funciona; com o bot da
loja, o caminho é cadastrar `TELEGRAM_GRUPO_ERROS` à mão.

### Armadilha que já custou um teste falho

O Telegram devolve `type` / `title` / `first_name`. Se o código traduzir isso no
tipo (`tipo`, `titulo`) e **ler o JSON cru**, todo campo vem `undefined`, a
descoberta "não acha nada" e o aviso nunca sai — mesmo com dois updates na mão.
A tradução vive em `mapearChats()` (lib/vigia-erros.ts) e tem teste com o formato
real do Telegram. Não inlinar essa leitura de volta na rota.

## Quando nada é gravado

Se a migration não estiver aplicada, o console do servidor mostra
`[erros] não gravou: Could not find the table 'public.erros_app'` a cada erro
recebido — é o alarme de que o monitoramento está cego, e não de que o sistema
está são.

## Ponto de atenção

Tabela `erros_app` só existe depois de aplicar
`supabase/migrations/2026-11-24-erros-app.sql`. Aplicada em **25/11/2026** pela
API de administração do Supabase (14 colunas, RLS ligado, 0 policies, 4 índices)
e testada ponta a ponta no mesmo dia: erro de teste → vigia → mensagem no
Telegram do dono → linha marcada como avisada → teste apagado.
