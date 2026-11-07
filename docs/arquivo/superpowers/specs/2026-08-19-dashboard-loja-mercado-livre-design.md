# Dashboard da Loja Mercado Livre — design

## Contexto

A integração real com Mercado Livre (spec
`2026-08-19-mercado-livre-integracao-design.md`) já está no ar: conectar
conta, importar anúncios, sincronizar pedido, sincronizar estoque — as 4
peças originais, todas construídas e commitadas. A conta ainda não foi
autorizada de verdade em produção (passo manual do usuário, pendente,
fora do escopo desta spec).

Faltava a tela de detalhe da loja conectada — o usuário mostrou uma
captura de tela do SIGE (ERP anterior) com o painel "Minhas Lojas", que
abre um dashboard completo por loja conectada: abas Dashboard, Meus
Anúncios, Minhas Vendas, Perguntas e Respostas, Anúncios do Catálogo, e
um contador de "mensagens de vendas não lidas" (chat pós-venda,
descoberto na própria captura, não estava nas specs anteriores).

Como é loja única (singleton, mesma regra da spec anterior), não existe
seletor de loja — a página é fixa pra a conta Mercado Livre conectada.

## Escopo — 6 partes, nesta ordem

1. **Dashboard** — visão geral, fluxo de vendas, anúncios sem estoque,
   anúncios aguardando ajuste, top 10 mais vendidos.
2. **Meus Anúncios** — lista dos anúncios importados.
3. **Minhas Vendas** — vendas do Mercado Livre, filtradas pra essa loja.
4. **Perguntas e Respostas** — pergunta pública pré-venda, responder
   pelo TecnoCell, aviso por contador.
5. **Anúncios do Catálogo** — status de concorrência de buybox.
6. **Mensagens pós-venda** — chat do pedido entre comprador e vendedor.

Cada parte é uma tarefa (ou grupo pequeno de tarefas) dentro do mesmo
plano de implementação, executada em sequência.

## Estrutura comum às 6 partes

### Rota e abas

Nova página `app/painel/integracoes/lojas/mercado-livre/page.tsx`,
alcançada a partir do card "Mercado Livre" em Minhas Lojas (o card vira
um link em vez de só mostrar texto, quando `conexaoAtual()` existe).

Um componente de abas (`AbasLojaML`, client component) mostra as 6
seções como links de navegação (`/painel/integracoes/lojas/mercado-livre`,
`.../anuncios`, `.../vendas`, `.../perguntas`, `.../catalogo`) mais o
contador de mensagens; cada aba é uma sub-rota própria (Next App Router,
`layout.tsx` compartilhado com o componente de abas + `page.tsx` por
aba). Abas de partes ainda não implementadas nesta execução do plano
não existem como rota — surgem conforme cada tarefa entrega a sua.
Evita placeholder morto (`BotaoIndisponivel`-like) pra uma tela inteira;
a navegação simplesmente não oferece o link até a aba existir.

### Autenticação/estado sem conexão

Se `conexaoAtual()` retornar null, o `layout.tsx` da seção mostra "Loja
não conectada" e não renderiza abas — mesmo tratamento das telas
existentes (Dashboard/Minhas Lojas da Central de Integrações).

## Parte 1 — Dashboard

### Painéis

- **Visão geral** (cards de contagem):
  - Anúncios importados: `count(*)` de `integracoes_mercado_livre_anuncios`.
  - Anúncios simples ativos: mesma contagem, menos os marcados
    `is_catalogo = true` (coluna adicionada na Parte 5 — até lá, mostra
    o mesmo total de "importados", não um número inventado).
  - Anúncios de catálogo ativos: `count(*) where is_catalogo = true` —
    fica em 0 até a Parte 5 existir (coluna ainda não existe → esta
    tarefa já cria a coluna com default `false`, ver abaixo).
  - Perguntas não respondidas: `count(*)` de
    `integracoes_mercado_livre_perguntas where respondida = false` —
    fica em 0 até a Parte 4 criar a tabela (guard: se a tabela não
    existir ainda nesta etapa do plano, o card não aparece — ver Notas
    de execução).
  - Mensagens não lidas: mesma lógica, tabela da Parte 6.

  Como o plano executa as 6 partes em sequência dentro da mesma branch,
  na prática quando a Parte 1 for implementada as tabelas de perguntas/
  mensagens ainda não existem. Solução: cada contador é uma função
  isolada que faz `try/catch` na consulta e devolve `0` se a tabela não
  existir (`42P01`), documentado inline. Quando as Partes 4 e 6
  entregarem as tabelas de verdade, o contador passa a refletir dado
  real sem precisar tocar nesse código de novo.

- **Anúncios sem estoque**: junta `integracoes_mercado_livre_anuncios`
  (com `produto_id` preenchido) com `estoque` no depósito fixo
  Petrópolis Loja (`63d9054d59a9c829747233d4`), filtra
  `quantidade = 0`. Lista título do anúncio + código do produto.

