# Integração real com Mercado Livre — design

## Contexto

A Central de Integrações (spec `2026-08-18-central-integracoes-design.md`) já está
no ar, com todas as seções mostrando "não conectado". Esta spec cobre a
**primeira integração de verdade**: Mercado Livre. TecnoCell já foi
cadastrado como aplicativo no Mercado Livre Developers (Client ID/Secret
já existem em `.env.local`, não versionados). Loja é uma conta só de
Mercado Livre pra todo o negócio (não uma por loja física).

Decisões de negócio confirmadas com o usuário antes desta spec:
- Venda do Mercado Livre **conta como faturamento nas Metas** (mesmo
  tratamento de venda normal — é dinheiro real entrando, só que por outro
  canal).
- Pedido sem comprador identificável no cadastro vira **Cliente Final**
  (igual balcão sem identificar) — o nome do comprador do ML fica só como
  observação, não cria pessoa nova automaticamente.
- Estoque do Mercado Livre sai de um **depósito fixo: PETRÓPOLIS LOJA**
  (`63d9054d59a9c829747233d4`), independente de qual loja física tem a
  peça de verdade.

## Escopo — 4 peças, nesta ordem de dependência

1. **Conectar conta** (OAuth + PKCE) — autoriza o app, guarda o acesso.
2. **Importar anúncios existentes** — casa anúncio do ML com produto do
   TecnoCell pelo código/SKU.
3. **Sincronizar pedido** — pedido do Mercado Livre vira venda no
   TecnoCell (webhook).
4. **Sincronizar estoque** — toda vez que o estoque do depósito Petrópolis
   Loja mexe (venda de balcão, ajuste, venda do ML), o Mercado Livre fica
   sabendo — pra nunca vender a mesma peça duas vezes.

## Peça 1 — Conectar conta

### Tabela nova: `integracoes_mercado_livre`

```sql
create table if not exists integracoes_mercado_livre (
  id                text primary key default 'principal',  -- singleton, ver abaixo
  ml_user_id        text not null,           -- id do vendedor no Mercado Livre
  ml_nickname       text,                    -- nome de usuário/loja no ML, só exibição
  access_token      text not null,
  refresh_token     text not null,
  expira_em         timestamptz not null,
  conectado_por     text,                    -- id do usuário TecnoCell que autorizou
  conectado_em      timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
```

**Singleton de propósito**: o negócio só tem uma conta Mercado Livre, então
a tabela nunca tem mais de uma linha — `id` é sempre a constante
`'principal'`, não um uuid gerado. O callback do OAuth grava com
`upsert({ id: 'principal', ... }, { onConflict: 'id' })`. Isso evita o caso
de alguém autorizar com uma conta ML diferente por engano e o sistema
acabar com duas linhas "conectadas" ao mesmo tempo sem saber qual vale —
conectar de novo sempre **substitui** a conexão anterior, que é o
comportamento correto (só existe uma conta de verdade).

`access_token`/`refresh_token` ficam em texto puro, mesmo padrão de todo
dado sensível do banco hoje (acesso só via `createServiceClient()`, sem
RLS pública) — não há precedente de criptografia em coluna neste projeto,
não introduzir um novo padrão aqui sem necessidade.

### Fluxo OAuth (Authorization Code + PKCE)

1. Botão "Conectar" na Central de Integrações (Dashboard e Minhas Lojas)
   deixa de usar `BotaoIndisponivel` **só para Mercado Livre** — vira um
   link real: `GET /api/integracoes/mercado-livre/autorizar`.
2. Essa rota:
   - Gera `code_verifier` aleatório (43-128 chars, base64url).
   - Calcula `code_challenge = base64url(sha256(code_verifier))`.
   - Gera `state` aleatório (proteção CSRF).
   - Grava `code_verifier` e `state` num cookie **httpOnly, secure,
     SameSite=Lax, maxAge=600s** (`ml_oauth_pkce`).
   - Redireciona pra
     `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...`.
3. Usuário autoriza no Mercado Livre.
4. Mercado Livre redireciona pra
   `GET /api/integracoes/mercado-livre/callback?code=...&state=...`.
