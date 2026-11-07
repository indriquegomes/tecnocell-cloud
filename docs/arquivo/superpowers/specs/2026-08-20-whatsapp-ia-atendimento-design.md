# IA de atendimento no WhatsApp — preço e estoque

## Problema

Clientes perguntam o dia todo, pelo WhatsApp das duas lojas, a mesma coisa:
"quanto custa essa peça" e "vocês têm". Isso consome uma pessoa inteira em
copiar e colar respostas. O pedido original do usuário era uma IA que
"investiga tudo, responde cliente, analisa caixa e estoque, sugere melhoria
de lucro" — decompomos em 4 projetos independentes (ver decisão abaixo) e
este spec cobre só o primeiro e mais urgente: **responder preço e
disponibilidade automaticamente**. Os outros três (vigiar caixa, vigiar
estoque, relatório de melhoria) ficam para specs futuros, cada um com seu
próprio ciclo spec → plano → implementação.

## Decisões já tomadas (não reabrir sem motivo novo)

- **Canal:** WhatsApp das lojas (não Telegram, não Instagram). Hoje não tem
  bot nenhum ligado nele — só existe um link `wa.me` que abre o app pro
  cliente mandar mensagem manual.
- **Conexão com o WhatsApp:** automação do WhatsApp comum via QR code
  (biblioteca tipo Baileys), **não** a API oficial da Meta. O usuário já
  tentou o caminho oficial e achou caro/difícil; a IA nativa gratuita da
  Meta (WhatsApp Business AI, lançada BR fev/2026) foi descartada porque
  usa um catálogo próprio dela, desincronizado do preço/estoque real daqui.
  **Risco aceito conscientemente pelo usuário:** automação não-oficial viola
  os termos do WhatsApp; a conta pode ser banida. Mitigação no design abaixo
  reduz, não elimina, esse risco.
- **Escopo da IA:** só preço e "tem em estoque". Qualquer outro assunto
  (reclamação, horário, parcelamento, conserto) o bot ignora — a pessoa
  continua vendo a conversa no WhatsApp normal e responde como hoje.
- **Ambiguidade:** a IA nunca chuta. Se não achar o produto com confiança,
  pergunta de volta pro cliente.
- **Escala:** as duas lojas desde o início, cada uma com seu próprio
  processo/sessão/número.

## Arquitetura

Novo processo Node local, **um por loja** — dois processos, duas sessões do
WhatsApp, dois QR code (escaneados uma vez, na primeira execução). Mesmo
padrão do `bot/` que já existe pro comprovante de Pix: roda no PC da loja,
**não em Vercel** (sessão de WhatsApp precisa de conexão persistente, que
não sobrevive em function serverless).

Pasta nova: `bot-whatsapp/`, irmã de `bot/`. Reaproveita o que já existe em
`bot/lib/env.mjs` (`env()`, leitura do `.env.local` da raiz, o padrão de
config por loja em array tipo `LOJAS`) em vez de duplicar — ou, se o
`bot-whatsapp` acabar precisando de mais que meia dúzia de linhas desse
arquivo, promove essas funções pra um módulo compartilhado entre `bot/` e
`bot-whatsapp/` (decisão de implementação, não deste spec).

Biblioteca: `@whiskeysockets/baileys` (fork ativo do Baileys original) —
nova dependência, adicionada ao `package.json` da raiz. Não existe
alternativa já instalada no projeto.

## Componentes

### 1. Sessão WhatsApp por loja

Cada processo mantém sua própria sessão (pasta de credenciais local, fora do
git — mesmo tratamento que `bot/data/bot.db`). Config por loja:

```js
export const LOJAS_WHATSAPP = [
  { slug: 'petropolis', depositoId: '63d9054d59a9c829747233d4' },   // PETRÓPOLIS LOJA
  { slug: 'teresopolis', depositoId: '63e4dc8ede713ef765366d69' },  // TERESÓPOLIS LOJA
]
```

Estoque consultado é sempre o depósito **LOJA** (não o depósito ESTOQUE de
apoio) — mesma convenção que a sincronização com o Mercado Livre já usa,
por consistência: é o saldo que reflete o que dá pra vender agora.

### 2. Classificação da mensagem (Claude Haiku)

