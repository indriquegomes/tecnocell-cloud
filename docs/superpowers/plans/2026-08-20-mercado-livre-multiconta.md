# Múltiplas Contas Mercado Livre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a integração Mercado Livre de conta única (singleton
`id='principal'`) pra suportar várias contas reais conectadas ao mesmo
tempo, sem número fixo.

**Architecture:** `integracoes_mercado_livre` vira tabela normal (uma
linha por conta), as 4 tabelas dependentes ganham `conexao_id`, `vendas`
ganha `ml_conexao_id`. O dashboard de 5(6) abas já existente move de
`.../mercado-livre/` pra `.../mercado-livre/[conexaoId]/`. Perguntas e
Mensagens do menu lateral viram caixa de entrada agregada (todas as
contas juntas).

**Tech Stack:** Next.js App Router (server components + server actions),
Supabase (service client, sem RLS), TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-20-mercado-livre-multiconta-design.md`

## Global Constraints

- Todas as contas continuam usando o mesmo depósito físico: **PETRÓPOLIS
  LOJA** (`63d9054d59a9c829747233d4`) — não muda com este plano.
- Conectar **sempre cria conta nova** (nunca sobrescreve por posição fixa)
  — upsert por `ml_user_id` (unique), nunca por `id`.
- `on delete cascade` em `conexao_id` das 4 tabelas dependentes; `vendas`
  usa `ml_conexao_id` **sem** cascade (venda real nunca some por causa de
  desconectar).
- Os 903 anúncios já importados (conta de teste, já desconectada) são
  apagados na migration — não precisam de tratamento especial.
- Toda chamada à API do Mercado Livre passa por `chamarML(conexaoId,
  path, init)` — a partir deste plano, `conexaoId` é sempre o primeiro
  argumento, nunca opcional.
- Sem fila assíncrona, sem novo pacote no `package.json` — nada neste
  plano precisa disso.

---

### Task 1: Migration — de singleton pra multi-conta

**Files:**
- Create: `supabase/migrations/2026-08-20-mercado-livre-multiconta.sql`

**Interfaces:**
- Produces: `integracoes_mercado_livre.id` vira `uuid` com múltiplas
  linhas possíveis; `ml_user_id` ganha `unique`; `conexao_id` (uuid,
  `references integracoes_mercado_livre(id) on delete cascade`) nas 4
  tabelas dependentes; `vendas.ml_conexao_id` (uuid, `references
  integracoes_mercado_livre(id)`, sem cascade). Todas as tarefas
  seguintes dependem deste schema existir.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Multiplas contas Mercado Livre — de singleton pra multi-conta
-- Ver docs/superpowers/specs/2026-08-20-mercado-livre-multiconta-design.md
-- ============================================================

-- A unica linha hoje ('principal') e a conta de teste ja desconectada
-- durante a sessao — limpa antes de mudar o formato da chave.
delete from integracoes_mercado_livre;

alter table integracoes_mercado_livre drop constraint integracoes_mercado_livre_pkey;
alter table integracoes_mercado_livre alter column id drop default;
alter table integracoes_mercado_livre alter column id type uuid using gen_random_uuid();
alter table integracoes_mercado_livre alter column id set default gen_random_uuid();
alter table integracoes_mercado_livre add primary key (id);
alter table integracoes_mercado_livre add constraint integracoes_mercado_livre_ml_user_id_key unique (ml_user_id);

alter table integracoes_mercado_livre_anuncios
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_pedidos_pendentes
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_perguntas
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_mensagens
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;

create index if not exists idx_ml_anuncios_conexao on integracoes_mercado_livre_anuncios(conexao_id);
create index if not exists idx_ml_perguntas_conexao on integracoes_mercado_livre_perguntas(conexao_id);
create index if not exists idx_ml_mensagens_conexao on integracoes_mercado_livre_mensagens(conexao_id);

alter table vendas
  add column if not exists ml_conexao_id uuid references integracoes_mercado_livre(id);
create index if not exists idx_vendas_ml_conexao on vendas(ml_conexao_id) where ml_conexao_id is not null;

-- 903 anuncios da conta de teste, sem venda associada — comeca limpo.
delete from integracoes_mercado_livre_anuncios;
```

- [ ] **Step 2: Aplicar a migration via MCP do Supabase**

Este projeto agora tem o MCP do Supabase conectado (`mcp__supabase__apply_migration`,
confirmado disponível nesta sessão). Antes de aplicar: mostrar o SQL acima
pro usuário e confirmar explicitamente ("posso aplicar essa migration
agora?") — é uma mudança estrutural em tabela de produção, não pular essa
confirmação mesmo com a ferramenta disponível. Depois de aplicar, verificar
com uma consulta própria (`mcp__supabase__execute_sql`) que:
- `integracoes_mercado_livre` está vazia (0 linhas) e sua PK é `uuid`.
- `integracoes_mercado_livre_anuncios` está vazia (0 linhas).
- As 4 colunas `conexao_id` + `vendas.ml_conexao_id` existem
  (`information_schema.columns`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-20-mercado-livre-multiconta.sql
git commit -m "Adiciona migration de multiplas contas Mercado Livre"
```

---

### Task 2: `lib/mercado-livre.ts` — todas as funções ganham `conexaoId`

**Files:**
- Modify: `lib/mercado-livre.ts` (reescrita quase completa)

**Interfaces:**
- Produces (assinaturas que TODAS as tarefas seguintes consomem):
  - `type ConexaoML = { id: string; ml_user_id: string; ml_nickname: string | null; expira_em: string }`
  - `async function listarConexoes(): Promise<ConexaoML[]>`
  - `async function buscarConexao(conexaoId: string): Promise<ConexaoML | null>`
  - `async function tokenValido(conexaoId: string): Promise<string>`
  - `async function chamarML<T>(conexaoId: string, path: string, init?: RequestInit): Promise<T>`
  - `async function buscarDetalhesEmLote(conexaoId: string, ids: string[]): Promise<ItemResp[]>`
  - `async function buscarAnunciosDoVendedor(conexaoId: string, mlUserId: string)`
  - `async function sincronizarEstoqueML(produtoId: string): Promise<void>` — **assinatura não muda**, descobre `conexaoId` sozinha via o `conexao_id` do anúncio.
  - `async function responderPerguntaML(conexaoId: string, mlQuestionId: string, texto: string): Promise<void>`
  - `async function responderMensagemML(conexaoId: string, packId: string, texto: string): Promise<void>`
  - `function urlAutorizacao(state: string, codeChallenge: string, redirectUri: string): string` — **não muda** (é antes de existir conexão).
  - `async function buscarVendasML(conexaoId?: string): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }>` — parâmetro opcional; sem ele, comportamento agregado de hoje.
  - `conexaoAtual()` — **removida**, nenhum arquivo deste plano pode continuar chamando.

- [ ] **Step 1: Reescrever o arquivo inteiro**

```ts
import { createServiceClient } from '@/lib/supabase/server'

// Cliente da API do Mercado Livre. TUDO que fala com api.mercadolibre.com
// passa por aqui — nunca lê access_token direto do banco em outro lugar.
// Múltiplas contas podem estar conectadas ao mesmo tempo — toda função
// que precisa de token recebe qual conexão usar como parâmetro, nunca
// assume "a" conexão.

const ML_API = 'https://api.mercadolibre.com'
const ML_AUTH = 'https://auth.mercadolivre.com.br'

export type ConexaoML = {
  id: string
  ml_user_id: string
  ml_nickname: string | null
  expira_em: string
}

type LinhaConexao = {
  id: string
  ml_user_id: string
  ml_nickname: string | null
  access_token: string
  refresh_token: string
  expira_em: string
}

export async function listarConexoes(): Promise<ConexaoML[]> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre')
    .select('id, ml_user_id, ml_nickname, expira_em')
    .order('conectado_em')
  return (data ?? []) as ConexaoML[]
}

export async function buscarConexao(conexaoId: string): Promise<ConexaoML | null> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre')
    .select('id, ml_user_id, ml_nickname, expira_em')
    .eq('id', conexaoId)
    .maybeSingle()
  return (data as ConexaoML | null) ?? null
}