5. Essa rota:
   - Confere `state` contra o cookie — se não bater, erro.
   - Lê `code_verifier` do cookie.
   - `POST https://api.mercadolibre.com/oauth/token` com
     `grant_type=authorization_code`, `client_id`, `client_secret`, `code`,
     `redirect_uri`, `code_verifier`.
   - Recebe `access_token`, `refresh_token`, `expires_in` (segundos,
     tipicamente 21600 = 6h), `user_id`.
   - `GET https://api.mercadolibre.com/users/me` com o token novo, pra
     pegar `nickname`.
   - `upsert` em `integracoes_mercado_livre` (on conflict `ml_user_id`).
   - Apaga o cookie `ml_oauth_pkce`.
   - Redireciona pra `/painel/integracoes` com uma mensagem de sucesso.

### Renovação de token

`access_token` do Mercado Livre expira em 6h; `refresh_token` não expira
sozinho, mas é de uso único (cada refresh devolve um `refresh_token` novo
que substitui o anterior). Helper `lib/mercado-livre.ts`:

```ts
export async function tokenValido(): Promise<string> {
  // lê integracoes_mercado_livre, se expira_em - 5min <= now(), renova via
  // POST oauth/token grant_type=refresh_token, salva o par novo, devolve
  // o access_token válido. Toda chamada à API do ML passa por aqui —
  // nunca lê access_token direto do banco em outro lugar do código.
}
```

### Onde aparece

- Dashboard da Central de Integrações: card do Mercado Livre mostra
  "Conectado como {nickname}" + botão "Desconectar" em vez de "Conectar".
- Minhas Lojas: passa a listar essa conta (mesmo que as 4 sub-abas —
  Anúncios/Vendas/Perguntas/Catálogo — só entrem numa peça futura).

## Peça 2 — Importar anúncios existentes

- `GET /users/{ml_user_id}/items/search` pagina todos os `item_id` ativos
  do vendedor.
- Pra cada item, `GET /items/{item_id}` — pega `seller_custom_field` (o
  SKU que o vendedor cadastrou no anúncio) e `title`/`price`.
- Casa por **código exato**: `seller_custom_field` == `produtos.codigo`.
  Sem correspondência exata → fica de fora, listado como "sem
  correspondência" pro usuário decidir manualmente depois (não cria
  produto novo automaticamente, não casa por nome/título — evita repetir
  o problema de duplicidade já visto nesta sessão com o importador de
  planilha).
- Tabela nova: `integracoes_mercado_livre_anuncios`

```sql
create table if not exists integracoes_mercado_livre_anuncios (
  id             uuid primary key default gen_random_uuid(),
  ml_item_id     text not null unique,     -- MLB123456789
  produto_id     text references produtos(id),  -- null = sem correspondencia
  titulo_ml      text not null,
  preco_ml       numeric(12,2),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
```

- Tela em Minhas Lojas → aba "Meus Anúncios" (das 4 sub-abas do SIGE
  mapeadas na spec anterior): lista os importados, mostra o que casou e o
  que não casou.

## Peça 3 — Sincronizar pedido

### Notificação (webhook)

Mercado Livre POSTa em
`https://tecnocell-cloud.vercel.app/api/integracoes/mercado-livre/webhook`
um payload leve (`{ topic: "orders_v2", resource: "/orders/123", user_id,
sent }`) sempre que um pedido muda. **Essa URL precisa ser cadastrada
manualmente pelo usuário** no painel do app no Mercado Livre Developers,
em "Notificações" (seção separada do redirect URI de OAuth) — passo
adicional a pedir quando chegar nesta peça.

A rota do webhook processa **inline**, sem fila: o volume esperado (uma
loja pequena, poucos pedidos por dia) não justifica a complexidade de uma
fila assíncrona (YAGNI). O processamento (buscar o pedido, casar item,
chamar `finalizar_venda`) é rápido o bastante pra caber dentro do timeout
padrão de uma function da Vercel. Se o volume crescer a ponto de isso
virar problema, é uma otimização pra revisar depois — não construir agora
pra um volume que não existe ainda.