Toda mensagem de texto recebida em conversa **individual** (nunca grupo)
vai pro Claude (`claude-haiku-4-5`, mesmo modelo e mesma
`ANTHROPIC_API_KEY` já configurados em `.env.local` pro bot de
comprovante — nenhuma credencial nova). Pergunta estruturada: "isso é
pergunta de preço/disponibilidade de produto? qual produto, nas palavras do
cliente?". Resposta em JSON: `{ ehPerguntaProduto: boolean, textoBusca:
string | null }`.

Se `ehPerguntaProduto` for falso, o processo não faz nada com essa
mensagem — sem log, sem resposta. A pessoa vê a conversa no WhatsApp normal
e decide se responde.

### 3. Busca do produto

Reaproveita a lógica de busca por nome sem acento já usada em
`app/painel/integracoes/produtos/page.tsx` e
`app/painel/tabelas-preco/actions.ts` (tira acento via `charCodeAt`, compara
contra `produtos.busca_norm`), filtrando `ativo = true`. Query ao
Supabase via `createServiceClient()` — mesmo padrão do resto do projeto.

- **Um resultado, confiança alta:** responde com nome, preço
  (`produtos.preco`, formatado com `formatBRL`) e estoque daquele depósito
  (`estoque.quantidade` pro `produto_id` + `deposito_id` da loja).
  Estoque 0 ou linha ausente = "sem estoque no momento".
- **Zero ou múltiplos resultados:** responde perguntando qual modelo/opção,
  listando até 3 nomes candidatos quando houver mais de um. Nunca envia
  preço nesse caso.

### 4. Segurança da conta

- Atraso de alguns segundos antes de responder (evita padrão de bot
  respondendo instantaneamente).
- Só atua em conversa 1:1 — nunca em grupo, nunca envia mensagem não
  solicitada (sem broadcast).
- Na primeira resposta automática de cada conversa (controlado pelo log do
  passo 5), inclui uma linha fixa avisando que é um assistente automático.

`ponytail:` essas três medidas são heurísticas simples, não uma defesa
formal contra detecção de automação — se o WhatsApp ainda assim
sinalizar/bloquear a conta, o próximo passo é migrar pra um provedor
oficial (Z-API ou similar), não afinar essas heurísticas.

### 5. Registro

SQLite local via `node:sqlite` (mesmo recurso nativo que `bot/lib/db.mjs`
já usa — zero dependência nova), banco separado do `bot.db` de
comprovantes. Uma linha por troca: telefone do cliente (hash ou os
últimos 4 dígitos, não o número completo — ver Privacidade abaixo),
loja, pergunta recebida, produto buscado, resultado (respondido /
pediu esclarecimento / ignorado), texto da resposta, timestamp. Serve
pra você auditar depois se alguma resposta saiu errada, e pra saber se já
mandou o aviso de "sou automático" pra aquele número hoje.

## Privacidade

O log grava o **conteúdo** de conversas de clientes reais. Guarda o
telefone truncado (últimos 4 dígitos), não o número inteiro — suficiente
pra você reconhecer "foi aquele cliente tal" sem manter uma lista completa
de números de WhatsApp de clientes num arquivo local sem controle de
acesso. Arquivo do banco fica fora do git (`.gitignore`), mesma regra do
`bot/data/`.

## Fora de escopo (deste spec)

- Qualquer resposta que não seja preço/estoque (negociação, prazo de
  conserto, parcelamento, reclamação).
- Vigiar caixa, vigiar estoque, relatório de melhoria de lucro — specs
  próprios, depois.
- Enviar mensagem proativa (cobrança, promoção, lembrete) — este bot só
  reage, nunca inicia conversa.
- Migração pra API oficial — fica registrado aqui como próximo passo se o
  volume crescer ou a conta sofrer restrição.

## Teste antes de valer pra cliente real

Antes de ligar num número de loja de verdade: rodar os dois processos
apontando pra um número de WhatsApp de teste (celular separado, não
usado por cliente nenhum), e mandar manualmente um roteiro de mensagens
cobrindo: pergunta direta com nome exato de produto existente, pergunta
com nome ambíguo (bate em mais de um produto), pergunta de produto que não
existe no catálogo, pergunta de produto existente mas sem estoque no
depósito daquela loja, e uma mensagem que não é sobre produto nenhum
(confirmar que o bot fica em silêncio). Só depois disso conectar num
número real.