// Devolve um access_token válido pra ESSA conexão, renovando via
// refresh_token se estiver a menos de 5min de expirar. Lança erro se a
// conexão não existir — quem chama decide o que fazer.
export async function tokenValido(conexaoId: string): Promise<string> {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('MERCADOLIVRE_CLIENT_ID/SECRET não configurados')

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from('integracoes_mercado_livre')
    .select('*')
    .eq('id', conexaoId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao ler conexão do Mercado Livre: ${error.message}`)
  const conexao = data as LinhaConexao | null
  if (!conexao) throw new Error('Conexão do Mercado Livre não encontrada')

  const expiraEm = new Date(conexao.expira_em).getTime()
  const cincoMinutos = 5 * 60 * 1000
  if (expiraEm - Date.now() > cincoMinutos) return conexao.access_token

  const resp = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conexao.refresh_token,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao renovar token do Mercado Livre: ${await resp.text()}`)
  const novo = await resp.json() as { access_token: string; refresh_token: string; expires_in: number }

  // refresh_token do ML é de uso único — se este update falhar, o banco fica
  // com o refresh_token antigo (já queimado) e a próxima renovação quebra em
  // silêncio. Por isso lança em vez de devolver o token como se tivesse persistido.
  const { error: updateError } = await supabase.from('integracoes_mercado_livre').update({
    access_token: novo.access_token,
    refresh_token: novo.refresh_token,
    expira_em: new Date(Date.now() + novo.expires_in * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq('id', conexaoId)
  if (updateError) throw new Error(`Falha ao salvar token renovado do Mercado Livre: ${updateError.message}`)

  return novo.access_token
}

// Chamada genérica autenticada à API do Mercado Livre, sempre pra uma
// conexão específica.
export async function chamarML<T>(conexaoId: string, path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido(conexaoId)
  const resp = await fetch(path.startsWith('http') ? path : `${ML_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Mercado Livre API ${resp.status}: ${await resp.text()}`)
  return resp.json() as Promise<T>
}

type BuscaItensResp = { results: string[]; paging: { total: number; offset: number; limit: number } }
export type ItemResp = {
  id: string
  title: string
  price: number
  seller_custom_field: string | null
  attributes?: { id: string; value_name: string | null }[]
  catalog_listing?: boolean
  catalog_product_id?: string | null
  status: string
  sub_status: string[]
}

type MultigetResp = { code: number; body: ItemResp }[]

// Pega os detalhes de até 20 anúncios numa chamada só (multiget da API do ML —
// GET /items?ids=... — em vez de um GET /items/{id} por item). Pra um vendedor
// com centenas de anúncios, um por um estourava o tempo da function na Vercel.
export async function buscarDetalhesEmLote(conexaoId: string, ids: string[]): Promise<ItemResp[]> {
  const resultado: ItemResp[] = []
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20)
    const respostas = await chamarML<MultigetResp>(conexaoId, `/items?ids=${lote.join(',')}`)
    for (const r of respostas) {
      if (r.code === 200) resultado.push(r.body)
    }
  }
  return resultado
}

// Busca todos os anúncios ativos do vendedor e devolve o SKU (seller_custom_field,
// ou o atributo SELLER_SKU quando o custom field vem vazio — o Mercado Livre
// migrou pra esse atributo em parte do catálogo).
export async function buscarAnunciosDoVendedor(conexaoId: string, mlUserId: string) {
  const ids: string[] = []
  let offset = 0
  const limite = 50
  while (true) {
    const pagina = await chamarML<BuscaItensResp>(
      conexaoId, `/users/${mlUserId}/items/search?offset=${offset}&limit=${limite}`
    )
    if (pagina.results.length === 0) break
    ids.push(...pagina.results)
    offset += limite
    if (offset >= pagina.paging.total) break
  }

  const detalhes = await buscarDetalhesEmLote(conexaoId, ids)
  return detalhes.map((item) => {
    const skuAtributo = item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name ?? null
    return {
      ml_item_id: item.id,
      titulo: item.title,
      preco: item.price,
      sku: item.seller_custom_field ?? skuAtributo,
      catalogo: item.catalog_listing ?? false,
      catalogProductId: item.catalog_product_id ?? null,
    }
  })
}

export const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

// Chamar depois de QUALQUER mudança em estoque do depósito Petrópolis Loja
// (venda de balcão, devolução, ajuste manual, venda do próprio Mercado
// Livre). Fire-and-forget por design: nunca deixa uma falha na API do ML
// derrubar a operação de estoque/venda que já aconteceu de verdade.
// Descobre sozinha qual conexão usar via o conexao_id do próprio anúncio
// — quem chama (PDV, devolução, estoque) nunca precisa saber nada sobre
// contas Mercado Livre.
export async function sincronizarEstoqueML(produtoId: string): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const [{ data: anuncio }, { data: estoque }] = await Promise.all([
      supabase
        .from('integracoes_mercado_livre_anuncios')
        .select('ml_item_id, conexao_id')
        .eq('produto_id', produtoId)
        .maybeSingle(),
      supabase
        .from('estoque')
        .select('quantidade')
        .eq('produto_id', produtoId)
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA)
        .maybeSingle(),
    ])
    if (!anuncio || !anuncio.conexao_id) return // produto nao tem anuncio no ML, nada a fazer

    const quantidade = Math.max(0, Math.round(estoque?.quantidade ?? 0))
    await chamarML(anuncio.conexao_id, `/items/${anuncio.ml_item_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_quantity: quantidade }),
    })
  } catch (e) {
    console.error(`Falha ao sincronizar estoque do produto ${produtoId} com o Mercado Livre:`, e)
  }
}

export async function responderPerguntaML(conexaoId: string, mlQuestionId: string, texto: string): Promise<void> {
  await chamarML(conexaoId, '/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: Number(mlQuestionId), text: texto }),
  })
}

type PackMensagensML = { messages: { from: { user_id: number } }[] }

export async function responderMensagemML(conexaoId: string, packId: string, texto: string): Promise<void> {
  // packId vem de um argumento de server action fornecido pelo cliente —
  // valida antes de interpolar na URL do chamarML.
  if (!/^\d+$/.test(packId)) throw new Error('packId inválido')

  const conexao = await buscarConexao(conexaoId)
  if (!conexao) throw new Error('Conexão do Mercado Livre não encontrada')

  // A API de mensagens pós-venda exige `to.user_id` (o comprador) — não dá
  // pra descobrir sem buscar o pack. Mesma chamada que o webhook já usa.
  const pack = await chamarML<PackMensagensML>(
    conexaoId, `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale&mark_as_read=false`
  )
  const mensagemDoComprador = pack.messages.find((m) => String(m.from.user_id) !== conexao.ml_user_id)
  if (!mensagemDoComprador) throw new Error('Não foi possível identificar o comprador deste pack de mensagens')

  await chamarML(conexaoId, `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: { user_id: Number(conexao.ml_user_id) },
      to: { user_id: mensagemDoComprador.from.user_id },
      text: texto,
    }),
  })
}

export function urlAutorizacao(state: string, codeChallenge: string, redirectUri: string): string {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID
  if (!clientId) throw new Error('MERCADOLIVRE_CLIENT_ID/SECRET não configurados')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    // Experimental: parâmetro padrão OAuth2/OIDC pra forçar a tela de login
    // mesmo com sessão ativa no navegador — não documentado pelo Mercado
    // Livre, sem garantia de que eles respeitam. Se não fizer efeito, tira
    // essa linha (não quebra o fluxo hoje, o ML deve simplesmente ignorar).
    prompt: 'login',
  })
  return `${ML_AUTH}/authorization?${params.toString()}`
}

export type VendaML = { id: string; numero: number; total: number; created_at: string; ml_order_id: string }
export type PedidoPendenteML = { id: string; ml_order_id: string; motivo: string; criado_em: string; resolvido: boolean }