**A rota não exige autenticação** (o Mercado Livre não assina o payload
do webhook). Isso é seguro por construção: o corpo da notificação só diz
"olha esse `resource`" — a rota nunca confia em dado vindo do POST em si,
sempre busca a verdade direto na API do Mercado Livre com o nosso token.
Um POST forjado só consegue apontar pra um pedido que já existe de
verdade (harmless — reprocessa, a trava de idempotência barra duplicata)
ou um recurso que não existe/não é nosso (a API do ML recusa). Única
defesa extra: descarta rápido qualquer `topic` diferente de `orders_v2`
sem gastar chamada à API, pra não desperdiçar limite de requisição em
lixo.

**Caixa não precisa estar aberto.** Conferido no código do
`finalizar_venda`: a função não checa caixa nenhum — quem amarra a venda
ao caixa aberto é um passo *depois* do RPC, só no fluxo do PDV (ver
`app/painel/pdv/actions.ts`). O fluxo do Mercado Livre nunca dá esse
passo, então funciona mesmo com a loja fechada ou o caixa de Petrópolis
sem abrir ainda — correto, porque venda no Mercado Livre acontece a
qualquer hora, loja física aberta ou não.

1. Responde `200` pro Mercado Livre assim que o processamento abaixo
   terminar (sem fila — ver acima).
2. Quando `topic = "orders_v2"`: `GET` no `resource` com o token válido,
   pega o pedido completo (itens, comprador, valor, status).
3. Se `order.status == "paid"` e ainda não existe venda pra esse
   `order.id` (checar por uma coluna `ml_order_id` nova em `vendas`):
   - Casa cada item do pedido por `ml_item_id` →
     `integracoes_mercado_livre_anuncios.produto_id`. Item sem
     correspondência → pedido inteiro fica pendente de revisão manual
     (não usa `finalizar_venda` com produto incerto).
   - Chama `finalizar_venda(p_itens=..., p_pagamentos=[{forma_pagamento_id:
     'FP_MERCADOLIVRE', valor: total, taxa: 0, status: 'pago'}],
     p_pessoa_id=null, p_desconto=0, p_observacoes='Pedido ML #{order.id}
     — comprador: {nickname do comprador}', p_deposito_id='<Petrópolis
     Loja>')`.
   - **Não** faz o UPDATE de `caixa_id` que o PDV faz — a venda do ML
     nunca entra na conferência de caixa físico.
   - Grava `vendas.ml_order_id = order.id` (coluna nova) pra idempotência
     (webhook duplicado não cria venda duplicada).
4. **Se `finalizar_venda` falhar** (ex: estoque local zerado por alguma
   divergência, produto sem correspondência) — o pedido já aconteceu de
   verdade no Mercado Livre, não tem como "desacontecer" daqui. A rota
   grava o pedido em `integracoes_mercado_livre_pedidos_pendentes` (id do
   pedido, motivo do erro, payload) em vez de deixar o erro sumir num log
   que ninguém olha, e ainda responde `200` pro Mercado Livre (reenviar
   não vai resolver uma falta de estoque real — é revisão manual, não
   retry automático). Esses pedidos pendentes aparecem em "Meus Pedidos"
   com um status visível de "precisa revisar".

### Forma de pagamento nova

```sql
insert into formas_pagamento (id, nome, ativo, tipo)
values ('FP_MERCADOLIVRE', 'Mercado Livre', true, 'marketplace')
on conflict (id) do update set nome = excluded.nome, ativo = true, tipo = excluded.tipo;
```

`tipo = 'marketplace'` — **não** entra no `not in ('fiado', 'vale_credito')`
de `dashboard_faturamento_metas`, então conta como faturamento normal
(decisão confirmada com o usuário). Status do pagamento = `'pago'` (é
dinheiro que já foi liquidado pro vendedor pelo Mercado Livre/Mercado
Pago) — mesmo filtro de "dinheiro real" que o resto do sistema já usa.

### Coluna nova em `vendas`

```sql
alter table vendas add column if not exists ml_order_id text unique;
```

### Tabela nova: `integracoes_mercado_livre_pedidos_pendentes`

Pedidos que o Mercado Livre confirmou como pagos mas que `finalizar_venda`
não conseguiu processar (estoque insuficiente, item sem correspondência
de produto) — ficam aqui pra revisão manual, nunca somem silenciosamente.