- **Anúncios aguardando ajuste solicitado pelo Mercado Livre**: pra cada
  `ml_item_id` importado, `GET /items/{id}` (via `chamarML`), filtra
  `status = 'under_review'` (sub_status `warning` ou
  `waiting_for_patch` — confirmado na documentação oficial do Mercado
  Livre: item em revisão fica ativo com pendência de correção por até 2
  dias antes de ser ocultado). Chamada **ao vivo**, sem cache — volume
  esperado é o catálogo de uma loja pequena (centenas, não milhares de
  itens), cabe no timeout da function. Se crescer a ponto de not the
  case, ajuste é revisar depois (mesma lógica YAGNI da spec anterior).

- **Fluxo de vendas** (gráfico): agrupa `vendas` com `ml_order_id not
  null` por dia, soma `total` (faturamento) e conta linhas (quantidade),
  últimos 30 dias.

- **10 anúncios mais vendidos**: `itens_venda` das vendas com
  `ml_order_id not null`, agrupado por `produto_id`, somando
  `quantidade`, join com `integracoes_mercado_livre_anuncios` pelo
  `produto_id` pra mostrar o título do anúncio, `order by soma desc
  limit 10`.

### Coluna nova

```sql
alter table integracoes_mercado_livre_anuncios
  add column if not exists is_catalogo boolean not null default false;
```

(Antecipada aqui porque o card "Anúncios de catálogo ativos" do
Dashboard já lê essa coluna — a Parte 5 é quem passa a **preencher** o
valor de verdade; até lá fica `false` em todo mundo, o que é
honesto: nenhum anúncio foi checado ainda.)

## Parte 2 — Meus Anúncios

Nova rota `app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx`.
Lista todos os `integracoes_mercado_livre_anuncios`: título, SKU/código
do produto casado (ou "sem correspondência" em destaque), preço no ML,
estoque local no depósito Petrópolis Loja, link pro anúncio real
(`https://produto.mercadolivre.com.br/{ml_item_id}`, aberto em nova
aba). Busca por título/código reaproveitando `BuscaLista` (já existe,
usado em outras listagens do projeto).

Botão "Reimportar" reaproveita a mesma ação server-side já criada pela
spec anterior (`buscarAnunciosDoVendedor` + import), sem duplicar lógica
— só adiciona um ponto de entrada nesta tela além do que já existe em
Minhas Lojas.

## Parte 3 — Minhas Vendas

Nova rota `app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx`.
Mesma consulta que já existe em
`app/painel/integracoes/pedidos/page.tsx` (vendas com `ml_order_id not
null` + pendências de `integracoes_mercado_livre_pedidos_pendentes`) —
extraída pra uma função compartilhada em `lib/mercado-livre.ts`
(`buscarVendasML()`) consumida pelas duas telas, pra não duplicar a
query em dois arquivos.

## Parte 4 — Perguntas e Respostas

### Tabela nova

```sql
create table if not exists integracoes_mercado_livre_perguntas (
  id             uuid primary key default gen_random_uuid(),
  ml_question_id text not null unique,
  ml_item_id     text not null,
  texto          text not null,
  respondida     boolean not null default false,
  resposta_texto text,
  criado_em      timestamptz not null default now(),
  respondida_em  timestamptz
);
```

### Webhook

Mercado Livre manda notificação com `topic = "questions"` na mesma URL
de webhook já cadastrada (`/api/integracoes/mercado-livre/webhook`) —
**uma URL só, o `topic` no corpo diz qual evento é** (confirmado na
documentação: o app registra uma única callback URL e assina os tópicos
que quer receber). A rota existente já descarta qualquer `topic !=
'orders_v2'` logo no início — essa condição passa a ramificar por
`topic`, uma função por tópico (`processarPedido`, `processarPergunta`),
mesma rota, sem criar um segundo endpoint.

Ao receber `topic = "questions"`: `GET` no `resource` (retorna a
pergunta completa: `id`, `item_id`, `text`, `status`), upsert em
`integracoes_mercado_livre_perguntas` (on conflict `ml_question_id`).
Se `status != 'UNANSWERED'` (ex: já respondida por outro canal, ou
deletada), grava com `respondida = true` direto — evita mostrar como
pendente algo que já foi resolvido fora do TecnoCell.

### Responder

Nova rota `app/painel/integracoes/lojas/mercado-livre/perguntas/page.tsx`
lista `respondida = false`, ordenado por `criado_em`. Cada pergunta tem
um campo de texto + botão "Responder" (server action
`responderPerguntaML(perguntaId, texto)`):
`POST https://api.mercadolibre.com/answers` com `{question_id, text}`
via `chamarML`. Sucesso → `update` local (`respondida = true,
resposta_texto = texto, respondida_em = now()`). Falha (rede, token) →
mensagem de erro na tela, pergunta continua pendente, usuário tenta de
novo (mesmo padrão de qualquer server action do projeto — sem fila de
retry automática, YAGNI).

### Contador

`components/Sidebar.tsx` já busca `permissoesEfetivas()` no servidor
antes de renderizar — o contador de perguntas pendentes é buscado do
mesmo jeito (nova função `contarPerguntasPendentes()`, mesma
tolerância a tabela ausente descrita na Parte 1) e mostrado como um
badge numérico ao lado do item "Perguntas e Respostas" no menu lateral,
só quando `permissao: 'integracoes'` está presente e o número é `> 0`.