// Vendas do Mercado Livre + pedidos pagos que finalizar_venda não conseguiu
// processar. Sem conexaoId: agregado de todas as contas (usado por "Meus
// Pedidos" da Central de Integrações). Com conexaoId: só dessa conta
// (usado pela aba "Minhas Vendas" do dashboard por conexão).
export async function buscarVendasML(conexaoId?: string): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }> {
  const supabase = await createServiceClient()

  let vendasQuery = supabase
    .from('vendas')
    .select('id, numero, total, created_at, ml_order_id')
    .not('ml_order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)
  if (conexaoId) vendasQuery = vendasQuery.eq('ml_conexao_id', conexaoId)

  let pendentesQuery = supabase
    .from('integracoes_mercado_livre_pedidos_pendentes')
    .select('id, ml_order_id, motivo, criado_em, resolvido')
    .eq('resolvido', false)
    .order('criado_em', { ascending: false })
  if (conexaoId) pendentesQuery = pendentesQuery.eq('conexao_id', conexaoId)

  const [{ data: vendas }, { data: pendentes }] = await Promise.all([vendasQuery, pendentesQuery])
  return {
    vendas: (vendas ?? []) as VendaML[],
    pendentes: (pendentes ?? []) as PedidoPendenteML[],
  }
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: **erros esperados nesta etapa** — todo arquivo que ainda chama
`conexaoAtual()` ou as funções com a assinatura antiga vai quebrar
(webhook, callback, Minhas Lojas, dashboard, abas, ações de responder).
Isso é esperado — as Tarefas 3-9 corrigem cada um. Confirmar que os
únicos erros são "Module has no exported member 'conexaoAtual'" ou
"Expected N arguments, but got M" nesses arquivos específicos — nenhum
erro dentro do próprio `lib/mercado-livre.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/mercado-livre.ts
git commit -m "Reescreve lib/mercado-livre.ts pra multiplas conexoes (quebra callers de proposito, corrigidos nas proximas tarefas)"
```

---

### Task 3: Rota de callback OAuth — sempre cria conexão nova

**Files:**
- Modify: `app/api/integracoes/mercado-livre/callback/route.ts`

**Interfaces:**
- Consumes: nada de `lib/mercado-livre.ts` diretamente (usa
  `createServiceClient` puro pro upsert).

- [ ] **Step 1: Trocar o upsert**

Em `app/api/integracoes/mercado-livre/callback/route.ts`, o bloco do
upsert (linhas do `supabase.from('integracoes_mercado_livre').upsert`)
troca de:

```ts
  const { error } = await supabase.from('integracoes_mercado_livre').upsert({
    id: 'principal',
    ml_user_id: String(token.user_id),
    ml_nickname: me.nickname ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    conectado_por: usuarioId,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'id' })
```

para:

```ts
  const { error } = await supabase.from('integracoes_mercado_livre').upsert({
    ml_user_id: String(token.user_id),
    ml_nickname: me.nickname ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    conectado_por: usuarioId,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'ml_user_id' })
```

Sem `id` no payload: a coluna tem `default gen_random_uuid()` (da Tarefa
1), então uma conta nova ganha um id novo sozinha; conectar a MESMA conta
de novo (mesmo `ml_user_id`) atualiza a linha existente em vez de
duplicar.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros vindos deste arquivo (o resto dos erros da
Tarefa 2 continuam até as próximas tarefas corrigirem).

- [ ] **Step 3: Commit**

```bash
git add app/api/integracoes/mercado-livre/callback/route.ts
git commit -m "Callback OAuth do ML sempre cria conexao nova (upsert por ml_user_id)"
```

---

### Task 4: Webhook — roteia por `user_id`

**Files:**
- Modify: `app/api/integracoes/mercado-livre/webhook/route.ts`

**Interfaces:**
- Consumes: `chamarML(conexaoId, path)` (Tarefa 2).
- Produces: `processarPedido`/`processarPergunta`/`processarMensagem`
  passam a receber a conexão já resolvida — nenhuma outra tarefa chama
  essas funções (são internas ao arquivo).

- [ ] **Step 1: Reescrever o arquivo**

```ts
import { createServiceClient } from '@/lib/supabase/server'
import { chamarML, DEPOSITO_PETROPOLIS_LOJA } from '@/lib/mercado-livre'
import type { NextRequest } from 'next/server'

type Notificacao = { topic: string; resource: string; user_id: number; sent: string }
type PedidoML = {
  id: number
  status: string
  total_amount: number
  buyer: { nickname: string }
  order_items: { item: { id: string }; quantity: number; unit_price: number }[]
}
type PerguntaML = { id: number; item_id: string; text: string; status: string }
type PackMensagensML = {
  messages: {
    message_id: string
    text: { plain: string }
    from: { user_id: number }
    to: { user_id: number }
  }[]
}

// ML só manda "/orders/123", "/questions/123" ou, pro topic 'messages',
// "/messages/packs/{pack_id}/sellers/{seller_id}" — qualquer coisa fora
// disso é payload não confiável (ver comentário abaixo).
const RESOURCE_VALIDO = /^\/(orders|questions)\/\d+$|^\/messages\/packs\/\d+\/sellers\/\d+$/

export async function POST(req: NextRequest) {
  let body: Notificacao
  try {
    body = await req.json()
  } catch {
    return new Response('ok', { status: 200 }) // corpo ilegível — não é nosso problema, so 200 e ignora
  }

  // `resource` vem do corpo, que qualquer um pode forjar (ML não assina o
  // payload). `chamarML` manda o token de acesso pra qualquer URL que
  // comece com "http", então sem essa validação um resource tipo
  // "https://attacker.example/x" vaza o token do Mercado Livre pro
  // atacante. Qualquer coisa fora de RESOURCE_VALIDO é tratada como
  // payload não confiável, mesmo esquema do corpo ilegível acima.
  if (!RESOURCE_VALIDO.test(body?.resource ?? '')) {
    return new Response('ok', { status: 200 })
  }

  const supabase = await createServiceClient()

  // Roteamento por conta: o próprio Mercado Livre manda o user_id do
  // vendedor dono do evento — usa isso pra achar qual das nossas
  // conexões (pode ter várias agora) é a dona da notificação.
  const { data: conexao } = await supabase
    .from('integracoes_mercado_livre')
    .select('id, ml_user_id')
    .eq('ml_user_id', String(body.user_id))
    .maybeSingle()
  if (!conexao) return new Response('ok', { status: 200 }) // conta que a gente nao tem (ou desconectou)

  try {
    if (body.topic === 'orders_v2') await processarPedido(supabase, conexao.id, body)
    else if (body.topic === 'questions') await processarPergunta(supabase, conexao.id, body)
    else if (body.topic === 'messages') await processarMensagem(supabase, conexao, body)
    return new Response('ok', { status: 200 })
  } catch (e) {
    // Falha ao buscar o pedido na API do ML, token indisponível, etc. — não
    // temos o pedido completo pra gravar pendência com dado real; loga e
    // segue. Mercado Livre não reenvia automaticamente pra topic orders_v2
    // depois de um tempo, mas reenviar não ajudaria numa falha de rede.
    console.error('Erro processando webhook do Mercado Livre:', e)
    return new Response('ok', { status: 200 })
  }
}

async function processarPedido(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  conexaoId: string,
  body: Notificacao,
) {
  const pedido = await chamarML<PedidoML>(conexaoId, body.resource)
  if (pedido.status !== 'paid') return

  const { data: jaExiste } = await supabase
    .from('vendas')
    .select('id')
    .eq('ml_order_id', String(pedido.id))
    .maybeSingle()
  if (jaExiste) return // idempotencia

  const { data: jaPendente } = await supabase
    .from('integracoes_mercado_livre_pedidos_pendentes')
    .select('id')
    .eq('ml_order_id', String(pedido.id))
    .maybeSingle()
  if (jaPendente) return

  const mlItemIds = pedido.order_items.map((i) => i.item.id)
  const { data: anuncios } = await supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, produto_id')
    .in('ml_item_id', mlItemIds)
  const produtoPorItem = new Map((anuncios ?? []).map((a) => [a.ml_item_id, a.produto_id]))

  const itemSemProduto = pedido.order_items.find((i) => !produtoPorItem.get(i.item.id))
  if (itemSemProduto) {
    await registrarPendencia(supabase, conexaoId, pedido, 'Item sem produto correspondente cadastrado')
    return
  }

  const itens = pedido.order_items.map((i) => ({
    produto_id: produtoPorItem.get(i.item.id),
    nome: i.item.id,
    quantidade: i.quantity,
    preco_unitario: i.unit_price,
  }))

  const { data, error } = await supabase.rpc('finalizar_venda', {
    p_itens: itens,
    p_pagamentos: [{ forma_pagamento_id: 'FP_MERCADOLIVRE', valor: pedido.total_amount, taxa: 0, status: 'pago' }],
    p_pessoa_id: null,
    p_desconto: 0,
    p_observacoes: `Pedido Mercado Livre #${pedido.id} — comprador: ${pedido.buyer.nickname}`,
    p_deposito_id: DEPOSITO_PETROPOLIS_LOJA,
  })

  if (error || !data) {
    await registrarPendencia(supabase, conexaoId, pedido, error?.message ?? 'finalizar_venda retornou vazio')
    return
  }

  // Sem UPDATE de caixa_id de propósito — venda do ML nunca entra na
  // conferência de caixa físico.
  await supabase.from('vendas').update({
    ml_order_id: String(pedido.id),
    ml_conexao_id: conexaoId,
  }).eq('id', data.venda_id as string)
}

async function registrarPendencia(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  conexaoId: string,
  pedido: PedidoML,
  motivo: string
) {
  await supabase.from('integracoes_mercado_livre_pedidos_pendentes').insert({
    ml_order_id: String(pedido.id),
    conexao_id: conexaoId,
    motivo,
    payload: pedido,
  })
}

async function processarPergunta(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  conexaoId: string,
  body: Notificacao,
) {
  const pergunta = await chamarML<PerguntaML>(conexaoId, body.resource)
  const { error } = await supabase.from('integracoes_mercado_livre_perguntas').upsert({
    ml_question_id: String(pergunta.id),
    ml_item_id: pergunta.item_id,
    conexao_id: conexaoId,
    texto: pergunta.text,
    // Só manda `respondida: true` quando o ML confirma que foi respondida.
    // Se vier UNANSWERED, omite a chave — o status do ML é eventualmente
    // consistente, e uma notificação atrasada não pode sobrescrever
    // `respondida: true` de uma pergunta que já respondemos aqui.
    ...(pergunta.status !== 'UNANSWERED' ? { respondida: true } : {}),
  }, { onConflict: 'ml_question_id' })
  if (error) console.error(`Falha ao salvar pergunta ${pergunta.id} do Mercado Livre:`, error)
}

