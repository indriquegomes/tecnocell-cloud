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
| Descoberta do grupo | dentro do vigia | O dono **não digita `chat_id`**: cria o grupo com nome que tenha "erro", põe o bot dentro, e o vigia lê `getUpdates`, aceita **só** grupo com "erro" no título e salva em `configuracoes` → `erros_chat` |
| `GET /api/erros/novos` | rota (master) | Contagem da última hora para o **alerta na tela** |
| `components/AlertaErros.tsx` | layout do painel (só master) | Aviso no canto da tela: "2 problemas na última hora" + link para a Saúde. Consulta de minuto em minuto |
| Tela Saúde do sistema | `/painel/saude` | Bloco "Telas com problema hoje" + "último check do vigia: há X min" (master-only) |

## Mensagem só quando há problema

Não existe resumo diário. Telegram que manda "está tudo bem" toda noite treina a
pessoa a ignorar o grupo — e o dia em que houver problema real a mensagem passa
despercebida. **Silêncio = nada aconteceu.** A prova de vida do vigia (hora da
última passada) aparece na tela Saúde, que é onde se vai olhar quando se quer
saber, não no bolso de quem trabalha.

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

## Variáveis de ambiente (Vercel)

- `TELEGRAM_TOKEN_ERROS` — token do bot que manda o aviso. **Só isto é
  obrigatório** (sem token, o vigia responde "sem token do Telegram configurado").
  Se não existir, cai em `TELEGRAM_TOKEN_PETROPOLIS`.
- `TELEGRAM_GRUPO_ERROS` — **opcional**. Serve para fixar o destino à mão; sem
  ela o vigia descobre o grupo sozinho (ver "Descoberta do grupo").
- `CRON_SECRET` — se existir, é exigido como `Authorization: Bearer` no vigia.
  Se **não** existir, a rota fica aberta (mesmo padrão dos outros crons do
  projeto): o pior que alguém consegue é disparar uma passada, que respeita o
  silêncio de 1 hora por grupo. Vale criar a variável.

## Por que a descoberta pode falhar

`getUpdates` responde **409** quando o bot tem webhook ativo. Os bots das lojas
(comprovante Pix) usam webhook — por isso o certo é um **bot só de erro**
(criado no @BotFather), sem webhook. Com ele a descoberta funciona; com o bot da
loja, o caminho é cadastrar `TELEGRAM_GRUPO_ERROS` à mão.

## Quando nada é gravado

Se a migration não estiver aplicada, o console do servidor mostra
`[erros] não gravou: Could not find the table 'public.erros_app'` a cada erro
recebido — é o alarme de que o monitoramento está cego, e não de que o sistema
está são.

## Ponto de atenção

Tabela `erros_app` só existe depois de aplicar
`supabase/migrations/2026-11-24-erros-app.sql` no SQL Editor. Sem a migration, o
sistema **não quebra** (tudo é silencioso), mas nada é gravado.