```sql
create table if not exists integracoes_mercado_livre_pedidos_pendentes (
  id            uuid primary key default gen_random_uuid(),
  ml_order_id   text not null unique,
  motivo        text not null,       -- ex: "Estoque insuficiente", "Item sem produto correspondente"
  payload       jsonb not null,      -- pedido completo, pra reprocessar manualmente sem consultar o ML de novo
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now()
);
```

## Peça 4 — Sincronizar estoque

A regra que motivou tudo isso: **nunca vender a mesma peça duas vezes**.

- **TecnoCell → Mercado Livre** (o caminho crítico): toda vez que
  `estoque.quantidade` muda pro depósito Petrópolis Loja E o produto tem
  uma linha em `integracoes_mercado_livre_anuncios` com `produto_id`
  preenchido, `PUT /items/{ml_item_id}` com a nova `available_quantity`.
  Ponto de disparo: dentro do `movimentar_estoque` e do `finalizar_venda`
  não dá (são RPCs em SQL puro, sem acesso à API HTTP do Mercado Livre) —
  o disparo tem que ser na camada de aplicação (Next.js), logo depois de
  qualquer chamada a essas RPCs que mexeu no depósito Petrópolis Loja:
  venda no PDV, devolução, ajuste manual de estoque, e a própria peça 3
  (pedido do ML entrando). Ponto único: uma função
  `sincronizarEstoqueML(produtoId)` chamada no fim de cada um desses
  fluxos — não duplicar a lógica de "tem anúncio? busca quantidade atual,
  manda pro ML" em cada call site.
- **Mercado Livre → TecnoCell**: a Peça 3 já cobre isso (pedido pago
  desconta do `estoque` via `finalizar_venda`, que é a mesma tabela que o
  PDV usa — sem contador separado).
- Rede de segurança: uma reconciliação periódica (fora do escopo do
  código desta spec — fica anotado como próximo passo depois que as 4
  peças estiverem funcionando um tempo) que compara `estoque` local com
  `available_quantity` do ML e avisa se divergir, pro caso de webhook
  perdido.

## Fora de escopo (explicitamente)

- **Preço automático**: não empurra `produtos.preco` pro Mercado Livre
  nesta entrega. Preço do anúncio continua sendo editado manualmente lá.
- **Criar anúncio novo a partir do TecnoCell**: só importa/sincroniza
  anúncios que já existem no Mercado Livre. Publicar produto novo como
  anúncio novo é projeto futuro, separado.
- **Reconciliação periódica automática** (mencionada acima como rede de
  segurança) — desenhada, não implementada nesta entrega.
- **Mensagens automáticas, Perguntas e Respostas** — ficam pra quando as
  4 peças centrais estiverem estáveis.
- **Multi-conta / conta por loja** — só uma conta ML pro negócio todo.

## Riscos identificados e como esta spec trata cada um

| Risco | Tratamento |
|---|---|
| Venda do ML aparecer na conferência de caixa físico | `finalizar_venda` não amarra a venda ao caixa — só o código do PDV faz isso, e o fluxo do ML nunca chama esse passo |
| Vender a mesma peça 2x (balcão + ML) | Mesma tabela `estoque`, mesma trava `for update` do `finalizar_venda`/`movimentar_estoque` — sincronização de estoque empurra a quantidade real pro ML depois de cada mudança |
| Webhook duplicado criar venda duplicada | `vendas.ml_order_id unique` + checa existência antes de chamar `finalizar_venda` |
| Importar anúncio errado por nome parecido | Casamento só por código/SKU exato, nunca por título |
| Token expirado no meio de uma sincronização | `tokenValido()` centraliza renovação, chamado antes de toda requisição à API do ML |
| Webhook forjado (rota é pública, sem assinatura) | A rota nunca confia no corpo do POST — sempre busca a verdade na API do ML com nosso token; forjar só aponta pra pedido real (idempotente) ou inexistente (recusado pela API) |
| Pedido pago no ML mas `finalizar_venda` falha (sem estoque, item sem produto) | Nunca some — vai pra `integracoes_mercado_livre_pedidos_pendentes`, aparece em "Meus Pedidos" pra revisão manual |
| Duas contas ML conectadas sem querer (autorizou com login errado) | Tabela é singleton (`id = 'principal'`) — conectar de novo sempre substitui, nunca duplica |