async function processarMensagem(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  conexao: { id: string; ml_user_id: string },
  body: Notificacao,
) {
  // body.resource pro topic 'messages' é algo como
  // '/messages/packs/{pack_id}/sellers/{seller_id}' — extrai o pack_id.
  const packId = body.resource.split('/packs/')[1]?.split('/')[0]
  if (!packId) return

  const pack = await chamarML<PackMensagensML>(
    conexao.id, `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale&mark_as_read=false`
  )

  for (const msg of pack.messages) {
    const autor = String(msg.from.user_id) === conexao.ml_user_id ? 'vendedor' : 'comprador'
    const { error } = await supabase.from('integracoes_mercado_livre_mensagens').upsert({
      ml_message_id: msg.message_id,
      ml_pack_id: packId,
      conexao_id: conexao.id,
      autor,
      texto: msg.text.plain,
      // Mesmo caso de processarPergunta acima.
      ...(autor === 'vendedor' ? { lida: true } : {}),
    }, { onConflict: 'ml_message_id' })
    if (error) console.error(`Falha ao salvar mensagem ${msg.message_id} do pack ${packId}:`, error)
  }
}
```

Nota pro implementador: `processarMensagem` não faz mais sua própria
busca de `ml_user_id` — recebe a `conexao` já resolvida no topo de
`POST`, reaproveitando a mesma consulta que decide o roteamento (evita
duas leituras da mesma tabela).

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros vindos deste arquivo.

- [ ] **Step 3: Commit**

```bash
git add app/api/integracoes/mercado-livre/webhook/route.ts
git commit -m "Webhook do ML roteia pedido/pergunta/mensagem por user_id (multiconta)"
```

---

### Task 5: Minhas Lojas — lista de contas + desconectar por conexão

**Files:**
- Modify: `app/painel/integracoes/lojas/page.tsx`
- Modify: `app/painel/integracoes/lojas/actions.ts`
- Modify: `app/painel/integracoes/lojas/ImportarAnunciosBotao.tsx`
- Modify: `app/painel/integracoes/page.tsx`
- Delete: `app/painel/integracoes/actions.ts` (só tinha `desconectarMercadoLivre`, que muda de dono nesta tarefa)

**Interfaces:**
- Consumes: `listarConexoes()` (Tarefa 2).
- Produces: `desconectarMercadoLivre(conexaoId: string)` server action,
  agora em `app/painel/integracoes/lojas/actions.ts` — consumida só
  dentro desta tarefa (o card de Minhas Lojas).

- [ ] **Step 1: `app/painel/integracoes/lojas/actions.ts` — importar + desconectar**

```ts
'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { buscarAnunciosDoVendedor, buscarConexao } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

// Um catálogo grande ainda pode levar mais que o padrão da Vercel mesmo
// buscando em lote — 60s é o máximo permitido no plano Hobby, então é o teto
// seguro que funciona em qualquer plano sem dar erro de configuração.
export const maxDuration = 60

export async function importarAnuncios(conexaoId: string) {
  await requirePermissao('integracoes')
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) return { ok: false, casados: 0, semCorrespondencia: 0, erro: 'Conexão não encontrada.' }

  const supabase = await createServiceClient()
  const [anuncios, produtos] = await Promise.all([
    buscarAnunciosDoVendedor(conexaoId, conexao.ml_user_id),
    fetchAll<{ id: string; codigo: string | null }>((de, ate) =>
      supabase.from('produtos').select('id, codigo').range(de, ate)),
  ])

  const produtoIdPorCodigo = new Map(
    produtos.filter((p) => p.codigo).map((p) => [String(p.codigo).trim(), p.id])
  )

  let casados = 0
  let semCorrespondencia = 0
  const linhas = anuncios.map((a) => {
    const produtoId = a.sku ? produtoIdPorCodigo.get(a.sku.trim()) ?? null : null
    if (produtoId) casados++
    else semCorrespondencia++
    return {
      ml_item_id: a.ml_item_id,
      conexao_id: conexaoId,
      produto_id: produtoId,
      titulo_ml: a.titulo,
      preco_ml: a.preco,
      is_catalogo: a.catalogo,
      catalog_product_id: a.catalogProductId,
      atualizado_em: new Date().toISOString(),
    }
  })

  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase
      .from('integracoes_mercado_livre_anuncios')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'ml_item_id' })
    if (error) return { ok: false, casados, semCorrespondencia, erro: error.message }
  }

  revalidatePath('/painel/integracoes/lojas')
  return { ok: true, casados, semCorrespondencia }
}

export async function desconectarMercadoLivre(conexaoId: string) {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  await supabase.from('integracoes_mercado_livre').delete().eq('id', conexaoId)
  revalidatePath('/painel/integracoes')
  revalidatePath('/painel/integracoes/lojas')
}
```

- [ ] **Step 2: `ImportarAnunciosBotao.tsx` — recebe `conexaoId`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importarAnuncios } from './actions'

export function ImportarAnunciosBotao({ conexaoId }: { conexaoId: string }) {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const handleClick = async () => {
    setCarregando(true)
    setMensagem('')
    try {
      const res = await importarAnuncios(conexaoId)
      setMensagem(
        res.ok
          ? `${res.casados} anúncio(s) casado(s) com produto, ${res.semCorrespondencia} sem correspondência.`
          : res.erro ?? 'Erro ao importar.'
      )
    } catch (e) {
      setMensagem(
        e instanceof Error
          ? `Falha ao importar: ${e.message}`
          : 'Falha ao importar — tente de novo.'
      )
    } finally {
      setCarregando(false)
      router.refresh()
    }
  }

  return (
    <div className="space-y-2">
      <button onClick={handleClick} disabled={carregando}
        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
        {carregando ? 'Importando...' : 'Importar Anúncios'}
      </button>
      {mensagem && <p className="text-sm text-gray-600">{mensagem}</p>}
    </div>
  )
}
```

- [ ] **Step 3: `app/painel/integracoes/lojas/page.tsx` — lista de contas**

```tsx
import { IconStore, IconPlus } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { listarConexoes } from '@/lib/mercado-livre'
import { ImportarAnunciosBotao } from './ImportarAnunciosBotao'
import { desconectarMercadoLivre } from './actions'

export default async function IntegracoesLojasPage() {
  const conexoes = await listarConexoes()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
          <Dica texto="Contas Mercado Livre conectadas. Cada uma mostra anúncios, vendas, perguntas e catálogo próprios — pode conectar quantas contas precisar." />
        </div>
        <a href="/api/integracoes/mercado-livre/autorizar"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition">
          <IconPlus className="h-4 w-4" /> Conectar Mercado Livre
        </a>
      </div>

      {conexoes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Nenhuma conta conectada ainda.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {conexoes.map((c) => (
            <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <a href={`/painel/integracoes/lojas/mercado-livre/${c.id}`}
                    className="font-semibold text-gray-800 hover:text-blue-600 hover:underline">
                    Mercado Livre
                  </a>
                  <p className="text-sm text-gray-500">Conectado como {c.ml_nickname ?? c.ml_user_id}</p>
                </div>
                <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativo</span>
              </div>
              <ImportarAnunciosBotao conexaoId={c.id} />
              <form action={desconectarMercadoLivre.bind(null, c.id)}>
                <button type="submit" className="w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                  Desconectar
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Nota pro implementador: confirmar que `IconPlus` existe em
`components/icons.tsx` (já usado em outras telas, ex: botão "Nova Loja"
de `app/painel/lojas/page.tsx`) — se o nome for diferente, usar o que já
existe em vez de criar ícone novo.

- [ ] **Step 4: `app/painel/integracoes/page.tsx` — card vira resumo + link**

Trocar o import de `conexaoAtual`/`desconectarMercadoLivre` (esse último
não existe mais neste arquivo) e o bloco condicional do card ML:

```tsx
import { IconIntegracao } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { PLATAFORMAS } from '@/lib/integracoes'
import { listarConexoes } from '@/lib/mercado-livre'