## Parte 5 — Anúncios do Catálogo

Amplia `integracoes_mercado_livre_anuncios`: a Parte 1 já criou
`is_catalogo`. Esta parte passa a **preencher** esse campo — no fluxo
de importação (`buscarAnunciosDoVendedor`, já existente), cada item
retornado pela API já traz `catalog_listing: boolean` e, se
verdadeiro, `catalog_product_id`. A função de import grava
`is_catalogo = item.catalog_listing` e uma coluna nova
`catalog_product_id text` (null se não for de catálogo).

```sql
alter table integracoes_mercado_livre_anuncios
  add column if not exists catalog_product_id text;
```

Nova rota
`app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx` lista só
os anúncios com `is_catalogo = true`. Pra cada um, `GET
/products/{catalog_product_id}` (via `chamarML`) — campo
`buy_box_winner.item_id` diz quem está ganhando a concorrência no
momento; compara com o `ml_item_id` do próprio anúncio pra mostrar
"Ganhando" ou "Perdendo" (se `buy_box_winner` for de outro item).
Mesma lógica de chamada ao vivo sem cache da Parte 1 (volume pequeno).

## Parte 6 — Mensagens pós-venda

### Tabela nova

```sql
create table if not exists integracoes_mercado_livre_mensagens (
  id             uuid primary key default gen_random_uuid(),
  ml_message_id  text not null unique,
  ml_pack_id     text not null,
  ml_order_id    text,
  autor          text not null,   -- 'comprador' | 'vendedor'
  texto          text not null,
  lida           boolean not null default false,
  criado_em      timestamptz not null default now()
);
```

### Webhook

Mesmo padrão da Parte 4: `topic = "messages"` na mesma rota de webhook,
mais um `case`. Resource do payload aponta pro pack; `GET
/messages/packs/{pack_id}/sellers/{ml_user_id}?tag=post_sale&mark_as_read=false`
traz o histórico da conversa. Cada mensagem do histórico traz `from.user_id`; comparado contra o
`ml_user_id` salvo em `integracoes_mercado_livre` (a nossa própria
conta) — igual é `autor = 'vendedor'`, diferente é `autor = 'comprador'`.
Grava as mensagens novas (que ainda não existem localmente, checado por
`message_id` do ML guardado numa coluna `ml_message_id text unique`,
não pela combinação pack+data) como `lida = false` quando
`autor = 'comprador'` (mensagem do vendedor não conta como não lida pra
nós mesmos).

### Tela

Nova rota
`app/painel/integracoes/lojas/mercado-livre/mensagens/page.tsx`: lista
conversas agrupadas por `ml_pack_id`, campo de resposta por conversa
(server action `responderMensagemML(packId, texto)`, `POST` no mesmo
endpoint com `from`/`to`/`text`), marca como lida ao abrir a conversa
(`update lida = true where ml_pack_id = ...`).

### Contador

Mesmo padrão do contador de perguntas (Parte 4): badge no menu lateral,
`count(*) where lida = false`.

## Fora de escopo (explicitamente)

- **Reconciliação de estoque periódica**, **preço automático**, **criar
  anúncio novo** — já fora de escopo na spec anterior, continuam fora
  aqui.
- **Tradução automática de mensagens** — a API do ML oferece campo de
  tradução; não usado nesta entrega (texto sempre em português nesta
  loja, sem necessidade).
- **Anexos em mensagens pós-venda** (fotos, notas fiscais) — só texto
  nesta entrega; a API suporta anexos, mas não há caso de uso ainda.
- **Notificação por Telegram** dos contadores (perguntas/mensagens) —
  decisão do usuário: só contador no menu do site por agora.

## Riscos identificados e como esta spec trata cada um

| Risco | Tratamento |
|---|---|
| Cards do Dashboard mostrando "0" antes das tabelas existirem (Partes 4/6 ainda não implementadas quando a Parte 1 roda) | Funções de contagem toleram tabela ausente (`try/catch` no erro `42P01`), documentado — não é bug, é o número real da etapa |
| Confundir "aguardando ajuste" com "sem estoque" | Painéis separados, fontes de dado diferentes (API ao vivo vs. join local) |
| Chamada ao vivo por item (ajuste, catálogo) ficar lenta com catálogo grande | Volume atual é de uma loja pequena; anotado como ponto de revisão se crescer, não resolvido preventivamente (YAGNI, mesmo padrão da spec anterior) |
| Webhook de perguntas/mensagens duplicar o de pedidos e cada um brigar por rota | Uma rota só, ramificada por `topic` — sem duplicar `try/catch`/parsing de corpo |
| Responder pergunta/mensagem falhar e o usuário achar que respondeu | Estado local só muda pra "respondida"/"lida" depois da confirmação da API — falha mantém pendente e mostra erro |
| Marcar mensagem como lida sem o comprador realmente ter recebido resposta | "Lida" aqui é local (equivalente a "vista pelo lojista"), não se confunde com `date_read` do lado do Mercado Livre — nomeada como tal no design pra não gerar ambiguidade |