export default async function IntegracoesDashboardPage() {
  const conexoes = await listarConexoes()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconIntegracao className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Integrações</h2>
        <Dica texto="Central de e-commerce, marketplace, pagamento, logística e drop shipping. Nenhuma integração está conectada ainda — cada uma vira um projeto próprio quando tiver a credencial da plataforma." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PLATAFORMAS.map((p) => {
          const isML = p.chave === 'mercado-livre'
          const temConexao = isML && conexoes.length > 0
          return (
            <div key={p.chave} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-800">{p.nome}</p>
                {temConexao ? (
                  <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {conexoes.length} conta{conexoes.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Não conectado
                  </span>
                )}
              </div>
              {isML ? (
                <a href="/painel/integracoes/lojas"
                  className="block w-full rounded-xl border border-blue-200 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50 transition">
                  {temConexao ? 'Gerenciar contas' : 'Conectar'}
                </a>
              ) : (
                <BotaoIndisponivel
                  label="Conectar"
                  className="w-full rounded-xl border border-blue-200 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Apagar o arquivo de actions que sobrou vazio de propósito**

```bash
rm app/painel/integracoes/actions.ts
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros vindos destes arquivos.

- [ ] **Step 7: Commit**

```bash
git add app/painel/integracoes/lojas app/painel/integracoes/page.tsx
git rm app/painel/integracoes/actions.ts
git commit -m "Minhas Lojas lista todas as contas ML; Central de Integracoes vira resumo + link"
```

---

### Task 6: Dashboard por conexão — move pra `[conexaoId]/`

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/layout.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/AbasLojaML.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/PainelAguardandoAjuste.tsx`
- Modify: `lib/mercado-livre-dashboard.ts`
- Delete: `app/painel/integracoes/lojas/mercado-livre/layout.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/AbasLojaML.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/PainelAguardandoAjuste.tsx`

**Interfaces:**
- Consumes: `buscarConexao(conexaoId)` (Tarefa 2).
- Produces: `buscarVisaoGeral(conexaoId)`, `buscarAnunciosSemEstoque(conexaoId)`,
  `buscarFluxoVendas(conexaoId)`, `buscarMaisVendidos(conexaoId)`,
  `buscarAnunciosAguardandoAjuste(conexaoId)` — consumidas pelas Tarefas 7-9
  também (todas as funções de `lib/mercado-livre-dashboard.ts` ganham esse
  parâmetro, mesmo as que a Tarefa 6 não usa diretamente).

- [ ] **Step 1: Reescrever `lib/mercado-livre-dashboard.ts` inteiro**

```ts
import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { diaSP } from '@/lib/utils'
import { DEPOSITO_PETROPOLIS_LOJA, buscarDetalhesEmLote } from '@/lib/mercado-livre'

async function contarTolerante(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count, error } = await query
  return error ? 0 : (count ?? 0)
}

export type VisaoGeralML = {
  anunciosImportados: number
  anunciosSimplesAtivos: number
  anunciosCatalogoAtivos: number
  perguntasNaoRespondidas: number
  mensagensNaoLidas: number
}

export async function buscarVisaoGeral(conexaoId: string): Promise<VisaoGeralML> {
  const supabase = await createServiceClient()
  const [importados, catalogo, perguntas, mensagens] = await Promise.all([
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId)),
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('is_catalogo', true)),
    contarTolerante(supabase.from('integracoes_mercado_livre_perguntas').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('respondida', false)),
    contarTolerante(supabase.from('integracoes_mercado_livre_mensagens').select('*', { count: 'exact', head: true }).eq('conexao_id', conexaoId).eq('lida', false)),
  ])
  return {
    anunciosImportados: importados,
    anunciosSimplesAtivos: importados - catalogo,
    anunciosCatalogoAtivos: catalogo,
    perguntasNaoRespondidas: perguntas,
    mensagensNaoLidas: mensagens,
  }
}

export type AnuncioSemEstoque = { titulo: string; codigoProduto: string | null; mlItemId: string }

export async function buscarAnunciosSemEstoque(conexaoId: string): Promise<AnuncioSemEstoque[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id')
      .eq('conexao_id', conexaoId)
      .not('produto_id', 'is', null)
      .range(de, ate))
  if (anuncios.length === 0) return []
  const produtoIds = anuncios.map((a) => a.produto_id as string)

  const [estoques, produtos] = await Promise.all([
    fetchAllIn<{ produto_id: string; quantidade: number }>(produtoIds, (chunk, de, ate) =>
      supabase.from('estoque').select('produto_id, quantidade')
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA).in('produto_id', chunk).range(de, ate)),
    fetchAllIn<{ id: string; codigo: string | null }>(produtoIds, (chunk, de, ate) =>
      supabase.from('produtos').select('id, codigo').in('id', chunk).range(de, ate)),
  ])
  const qtdPorProduto = new Map(estoques.map((e) => [e.produto_id, Number(e.quantidade)]))
  const codigoPorProduto = new Map(produtos.map((p) => [p.id, p.codigo]))

  return anuncios
    .filter((a) => (qtdPorProduto.get(a.produto_id as string) ?? 0) <= 0)
    .map((a) => ({
      titulo: a.titulo_ml,
      codigoProduto: codigoPorProduto.get(a.produto_id as string) ?? null,
      mlItemId: a.ml_item_id,
    }))
}

export type PontoFluxoVendas = { dia: string; faturamento: number; quantidade: number }

export async function buscarFluxoVendas(conexaoId: string): Promise<PontoFluxoVendas[]> {
  const supabase = await createServiceClient()
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const vendas = await fetchAll<{ total: number; created_at: string }>((de, ate) =>
    supabase.from('vendas').select('total, created_at')
      .eq('ml_conexao_id', conexaoId).gte('created_at', desde).range(de, ate))

  const porDia = new Map<string, { faturamento: number; quantidade: number }>()
  for (const v of vendas) {
    const dia = diaSP(v.created_at)
    const atual = porDia.get(dia) ?? { faturamento: 0, quantidade: 0 }
    atual.faturamento += Number(v.total) || 0
    atual.quantidade += 1
    porDia.set(dia, atual)
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, ...v }))
}

export type AnuncioMaisVendido = { titulo: string; mlItemId: string; quantidadeVendida: number }

export async function buscarMaisVendidos(conexaoId: string): Promise<AnuncioMaisVendido[]> {
  const supabase = await createServiceClient()
  const vendas = await fetchAll<{ id: string }>((de, ate) =>
    supabase.from('vendas').select('id').eq('ml_conexao_id', conexaoId).range(de, ate))
  if (vendas.length === 0) return []
  const vendaIds = vendas.map((v) => v.id)

  const itens = await fetchAllIn<{ produto_id: string | null; quantidade: number }>(vendaIds, (chunk, de, ate) =>
    supabase.from('itens_venda').select('produto_id, quantidade').in('venda_id', chunk).range(de, ate))

  const somaPorProduto = new Map<string, number>()
  for (const i of itens) {
    if (!i.produto_id) continue
    somaPorProduto.set(i.produto_id, (somaPorProduto.get(i.produto_id) ?? 0) + Number(i.quantidade))
  }
  const produtoIds = [...somaPorProduto.keys()]
  if (produtoIds.length === 0) return []

  // Filtra por conexao_id também: o mesmo produto pode estar anunciado em
  // mais de uma conta agora — sem isso o título mostrado podia vir do
  // anúncio errado.
  const anuncios = await fetchAllIn<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id').eq('conexao_id', conexaoId).in('produto_id', chunk).range(de, ate))

  return anuncios
    .map((a) => ({
      titulo: a.titulo_ml,
      mlItemId: a.ml_item_id,
      quantidadeVendida: somaPorProduto.get(a.produto_id as string) ?? 0,
    }))
    .sort((a, b) => b.quantidadeVendida - a.quantidadeVendida)
    .slice(0, 10)
}

export type AnuncioAguardandoAjuste = { titulo: string; mlItemId: string; subStatus: string }

// Consulta ao vivo na API, em lote (buscarDetalhesEmLote — até 20 por
// chamada, ver lib/mercado-livre.ts).
export async function buscarAnunciosAguardandoAjuste(conexaoId: string): Promise<AnuncioAguardandoAjuste[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios').select('ml_item_id').eq('conexao_id', conexaoId).range(de, ate))
  if (anuncios.length === 0) return []

  let detalhes: Awaited<ReturnType<typeof buscarDetalhesEmLote>> = []
  try {
    detalhes = await buscarDetalhesEmLote(conexaoId, anuncios.map((a) => a.ml_item_id))
  } catch (e) {
    console.error('Falha ao consultar status dos anúncios no Mercado Livre:', e)
    return []
  }

  return detalhes.flatMap((item) => {
    if (item.status !== 'under_review') return []
    const subStatus = item.sub_status.find((s) => s === 'warning' || s === 'waiting_for_patch')
    return subStatus ? [{ titulo: item.title, mlItemId: item.id, subStatus }] : []
  })
}
```

- [ ] **Step 2: Criar `[conexaoId]/AbasLojaML.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function AbasLojaML({ conexaoId }: { conexaoId: string }) {
  const base = `/painel/integracoes/lojas/mercado-livre/${conexaoId}`
  const ABAS = [
    { href: base,                label: 'Dashboard' },
    { href: `${base}/anuncios`,  label: 'Meus Anúncios' },
    { href: `${base}/vendas`,    label: 'Minhas Vendas' },
    { href: `${base}/perguntas`, label: 'Perguntas e Respostas' },
    { href: `${base}/mensagens`, label: 'Mensagens' },
    { href: `${base}/catalogo`,  label: 'Anúncios do Catálogo' },
  ]
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {ABAS.map((aba) => {
        const ativa = aba.href === base ? pathname === aba.href : pathname.startsWith(aba.href)
        return (
          <Link key={aba.href} href={aba.href}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              ativa ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            )}>
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Criar `[conexaoId]/layout.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { IconStore } from '@/components/icons'
import { buscarConexao } from '@/lib/mercado-livre'
import { AbasLojaML } from './AbasLojaML'

export default async function LojaMercadoLivreLayout({
  children, params,
}: {
  children: React.ReactNode
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const conexao = await buscarConexao(conexaoId)
  if (!conexao) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          {conexao.ml_nickname ?? conexao.ml_user_id}
        </span>
      </div>
      <AbasLojaML conexaoId={conexaoId} />
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Criar `[conexaoId]/PainelAguardandoAjuste.tsx`**

```tsx
import { buscarAnunciosAguardandoAjuste } from '@/lib/mercado-livre-dashboard'

export default async function PainelAguardandoAjuste({ conexaoId }: { conexaoId: string }) {
  const aguardandoAjuste = await buscarAnunciosAguardandoAjuste(conexaoId)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="mb-3 font-semibold text-gray-800">Anúncios Aguardando Ajuste Solicitado pelo Mercado Livre</p>
      {aguardandoAjuste.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum anúncio com pendência.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {aguardandoAjuste.map((a) => (
            <li key={a.mlItemId} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">{a.titulo}</span>
              <span className="text-xs font-medium text-amber-600">{a.subStatus}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Criar `[conexaoId]/page.tsx`**

```tsx
import { Suspense } from 'react'
import { formatBRL } from '@/lib/utils'
import {
  buscarVisaoGeral, buscarAnunciosSemEstoque, buscarFluxoVendas, buscarMaisVendidos,
} from '@/lib/mercado-livre-dashboard'
import PainelAguardandoAjuste from './PainelAguardandoAjuste'

export const maxDuration = 60

export default async function DashboardLojaMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const [visao, semEstoque, fluxo, maisVendidos] = await Promise.all([
    buscarVisaoGeral(conexaoId),
    buscarAnunciosSemEstoque(conexaoId),
    buscarFluxoVendas(conexaoId),
    buscarMaisVendidos(conexaoId),
  ])

  const maxFaturamento = Math.max(1, ...fluxo.map((p) => p.faturamento))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Anúncios simples ativos', visao.anunciosSimplesAtivos],
          ['Anúncios de catálogo ativos', visao.anunciosCatalogoAtivos],
          ['Anúncios importados', visao.anunciosImportados],
          ['Perguntas não respondidas', visao.perguntasNaoRespondidas],
          ['Mensagens não lidas', visao.mensagensNaoLidas],
        ].map(([label, valor]) => (
          <div key={label as string} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-gray-900">{valor}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-gray-800">Fluxo de Vendas (30 dias)</p>
          {fluxo.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma venda do Mercado Livre no período.</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {fluxo.map((p) => (
                <div key={p.dia} className="group relative flex-1">
                  <div
                    className="rounded-t bg-blue-500 transition-all group-hover:bg-blue-600"
                    style={{ height: `${Math.max(4, (p.faturamento / maxFaturamento) * 100)}%` }}
                  />
                  <div className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
                    {p.dia}: {formatBRL(p.faturamento)} ({p.quantidade})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 font-semibold text-gray-800">10 Anúncios Mais Vendidos</p>
          {maisVendidos.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma venda do Mercado Livre ainda.</p>
          ) : (
            <ul className="space-y-2">
              {maisVendidos.map((a) => (
                <li key={a.mlItemId} className="flex items-center justify-between text-sm">
                  <span className="truncate text-gray-700">{a.titulo}</span>
                  <span className="shrink-0 font-semibold text-gray-900">{a.quantidadeVendida}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="mb-3 font-semibold text-gray-800">Anúncios Sem Estoque</p>
        {semEstoque.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum anúncio sem estoque.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {semEstoque.map((a) => (
              <li key={a.mlItemId} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">{a.titulo}</span>
                <span className="text-gray-400">{a.codigoProduto ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Suspense fallback={
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-400">Carregando...</p>
        </div>
      }>
        <PainelAguardandoAjuste conexaoId={conexaoId} />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 6: Apagar os 4 arquivos antigos (fora de `[conexaoId]/`)**

```bash
git rm app/painel/integracoes/lojas/mercado-livre/layout.tsx
git rm app/painel/integracoes/lojas/mercado-livre/AbasLojaML.tsx
git rm app/painel/integracoes/lojas/mercado-livre/page.tsx
git rm app/painel/integracoes/lojas/mercado-livre/PainelAguardandoAjuste.tsx
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: os erros que sobrarem devem ser só nos arquivos das Tarefas
7-9 (anuncios/vendas/perguntas/mensagens/catalogo, ainda não movidos) —
nada dentro de `lib/mercado-livre-dashboard.ts` nem em
`[conexaoId]/*` recém-criados.

- [ ] **Step 8: Commit**

```bash
git add lib/mercado-livre-dashboard.ts app/painel/integracoes/lojas/mercado-livre
git commit -m "Move dashboard da loja ML pra rota por conexao ([conexaoId])"
```

---

### Task 7: Anúncios, Vendas e Catálogo — move pra `[conexaoId]/`

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/anuncios/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/vendas/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/catalogo/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx`

**Interfaces:**
- Consumes: `buscarVendasML(conexaoId)` (Tarefa 2), `chamarML(conexaoId, path)` (Tarefa 2).

- [ ] **Step 1: Criar `[conexaoId]/anuncios/page.tsx`**

```tsx
import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { BuscaLista } from '@/components/BuscaLista'
import { ImportarAnunciosBotao } from '@/app/painel/integracoes/lojas/ImportarAnunciosBotao'

type AnuncioLinha = {
  ml_item_id: string
  titulo_ml: string
  preco_ml: number | null
  produto_id: string | null
}

export default async function MeusAnunciosMLPage({
  params, searchParams,
}: {
  params: Promise<{ conexaoId: string }>
  searchParams: Promise<{ busca?: string }>
}) {
  const { conexaoId } = await params
  const { busca } = await searchParams
  const supabase = await createServiceClient()

  let q = supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, preco_ml, produto_id')
    .eq('conexao_id', conexaoId)
    .order('titulo_ml')

  const termo = busca?.trim()
  if (termo) q = q.ilike('titulo_ml', `%${termo}%`)

  const anuncios = await fetchAll<AnuncioLinha>((de, ate) => q.range(de, ate))

  const produtoIds = anuncios.map((a) => a.produto_id).filter((id): id is string => !!id)
  const produtos = await fetchAllIn<{ id: string; codigo: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('produtos').select('id, codigo').in('id', chunk).range(de, ate))
  const codigoPorProduto = new Map(produtos.map((p) => [p.id, p.codigo]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <BuscaLista basePath={`/painel/integracoes/lojas/mercado-livre/${conexaoId}/anuncios`} placeholder="Buscar anúncio..." />
        <ImportarAnunciosBotao conexaoId={conexaoId} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Anúncio</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço ML</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ver no ML</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {anuncios.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum anúncio importado ainda.</td></tr>
            ) : anuncios.map((a) => (
              <tr key={a.ml_item_id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{a.titulo_ml}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {a.produto_id
                    ? (codigoPorProduto.get(a.produto_id) ?? a.produto_id)
                    : <span className="text-amber-600">sem correspondência</span>}
                </td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{a.preco_ml != null ? formatBRL(a.preco_ml) : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <a href={`https://produto.mercadolivre.com.br/${a.ml_item_id}`} target="_blank" rel="noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline">
                    Abrir
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar `[conexaoId]/vendas/page.tsx`**

```tsx
import { buscarVendasML } from '@/lib/mercado-livre'
import { formatBRL, formatDate } from '@/lib/utils'

export default async function MinhasVendasMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const { vendas, pendentes } = await buscarVendasML(conexaoId)

  return (
    <div className="space-y-6">
      {pendentes.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            {pendentes.length} pedido(s) precisam de revisão manual
          </p>
          <ul className="space-y-1 text-sm text-amber-700">
            {pendentes.map((p) => (
              <li key={p.id}>Pedido #{p.ml_order_id} — {p.motivo}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Código Ecommerce</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Venda</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {vendas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhuma venda ainda.</td></tr>
            ) : vendas.map((v) => (
              <tr key={v.id} className="hover:bg-blue-50/60 transition">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{v.ml_order_id}</td>
                <td className="px-4 py-3 text-sm text-gray-600">#{v.numero}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{formatDate(v.created_at)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-600">{formatBRL(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Criar `[conexaoId]/catalogo/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { chamarML } from '@/lib/mercado-livre'

type AnuncioCatalogo = { ml_item_id: string; titulo_ml: string; catalog_product_id: string }
type ProdutoCatalogo = { buy_box_winner: { item_id: string } | null }

export const maxDuration = 60

export default async function CatalogoMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, catalog_product_id')
    .eq('conexao_id', conexaoId)
    .eq('is_catalogo', true)
  const anuncios = (data ?? []) as AnuncioCatalogo[]

  // Sequencial, não Promise.all: cada chamarML pode disparar renovação de
  // token, e o refresh_token do ML é de uso único.
  const comStatus: (AnuncioCatalogo & { ganhando: boolean | null })[] = []
  for (const a of anuncios) {
    try {
      const produto = await chamarML<ProdutoCatalogo>(conexaoId, `/products/${a.catalog_product_id}`)
      const ganhando = produto.buy_box_winner?.item_id === a.ml_item_id
      comStatus.push({ ...a, ganhando })
    } catch {
      comStatus.push({ ...a, ganhando: null })
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {comStatus.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum anúncio de catálogo importado.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {comStatus.map((a) => (
            <li key={a.ml_item_id} className="flex items-center justify-between py-3 text-sm">
              <span className="text-gray-700">{a.titulo_ml}</span>
              {a.ganhando === null ? (
                <span className="text-xs text-gray-400">Não foi possível checar</span>
              ) : (
                <span className={`text-xs font-medium ${a.ganhando ? 'text-green-600' : 'text-red-600'}`}>
                  {a.ganhando ? 'Ganhando' : 'Perdendo'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Apagar os 3 arquivos antigos**

```bash
git rm app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx
git rm app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx
git rm app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: os erros que sobrarem devem ser só de perguntas/mensagens (Tarefas 8-9).

- [ ] **Step 6: Commit**

```bash
git add app/painel/integracoes/lojas/mercado-livre
git commit -m "Move Meus Anuncios, Minhas Vendas e Catalogo pra rota por conexao"
```

---

### Task 8: Perguntas — aba por conexão + caixa de entrada agregada

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/ResponderPerguntaForm.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/actions.ts`
- Create: `app/painel/integracoes/mercado-livre/perguntas/page.tsx`
- Create: `app/painel/integracoes/mercado-livre/perguntas/actions.ts`
- Delete: `app/painel/integracoes/lojas/mercado-livre/perguntas/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/perguntas/ResponderPerguntaForm.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/perguntas/actions.ts`

**Interfaces:**
- Consumes: `responderPerguntaML(conexaoId, mlQuestionId, texto)` (Tarefa 2).

- [ ] **Step 1: Aba por conexão — `[conexaoId]/perguntas/actions.ts`**

```ts
'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { responderPerguntaML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function responderPergunta(perguntaId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  if (!texto.trim()) return { ok: false, erro: 'Escreva uma resposta.' }

  const supabase = await createServiceClient()
  const { data: pergunta } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('ml_question_id, conexao_id')
    .eq('id', perguntaId)
    .maybeSingle()
  if (!pergunta || !pergunta.conexao_id) return { ok: false, erro: 'Pergunta não encontrada.' }

  try {
    await responderPerguntaML(pergunta.conexao_id, pergunta.ml_question_id, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao responder no Mercado Livre.' }
  }

  const { error } = await supabase.from('integracoes_mercado_livre_perguntas').update({
    respondida: true,
    resposta_texto: texto,
    respondida_em: new Date().toISOString(),
  }).eq('id', perguntaId)
  if (error) return { ok: false, erro: 'Resposta enviada ao Mercado Livre, mas falhou ao atualizar aqui — recarregue a página.' }

  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${pergunta.conexao_id}/perguntas`)
  revalidatePath('/painel/integracoes/mercado-livre/perguntas')
  return { ok: true }
}
```

- [ ] **Step 2: `[conexaoId]/perguntas/ResponderPerguntaForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { responderPergunta } from './actions'

export function ResponderPerguntaForm({ perguntaId }: { perguntaId: string }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const res = await responderPergunta(perguntaId, texto)
    if (!res.ok) setErro(res.erro ?? 'Erro ao responder.')
    setEnviando(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-start gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva a resposta..."
        rows={2}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      />
      <button type="submit" disabled={enviando}
        className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
        {enviando ? 'Enviando...' : 'Responder'}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </form>
  )
}
```

- [ ] **Step 3: `[conexaoId]/perguntas/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderPerguntaForm } from './ResponderPerguntaForm'

type PerguntaLinha = { id: string; texto: string; criado_em: string }

export default async function PerguntasMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('id, texto, criado_em')
    .eq('conexao_id', conexaoId)
    .eq('respondida', false)
    .order('criado_em', { ascending: true })
  const perguntas = (data ?? []) as PerguntaLinha[]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {perguntas.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma pergunta pendente.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {perguntas.map((p) => (
            <li key={p.id} className="py-4">
              <p className="text-sm text-gray-800">{p.texto}</p>
              <p className="text-xs text-gray-400">{formatDate(p.criado_em)}</p>
              <ResponderPerguntaForm perguntaId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Caixa de entrada agregada — `app/painel/integracoes/mercado-livre/perguntas/actions.ts`**

Idêntica à da Tarefa 8 Step 1 (mesmo comportamento, é a mesma pergunta,
só chamada de um lugar diferente) — reexportar em vez de duplicar:

```ts
export { responderPergunta } from '@/app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/actions'
```

- [ ] **Step 5: `app/painel/integracoes/mercado-livre/perguntas/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ResponderPerguntaForm } from '@/app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/ResponderPerguntaForm'

type PerguntaLinha = { id: string; texto: string; criado_em: string; conexao: { ml_nickname: string | null; ml_user_id: string } | null }

export default async function PerguntasMLAgregadoPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('id, texto, criado_em, conexao:integracoes_mercado_livre(ml_nickname, ml_user_id)')
    .eq('respondida', false)
    .order('criado_em', { ascending: true })
  const perguntas = (data ?? []) as unknown as PerguntaLinha[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Perguntas Mercado Livre</h2>
        <Dica texto="Perguntas pendentes de todas as contas Mercado Livre conectadas, juntas." />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {perguntas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma pergunta pendente.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {perguntas.map((p) => (
              <li key={p.id} className="py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {p.conexao?.ml_nickname ?? p.conexao?.ml_user_id ?? 'Conta desconhecida'}
                </p>
                <p className="text-sm text-gray-800">{p.texto}</p>
                <p className="text-xs text-gray-400">{formatDate(p.criado_em)}</p>
                <ResponderPerguntaForm perguntaId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

Nota pro implementador: `conexao:integracoes_mercado_livre(ml_nickname, ml_user_id)`
é sintaxe de embed do PostgREST pra trazer a conexão junto num select só
(join automático pela FK `conexao_id`) — já usado nesse formato em outras
partes do projeto (ex: `pessoas(nome)` em `app/painel/pedidos/page.tsx`).
O `as unknown as` no cast é necessário porque o Supabase tipa o embed
como array por padrão mesmo sendo relação 1:1 — mesmo padrão já usado em
outras consultas com embed deste projeto se houver, senão testar com
`.maybeSingle()`-like handling e ajustar o tipo conforme o retorno real.

- [ ] **Step 6: Apagar os 3 arquivos antigos e verificar tipos**

```bash
git rm app/painel/integracoes/lojas/mercado-livre/perguntas/page.tsx
git rm app/painel/integracoes/lojas/mercado-livre/perguntas/ResponderPerguntaForm.tsx
git rm app/painel/integracoes/lojas/mercado-livre/perguntas/actions.ts
```

Run: `npx tsc --noEmit`
Expected: os erros que sobrarem devem ser só de mensagens (Tarefa 9) e
Sidebar (Tarefa 10).

- [ ] **Step 7: Commit**

```bash
git add app/painel/integracoes/lojas/mercado-livre app/painel/integracoes/mercado-livre
git commit -m "Perguntas ML: aba por conexao + caixa de entrada agregada"
```

---

### Task 9: Mensagens — aba por conexão + caixa de entrada agregada

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/mensagens/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/mensagens/ResponderMensagemForm.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/[conexaoId]/mensagens/actions.ts`
- Create: `app/painel/integracoes/mercado-livre/mensagens/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/mensagens/page.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/mensagens/ResponderMensagemForm.tsx`
- Delete: `app/painel/integracoes/lojas/mercado-livre/mensagens/actions.ts`

**Interfaces:**
- Consumes: `responderMensagemML(conexaoId, packId, texto)` (Tarefa 2).

- [ ] **Step 1: `[conexaoId]/mensagens/actions.ts`**

```ts
'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { responderMensagemML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function responderMensagem(conexaoId: string, packId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  if (!texto.trim()) return { ok: false, erro: 'Escreva uma mensagem.' }

  try {
    await responderMensagemML(conexaoId, packId, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar no Mercado Livre.' }
  }

  const supabase = await createServiceClient()
  const { error } = await supabase.from('integracoes_mercado_livre_mensagens').update({ lida: true }).eq('ml_pack_id', packId)
  if (error) return { ok: false, erro: 'Resposta enviada ao Mercado Livre, mas falhou ao atualizar aqui — recarregue a página.' }

  revalidatePath(`/painel/integracoes/lojas/mercado-livre/${conexaoId}/mensagens`)
  revalidatePath('/painel/integracoes/mercado-livre/mensagens')
  return { ok: true }
}
```

Nota pro implementador: diferente de `responderPergunta`, esta função
ganha `conexaoId` como primeiro parâmetro explícito (em vez de descobrir
via uma linha do banco) porque mensagens são agrupadas por `ml_pack_id`,
não têm um `id` de linha única óbvio pra buscar — o formulário já sabe
de qual conexão é a conversa que está respondendo (recebe via prop),
então passa direto.

- [ ] **Step 2: `[conexaoId]/mensagens/ResponderMensagemForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { responderMensagem } from './actions'

export function ResponderMensagemForm({ conexaoId, packId }: { conexaoId: string; packId: string }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const res = await responderMensagem(conexaoId, packId, texto)
    if (!res.ok) setErro(res.erro ?? 'Erro ao enviar.')
    else setTexto('')
    setEnviando(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-start gap-2">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva a resposta..."
        rows={2}
        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      />
      <button type="submit" disabled={enviando}
        className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition">
        {enviando ? 'Enviando...' : 'Responder'}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </form>
  )
}
```

- [ ] **Step 3: `[conexaoId]/mensagens/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderMensagemForm } from './ResponderMensagemForm'

type MensagemLinha = { id: string; ml_pack_id: string; autor: string; texto: string; lida: boolean; criado_em: string }

export default async function MensagensMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_mensagens')
    .select('id, ml_pack_id, autor, texto, lida, criado_em')
    .eq('conexao_id', conexaoId)
    .order('criado_em', { ascending: false })
    .limit(300)
  const mensagens = ((data ?? []) as MensagemLinha[]).reverse()

  const porPack = new Map<string, MensagemLinha[]>()
  for (const m of mensagens) {
    const lista = porPack.get(m.ml_pack_id) ?? []
    lista.push(m)
    porPack.set(m.ml_pack_id, lista)
  }

  // Abrir a aba já marca como lida toda conversa mostrada — ver nota
  // original desta lógica: revalidatePath durante o render lança erro do
  // Next, por isso é update inline sem server action aqui.
  if (porPack.size > 0) {
    await supabase.from('integracoes_mercado_livre_mensagens')
      .update({ lida: true })
      .eq('conexao_id', conexaoId)
      .in('ml_pack_id', [...porPack.keys()])
      .eq('autor', 'comprador')
  }

  return (
    <div className="space-y-4">
      {porPack.size === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-400">Nenhuma conversa ainda.</p>
        </div>
      ) : [...porPack.entries()].map(([packId, msgs]) => (
        <div key={packId} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Pedido / pack {packId}</p>
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className={m.autor === 'vendedor' ? 'text-right' : 'text-left'}>
                <span className={`inline-block max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.autor === 'vendedor' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {m.texto}
                </span>
                <p className="text-[10px] text-gray-400">{formatDate(m.criado_em)}</p>
              </li>
            ))}
          </ul>
          <ResponderMensagemForm conexaoId={conexaoId} packId={packId} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Caixa de entrada agregada — `app/painel/integracoes/mercado-livre/mensagens/page.tsx`**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ResponderMensagemForm } from '@/app/painel/integracoes/lojas/mercado-livre/[conexaoId]/mensagens/ResponderMensagemForm'

type MensagemLinha = {
  id: string; ml_pack_id: string; conexao_id: string; autor: string; texto: string; criado_em: string
  conexao: { ml_nickname: string | null; ml_user_id: string } | null
}

export default async function MensagensMLAgregadoPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_mensagens')
    .select('id, ml_pack_id, conexao_id, autor, texto, criado_em, conexao:integracoes_mercado_livre(ml_nickname, ml_user_id)')
    .order('criado_em', { ascending: false })
    .limit(300)
  const mensagens = (((data ?? []) as unknown as MensagemLinha[])).reverse()

  const porPack = new Map<string, MensagemLinha[]>()
  for (const m of mensagens) {
    const lista = porPack.get(m.ml_pack_id) ?? []
    lista.push(m)
    porPack.set(m.ml_pack_id, lista)
  }

  if (porPack.size > 0) {
    await supabase.from('integracoes_mercado_livre_mensagens')
      .update({ lida: true })
      .in('ml_pack_id', [...porPack.keys()])
      .eq('autor', 'comprador')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mensagens Mercado Livre</h2>
        <Dica texto="Conversas de todas as contas Mercado Livre conectadas, juntas." />
      </div>
      <div className="space-y-4">
        {porPack.size === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-gray-400">Nenhuma conversa ainda.</p>
          </div>
        ) : [...porPack.entries()].map(([packId, msgs]) => (
          <div key={packId} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {msgs[0].conexao?.ml_nickname ?? msgs[0].conexao?.ml_user_id ?? 'Conta desconhecida'} · Pedido / pack {packId}
            </p>
            <ul className="space-y-2">
              {msgs.map((m) => (
                <li key={m.id} className={m.autor === 'vendedor' ? 'text-right' : 'text-left'}>
                  <span className={`inline-block max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    m.autor === 'vendedor' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {m.texto}
                  </span>
                  <p className="text-[10px] text-gray-400">{formatDate(m.criado_em)}</p>
                </li>
              ))}
            </ul>
            <ResponderMensagemForm conexaoId={msgs[0].conexao_id} packId={packId} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Apagar os 3 arquivos antigos e verificar tipos**

```bash
git rm app/painel/integracoes/lojas/mercado-livre/mensagens/page.tsx
git rm app/painel/integracoes/lojas/mercado-livre/mensagens/ResponderMensagemForm.tsx
git rm app/painel/integracoes/lojas/mercado-livre/mensagens/actions.ts
```

Run: `npx tsc --noEmit`
Expected: os erros que sobrarem devem ser só de `components/Sidebar.tsx` (Tarefa 10).

- [ ] **Step 6: Commit**

```bash
git add app/painel/integracoes/lojas/mercado-livre app/painel/integracoes/mercado-livre
git commit -m "Mensagens ML: aba por conexao + caixa de entrada agregada"
```

---

### Task 10: Sidebar — links apontam pra caixa de entrada agregada

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: nada de `lib/mercado-livre.ts` (só troca URLs estáticas).

- [ ] **Step 1: Trocar as duas entradas do mapa `ICONS`**

Em `components/Sidebar.tsx`, trocar:

```ts
  '/painel/integracoes/lojas/mercado-livre/perguntas': IconFile,
  '/painel/integracoes/lojas/mercado-livre/mensagens': IconFile,
```

por:

```ts
  '/painel/integracoes/mercado-livre/perguntas': IconFile,
  '/painel/integracoes/mercado-livre/mensagens': IconFile,
```

- [ ] **Step 2: Trocar as duas entradas do grupo `'Integrações'` em `navCompleto`**

Trocar:

```tsx
      { href: '/painel/integracoes/lojas/mercado-livre/perguntas', label: 'Perguntas ML', permissao: 'integracoes' },
      { href: '/painel/integracoes/lojas/mercado-livre/mensagens', label: 'Mensagens ML', permissao: 'integracoes' },
```

por:

```tsx
      { href: '/painel/integracoes/mercado-livre/perguntas', label: 'Perguntas ML', permissao: 'integracoes' },
      { href: '/painel/integracoes/mercado-livre/mensagens', label: 'Mensagens ML', permissao: 'integracoes' },
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: **zero erros** — este é o último arquivo pendente do plano
inteiro.

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "Sidebar aponta Perguntas/Mensagens ML pra caixa de entrada agregada"
```

---

## Notas de execução (pra quem coordena o plano via SDD)

- **Tarefa 1 tem checkpoint humano** — mas desta vez usando
  `mcp__supabase__apply_migration` diretamente (MCP conectado nesta
  sessão), com confirmação explícita do usuário antes de aplicar, em vez
  do fluxo antigo de colar SQL manualmente.
- As Tarefas 2-10 são **sequenciais por dependência de tipos**: Task 2
  quebra de propósito todo o resto (assinaturas mudam), e cada tarefa
  seguinte corrige um subconjunto de arquivos. Rodar `tsc --noEmit` a
  cada tarefa mostra o progresso real — o número de erros deve cair a
  cada tarefa até chegar a zero na Tarefa 10.
- Nenhuma tarefa pode ser testada contra dado real de produção até o
  usuário reconectar pelo menos uma conta Mercado Livre de verdade
  (ação dele, fora deste plano) — os "testes manuais" quando mencionados
  cobrem o que dá pra verificar sem isso.
- `app/painel/integracoes/produtos/page.tsx` e
  `app/painel/integracoes/sincronizacoes/page.tsx` (Central de
  Integrações) **não fazem parte deste plano** — não usam
  `conexaoAtual()` nem nenhuma função alterada, confirmado lendo os dois
  antes de escrever este plano.
