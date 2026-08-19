# Integração Mercado Livre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Task 1 needs a human in the loop.** This project has no tool that applies
> Supabase migrations — the user pastes SQL into the Supabase SQL Editor
> themselves (documented project convention, `CLAUDE.md`: "Migrations do
> Supabase não são aplicadas automaticamente"). Task 1 ends with a STOP:
> print the migration file's content, ask the user to paste and run it in
> the Supabase SQL Editor, and wait for their explicit confirmation before
> dispatching Task 2. Every task after Task 1 assumes the migration is live.

**Goal:** Make the Mercado Livre card in the Central de Integrações a real, working integration — connect the seller account (OAuth+PKCE), import existing anúncios matched by SKU, turn paid Mercado Livre orders into real `vendas` (without touching the physical caixa), and keep stock in sync in both directions so the same item never sells twice.

**Architecture:** A small API client (`lib/mercado-livre.ts`) centralizes every call to Mercado Livre's REST API and owns token refresh. Two new Next.js route handlers do the OAuth dance. A third route handler receives Mercado Livre's order webhook and reuses the existing `finalizar_venda` RPC — the same one the PDV calls — so stock, `vendas`, and `pagamentos_venda` all go through one ledger. A stock-sync helper is called (fire-and-forget, wrapped in try/catch) from every place that already mutates `estoque` for the Petrópolis Loja deposit.

**Tech Stack:** Next.js 16 App Router (Route Handlers), TypeScript, Supabase (service-role), Mercado Livre REST API (OAuth 2.0 Authorization Code + PKCE).

**Spec:** `docs/superpowers/specs/2026-08-19-mercado-livre-integracao-design.md`

## Global Constraints

- Mercado Livre stock always maps to the fixed deposit **PETRÓPOLIS LOJA**, id `63d9054d59a9c829747233d4` — never any other deposit.
- The `integracoes_mercado_livre` connection table is a **singleton**: always `id = 'principal'`, upserted with `onConflict: 'id'`. Never insert with a generated id.
- Matching anúncio ↔ produto and pedido item ↔ produto is **always by exact code/SKU** (`seller_custom_field` == `produtos.codigo`, or the ML item id already recorded in `integracoes_mercado_livre_anuncios`). Never match by title/name similarity.
- A Mercado Livre sale calls `finalizar_venda` exactly like the PDV does, with one deliberate omission: **never** run the `vendas.update({ caixa_id })` step the PDV runs after the RPC. This is what keeps ML sales out of physical cash reconciliation.
- Payment form for ML sales is always `forma_pagamento_id: 'FP_MERCADOLIVRE'`, `status: 'pago'`, `taxa: 0`.
- The webhook route (`/api/integracoes/mercado-livre/webhook`) is intentionally unauthenticated (Mercado Livre doesn't sign it) — it must never trust the POST body for order data, always re-fetch the order from Mercado Livre's API with a valid token before acting on it.
- A pedido that Mercado Livre confirms as paid but that `finalizar_venda` rejects (stock, unmatched item) is recorded in `integracoes_mercado_livre_pedidos_pendentes`, never dropped, and the webhook still responds `200`.
- Every server-side call to Mercado Livre's API goes through `tokenValido()` in `lib/mercado-livre.ts` — nothing else reads `access_token` from the database directly.
- Out of scope for this plan (per spec): auto-pushing price to ML, creating new anúncios from TecnoCell, periodic reconciliation job, Mensagens Automáticas / Perguntas e Respostas, multi-account.

---

### Task 1: Migration — new tables, column, forma de pagamento

**Files:**
- Create: `supabase/migrations/2026-08-19-mercado-livre-integracao.sql`

**Interfaces:**
- Produces: tables `integracoes_mercado_livre`, `integracoes_mercado_livre_anuncios`, `integracoes_mercado_livre_pedidos_pendentes`; column `vendas.ml_order_id`; row `formas_pagamento` id `'FP_MERCADOLIVRE'`. Every later task in this plan reads or writes one of these.

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Integração real com Mercado Livre — Peças 1-4
-- Ver docs/superpowers/specs/2026-08-19-mercado-livre-integracao-design.md
-- ============================================================

-- Peça 1: conexão OAuth. Singleton de propósito (id sempre 'principal') —
-- o negócio só tem uma conta Mercado Livre; conectar de novo substitui.
create table if not exists integracoes_mercado_livre (
  id                text primary key default 'principal',
  ml_user_id        text not null,
  ml_nickname       text,
  access_token      text not null,
  refresh_token     text not null,
  expira_em         timestamptz not null,
  conectado_por     text,
  conectado_em      timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

-- Peça 2: anúncio do Mercado Livre <-> produto do TecnoCell. produto_id
-- null = sem correspondência encontrada (nunca casa por título, só código).
create table if not exists integracoes_mercado_livre_anuncios (
  id             uuid primary key default gen_random_uuid(),
  ml_item_id     text not null unique,
  produto_id     text references produtos(id),
  titulo_ml      text not null,
  preco_ml       numeric(12,2),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Peça 3: pedido pago no ML que finalizar_venda não conseguiu processar
-- (estoque insuficiente, item sem produto correspondente). Nunca some.
create table if not exists integracoes_mercado_livre_pedidos_pendentes (
  id            uuid primary key default gen_random_uuid(),
  ml_order_id   text not null unique,
  motivo        text not null,
  payload       jsonb not null,
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now()
);

-- Peça 3: idempotência — webhook duplicado não cria venda duplicada.
alter table vendas add column if not exists ml_order_id text unique;

-- Peça 3: forma de pagamento nova. tipo = 'marketplace' (não é 'fiado' nem
-- 'vale_credito') então CONTA como faturamento normal nas Metas — decisão
-- de negócio confirmada com o usuário antes desta spec.
insert into formas_pagamento (id, nome, ativo, tipo)
values ('FP_MERCADOLIVRE', 'Mercado Livre', true, 'marketplace')
on conflict (id) do update set nome = excluded.nome, ativo = true, tipo = excluded.tipo;
```

- [ ] **Step 2: STOP — hand off to the user**

Print the full file content and this message, then wait:

> "Preciso que você cole esse SQL no SQL Editor do Supabase e rode. Depois
> me confirma que aplicou sem erro, que eu sigo pro resto."

Do not proceed to Task 2 until the user confirms.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-19-mercado-livre-integracao.sql
git commit -m "Adiciona migration da integracao com Mercado Livre"
```

---

### Task 2: `lib/mercado-livre.ts` — API client core + token refresh

**Files:**
- Create: `lib/mercado-livre.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`; env vars `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET`.
- Produces: `export async function tokenValido(): Promise<string>` (throws `Error('Mercado Livre não está conectado')` if no row exists), `export async function chamarML<T>(path: string, init?: RequestInit): Promise<T>` (throws on non-2xx with the ML error body in the message), `export type ConexaoML = { ml_user_id: string; ml_nickname: string | null; expira_em: string }`. Consumed by Tasks 3, 4, 5, 6, 7, 8, 9, 11.

- [ ] **Step 1: Write the file**

```ts
import { createServiceClient } from '@/lib/supabase/server'

// Cliente da API do Mercado Livre. TUDO que fala com api.mercadolibre.com
// passa por aqui — nunca lê access_token direto do banco em outro lugar.
// Conexão é singleton (id sempre 'principal', ver migration).

const ML_API = 'https://api.mercadolibre.com'
const ML_AUTH = 'https://auth.mercadolivre.com.br'

export type ConexaoML = {
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

export async function conexaoAtual(): Promise<ConexaoML | null> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre')
    .select('ml_user_id, ml_nickname, expira_em')
    .eq('id', 'principal')
    .maybeSingle()
  return (data as ConexaoML | null) ?? null
}

// Devolve um access_token válido, renovando via refresh_token se estiver a
// menos de 5min de expirar. Lança erro se não houver conexão — quem chama
// decide o que fazer (webhook grava pendência, tela mostra "conecte primeiro").
export async function tokenValido(): Promise<string> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre')
    .select('*')
    .eq('id', 'principal')
    .maybeSingle()
  const conexao = data as LinhaConexao | null
  if (!conexao) throw new Error('Mercado Livre não está conectado')

  const expiraEm = new Date(conexao.expira_em).getTime()
  const cincoMinutos = 5 * 60 * 1000
  if (expiraEm - Date.now() > cincoMinutos) return conexao.access_token

  const resp = await fetch(`${ML_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.MERCADOLIVRE_CLIENT_ID!,
      client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET!,
      refresh_token: conexao.refresh_token,
    }),
  })
  if (!resp.ok) throw new Error(`Falha ao renovar token do Mercado Livre: ${await resp.text()}`)
  const novo = await resp.json() as { access_token: string; refresh_token: string; expires_in: number }

  await supabase.from('integracoes_mercado_livre').update({
    access_token: novo.access_token,
    refresh_token: novo.refresh_token,
    expira_em: new Date(Date.now() + novo.expires_in * 1000).toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq('id', 'principal')

  return novo.access_token
}

// Chamada genérica autenticada à API do Mercado Livre.
export async function chamarML<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await tokenValido()
  const resp = await fetch(path.startsWith('http') ? path : `${ML_API}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Mercado Livre API ${resp.status}: ${await resp.text()}`)
  return resp.json() as Promise<T>
}

export function urlAutorizacao(state: string, codeChallenge: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.MERCADOLIVRE_CLIENT_ID!,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })
  return `${ML_AUTH}/authorization?${params.toString()}`
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/mercado-livre.ts
git commit -m "Adiciona cliente da API do Mercado Livre com renovacao de token"
```

---

### Task 3: Rota de autorização (inicia o OAuth)

**Files:**
- Create: `app/api/integracoes/mercado-livre/autorizar/route.ts`

**Interfaces:**
- Consumes: `urlAutorizacao` from `@/lib/mercado-livre`; `requirePermissao` from `@/lib/supabase/server`.
- Produces: `GET /api/integracoes/mercado-livre/autorizar` — sets cookie `ml_oauth_pkce` (JSON `{ verifier, state }`), redirects (302) to Mercado Livre. Consumed by Task 5 (the "Conectar" link) and read back by Task 4.

- [ ] **Step 1: Write the route**

```ts
import { requirePermissao } from '@/lib/supabase/server'
import { urlAutorizacao } from '@/lib/mercado-livre'
import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function GET(req: Request) {
  try {
    await requirePermissao('integracoes')
  } catch {
    return new Response('Sem permissão.', { status: 403 })
  }

  const verifier = base64url(randomBytes(48))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(16))

  const cookieStore = await cookies()
  cookieStore.set('ml_oauth_pkce', JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  const redirectUri = new URL('/api/integracoes/mercado-livre/callback', req.url).toString()
  redirect(urlAutorizacao(state, challenge, redirectUri))
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/integracoes/mercado-livre/autorizar/route.ts
git commit -m "Cria rota que inicia a autorizacao OAuth do Mercado Livre"
```

---

### Task 4: Rota de callback (finaliza o OAuth)

**Files:**
- Create: `app/api/integracoes/mercado-livre/callback/route.ts`

**Interfaces:**
- Consumes: cookie `ml_oauth_pkce` set by Task 3; `requireAuth`, `createServiceClient` from `@/lib/supabase/server`.
- Produces: `GET /api/integracoes/mercado-livre/callback?code&state` — upserts `integracoes_mercado_livre` (singleton, `id: 'principal'`), redirects to `/painel/integracoes?ml=conectado` or `?ml=erro`.

- [ ] **Step 1: Write the route**

```ts
import { requireAuth, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookieStore = await cookies()
  const raw = cookieStore.get('ml_oauth_pkce')?.value
  cookieStore.delete('ml_oauth_pkce')

  if (!code || !state || !raw) redirect('/painel/integracoes?ml=erro')
  const { verifier, state: stateEsperado } = JSON.parse(raw) as { verifier: string; state: string }
  if (state !== stateEsperado) redirect('/painel/integracoes?ml=erro')

  const redirectUri = new URL('/api/integracoes/mercado-livre/callback', req.url).toString()
  const tokenResp = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.MERCADOLIVRE_CLIENT_ID!,
      client_secret: process.env.MERCADOLIVRE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  if (!tokenResp.ok) redirect('/painel/integracoes?ml=erro')
  const token = await tokenResp.json() as {
    access_token: string; refresh_token: string; expires_in: number; user_id: number
  }

  const meResp = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  const me = meResp.ok ? await meResp.json() as { nickname?: string } : {}

  let usuarioId: string | null = null
  try { usuarioId = (await requireAuth()).id } catch { /* sessão pode ter expirado no meio do fluxo — segue sem autor registrado */ }

  const supabase = await createServiceClient()
  await supabase.from('integracoes_mercado_livre').upsert({
    id: 'principal',
    ml_user_id: String(token.user_id),
    ml_nickname: me.nickname ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expira_em: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    conectado_por: usuarioId,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'id' })

  redirect('/painel/integracoes?ml=conectado')
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/integracoes/mercado-livre/callback/route.ts
git commit -m "Cria rota de callback que finaliza a autorizacao OAuth do Mercado Livre"
```

---

### Task 5: Dashboard mostra conexão real do Mercado Livre

**Files:**
- Modify: `app/painel/integracoes/page.tsx`
- Create: `app/painel/integracoes/actions.ts`

**Interfaces:**
- Consumes: `conexaoAtual` from `@/lib/mercado-livre`.
- Produces: server action `desconectarMercadoLivre()` — deletes the singleton row, `revalidatePath('/painel/integracoes')`.

- [ ] **Step 1: Write `app/painel/integracoes/actions.ts`**

```ts
'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function desconectarMercadoLivre() {
  await requirePermissao('integracoes')
  const supabase = await createServiceClient()
  await supabase.from('integracoes_mercado_livre').delete().eq('id', 'principal')
  revalidatePath('/painel/integracoes')
  revalidatePath('/painel/integracoes/lojas')
}
```

- [ ] **Step 2: Update `app/painel/integracoes/page.tsx`**

Current file (written in an earlier plan) maps `PLATAFORMAS` to a card with
a `BotaoIndisponivel`. Change only the Mercado Livre card to show the real
connection state; every other platform keeps `BotaoIndisponivel` unchanged.

```tsx
import { IconIntegracao } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { PLATAFORMAS } from '@/lib/integracoes'
import { conexaoAtual } from '@/lib/mercado-livre'
import { desconectarMercadoLivre } from './actions'

export default async function IntegracoesDashboardPage() {
  const conexaoML = await conexaoAtual()

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
          return (
            <div key={p.chave} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-800">{p.nome}</p>
                {isML && conexaoML ? (
                  <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Conectado
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                    Não conectado
                  </span>
                )}
              </div>
              {isML && conexaoML ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Conectado como <strong>{conexaoML.ml_nickname ?? conexaoML.ml_user_id}</strong></p>
                  <form action={desconectarMercadoLivre}>
                    <button type="submit" className="w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition">
                      Desconectar
                    </button>
                  </form>
                </div>
              ) : isML ? (
                <a href="/api/integracoes/mercado-livre/autorizar"
                  className="block w-full rounded-xl border border-blue-200 py-2 text-center text-sm font-semibold text-blue-600 hover:bg-blue-50 transition">
                  Conectar
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

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Manual check**

Visit `/painel/integracoes`. Expect: 13 cards still show "Não conectado" +
`BotaoIndisponivel`; the Mercado Livre card shows a real "Conectar" link.
Click it — expect a redirect to `auth.mercadolivre.com.br` asking to
authorize the app. **Do not complete the authorization yet** unless you
intend to connect for real at this point — this step already proves the
redirect works; Task 6 covers verifying the full round trip.

- [ ] **Step 5: Commit**

```bash
git add app/painel/integracoes/page.tsx app/painel/integracoes/actions.ts
git commit -m "Dashboard mostra conexao real do Mercado Livre"
```

---

### Task 6: Minhas Lojas mostra a conta conectada + teste de ponta a ponta

**Files:**
- Modify: `app/painel/integracoes/lojas/page.tsx`

**Interfaces:**
- Consumes: `conexaoAtual` from `@/lib/mercado-livre`.

- [ ] **Step 1: Update the page**

Current file (from the earlier plan) always shows an empty state with
`BotaoIndisponivel`. Show the real connection when it exists; keep the
empty state when it doesn't.

```tsx
import { IconStore } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { conexaoAtual } from '@/lib/mercado-livre'

export default async function IntegracoesLojasPage() {
  const conexaoML = await conexaoAtual()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
        <Dica texto="Lojas virtuais e marketplaces conectados. Cada loja conectada mostra anúncios, vendas, perguntas e catálogo — só depois de conectada de verdade." />
      </div>

      {conexaoML ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">Mercado Livre</p>
              <p className="text-sm text-gray-500">Conectado como {conexaoML.ml_nickname ?? conexaoML.ml_user_id}</p>
            </div>
            <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Ativo</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">Nenhuma loja conectada ainda.</p>
          <div className="mt-4 flex justify-center">
            <BotaoIndisponivel label="+ Adicionar Loja" />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check — full OAuth round trip**

Credentials already exist in `.env.local` (`MERCADOLIVRE_CLIENT_ID`,
`MERCADOLIVRE_CLIENT_SECRET`). With the dev server running and logged in
as the test user:
1. Visit `/painel/integracoes`, click "Conectar" on the Mercado Livre card.
2. Authorize on Mercado Livre's real site (using the seller account the
   app was registered under).
3. Confirm the redirect lands back on `/painel/integracoes?ml=conectado`
   and the card now shows "Conectado como {nickname}".
4. Visit `/painel/integracoes/lojas` — confirm it also shows the
   connected account.
5. Query `integracoes_mercado_livre` directly (service-role script) and
   confirm exactly one row, `id = 'principal'`, tokens present.

If this fails, STOP and report exactly what happened — every later task
depends on a working connection.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/lojas/page.tsx
git commit -m "Minhas Lojas mostra a conta do Mercado Livre conectada"
```

---

### Task 7: Buscar e casar anúncios existentes

**Files:**
- Modify: `lib/mercado-livre.ts`

**Interfaces:**
- Consumes: `chamarML` (this file, Task 2).
- Produces: `export async function buscarAnunciosDoVendedor(mlUserId: string): Promise<{ ml_item_id: string; titulo: string; preco: number; sku: string | null }[]>`. Consumed by Task 8.

- [ ] **Step 1: Append to `lib/mercado-livre.ts`**

```ts
type BuscaItensResp = { results: string[]; paging: { total: number; offset: number; limit: number } }
type ItemResp = {
  id: string
  title: string
  price: number
  seller_custom_field: string | null
  attributes?: { id: string; value_name: string | null }[]
}

// Busca todos os anúncios ativos do vendedor e devolve o SKU (seller_custom_field,
// ou o atributo SELLER_SKU quando o custom field vem vazio — o Mercado Livre
// migrou pra esse atributo em parte do catálogo).
export async function buscarAnunciosDoVendedor(mlUserId: string) {
  const itens: { ml_item_id: string; titulo: string; preco: number; sku: string | null }[] = []
  let offset = 0
  const limite = 50
  while (true) {
    const pagina = await chamarML<BuscaItensResp>(
      `/users/${mlUserId}/items/search?offset=${offset}&limit=${limite}`
    )
    if (pagina.results.length === 0) break
    for (const id of pagina.results) {
      const item = await chamarML<ItemResp>(`/items/${id}`)
      const skuAtributo = item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name ?? null
      itens.push({
        ml_item_id: item.id,
        titulo: item.title,
        preco: item.price,
        sku: item.seller_custom_field ?? skuAtributo,
      })
    }
    offset += limite
    if (offset >= pagina.paging.total) break
  }
  return itens
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/mercado-livre.ts
git commit -m "Adiciona busca de anuncios do vendedor no Mercado Livre"
```

---

### Task 8: Importar anúncios — server action + tela

**Files:**
- Create: `app/painel/integracoes/lojas/actions.ts`
- Modify: `app/painel/integracoes/lojas/page.tsx`

**Interfaces:**
- Consumes: `buscarAnunciosDoVendedor`, `conexaoAtual` from `@/lib/mercado-livre`.
- Produces: server action `importarAnuncios(): Promise<{ ok: boolean; casados: number; semCorrespondencia: number; erro?: string }>`.

- [ ] **Step 1: Write `app/painel/integracoes/lojas/actions.ts`**

```ts
'use server'

import { createServiceClient, requirePermissao, fetchAll } from '@/lib/supabase/server'
import { buscarAnunciosDoVendedor, conexaoAtual } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function importarAnuncios() {
  await requirePermissao('integracoes')
  const conexao = await conexaoAtual()
  if (!conexao) return { ok: false, casados: 0, semCorrespondencia: 0, erro: 'Mercado Livre não está conectado.' }

  const supabase = await createServiceClient()
  const [anuncios, produtos] = await Promise.all([
    buscarAnunciosDoVendedor(conexao.ml_user_id),
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
      produto_id: produtoId,
      titulo_ml: a.titulo,
      preco_ml: a.preco,
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
```

- [ ] **Step 2: Add the import UI to `app/painel/integracoes/lojas/page.tsx`**

Add inside the `conexaoML ? (...)` branch written in Task 6, right after
the existing status block — a client-side button (needs `'use client'`
locally since it calls a server action and shows a result message; the
page itself stays a server component, so extract a small client piece):

Create `app/painel/integracoes/lojas/ImportarAnunciosBotao.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { importarAnuncios } from './actions'

export function ImportarAnunciosBotao() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const handleClick = async () => {
    setCarregando(true)
    setMensagem('')
    const res = await importarAnuncios()
    setMensagem(
      res.ok
        ? `${res.casados} anúncio(s) casado(s) com produto, ${res.semCorrespondencia} sem correspondência.`
        : res.erro ?? 'Erro ao importar.'
    )
    setCarregando(false)
    router.refresh()
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

Then in `page.tsx`, import and render it inside the connected-state block:

```tsx
import { ImportarAnunciosBotao } from './ImportarAnunciosBotao'
```

and add `<ImportarAnunciosBotao />` right after the "Ativo" badge div,
still inside the `conexaoML ? (...)` card.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Manual check**

With the connection from Task 6 still live, visit `/painel/integracoes/lojas`,
click "Importar Anúncios". Expect a message like "N anúncio(s) casado(s)
com produto, M sem correspondência." Query
`integracoes_mercado_livre_anuncios` directly and confirm rows exist with
`produto_id` set for codes that exist in `produtos.codigo`, and null for
the rest.

- [ ] **Step 5: Commit**

```bash
git add app/painel/integracoes/lojas/actions.ts app/painel/integracoes/lojas/page.tsx app/painel/integracoes/lojas/ImportarAnunciosBotao.tsx
git commit -m "Importa anuncios existentes do Mercado Livre casando por codigo"
```

---

### Task 9: Webhook de pedidos

**Files:**
- Create: `app/api/integracoes/mercado-livre/webhook/route.ts`

**Interfaces:**
- Consumes: `chamarML`, `tokenValido` from `@/lib/mercado-livre`; `createServiceClient` from `@/lib/supabase/server`.
- Produces: `POST /api/integracoes/mercado-livre/webhook` — always responds `200`.

- [ ] **Step 1: Write the route**

```ts
import { createServiceClient } from '@/lib/supabase/server'
import { chamarML } from '@/lib/mercado-livre'
import type { NextRequest } from 'next/server'

type Notificacao = { topic: string; resource: string; user_id: number; sent: string }
type PedidoML = {
  id: number
  status: string
  total_amount: number
  buyer: { nickname: string }
  order_items: { item: { id: string }; quantity: number; unit_price: number }[]
}

export async function POST(req: NextRequest) {
  let body: Notificacao
  try {
    body = await req.json()
  } catch {
    return new Response('ok', { status: 200 }) // corpo ilegível — não é nosso problema, so 200 e ignora
  }

  if (body.topic !== 'orders_v2') return new Response('ok', { status: 200 })

  const supabase = await createServiceClient()

  try {
    const pedido = await chamarML<PedidoML>(body.resource)
    if (pedido.status !== 'paid') return new Response('ok', { status: 200 })

    const { data: jaExiste } = await supabase
      .from('vendas')
      .select('id')
      .eq('ml_order_id', String(pedido.id))
      .maybeSingle()
    if (jaExiste) return new Response('ok', { status: 200 }) // idempotencia

    const { data: jaPendente } = await supabase
      .from('integracoes_mercado_livre_pedidos_pendentes')
      .select('id')
      .eq('ml_order_id', String(pedido.id))
      .maybeSingle()
    if (jaPendente) return new Response('ok', { status: 200 })

    const mlItemIds = pedido.order_items.map((i) => i.item.id)
    const { data: anuncios } = await supabase
      .from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, produto_id')
      .in('ml_item_id', mlItemIds)
    const produtoPorItem = new Map((anuncios ?? []).map((a) => [a.ml_item_id, a.produto_id]))

    const itemSemProduto = pedido.order_items.find((i) => !produtoPorItem.get(i.item.id))
    if (itemSemProduto) {
      await registrarPendencia(supabase, pedido, 'Item sem produto correspondente cadastrado')
      return new Response('ok', { status: 200 })
    }

    const itens = pedido.order_items.map((i) => ({
      produto_id: produtoPorItem.get(i.item.id),
      nome: i.item.id,
      quantidade: i.quantity,
      preco_unitario: i.unit_price,
    }))

    const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'
    const { data, error } = await supabase.rpc('finalizar_venda', {
      p_itens: itens,
      p_pagamentos: [{ forma_pagamento_id: 'FP_MERCADOLIVRE', valor: pedido.total_amount, taxa: 0, status: 'pago' }],
      p_pessoa_id: null,
      p_desconto: 0,
      p_observacoes: `Pedido Mercado Livre #${pedido.id} — comprador: ${pedido.buyer.nickname}`,
      p_deposito_id: DEPOSITO_PETROPOLIS_LOJA,
    })

    if (error || !data) {
      await registrarPendencia(supabase, pedido, error?.message ?? 'finalizar_venda retornou vazio')
      return new Response('ok', { status: 200 })
    }

    // Sem UPDATE de caixa_id de propósito — venda do ML nunca entra na
    // conferência de caixa físico (ver spec, Peça 3).
    await supabase.from('vendas').update({ ml_order_id: String(pedido.id) }).eq('id', data.venda_id as string)

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

async function registrarPendencia(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  pedido: PedidoML,
  motivo: string
) {
  await supabase.from('integracoes_mercado_livre_pedidos_pendentes').insert({
    ml_order_id: String(pedido.id),
    motivo,
    payload: pedido,
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check (without a real order)**

Real end-to-end testing needs an actual paid Mercado Livre order, which
this plan cannot trigger on demand. Verify what's checkable without one:
`curl -s -X POST http://localhost:3000/api/integracoes/mercado-livre/webhook -H "Content-Type: application/json" -d '{"topic":"items","resource":"/items/123","user_id":1,"sent":"2026-01-01"}'`
— expect `200 ok` immediately (topic isn't `orders_v2`, short-circuits).
Then `curl -s -X POST http://localhost:3000/api/integracoes/mercado-livre/webhook -H "Content-Type: application/json" -d 'not json'`
— expect `200 ok` (illegible body handled). Note in the report that the
`orders_v2` path itself needs a real Mercado Livre sandbox/test order to
verify — flag this to the user rather than claiming full coverage.

- [ ] **Step 4: Commit**

```bash
git add app/api/integracoes/mercado-livre/webhook/route.ts
git commit -m "Cria webhook que transforma pedido pago do Mercado Livre em venda"
```

---

### Task 10: Meus Pedidos mostra pedidos sincronizados e pendências

**Files:**
- Modify: `app/painel/integracoes/pedidos/page.tsx`

**Interfaces:**
- Consumes: `createServiceClient`, `fetchAll` from `@/lib/supabase/server`.

- [ ] **Step 1: Rewrite the page with real data**

Current file (from the earlier plan) is a static empty table. Make it
read real `vendas` with `ml_order_id` set, plus pending orders.

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL, formatDate } from '@/lib/utils'
import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default async function IntegracoesPedidosPage() {
  const supabase = await createServiceClient()
  const [{ data: vendas }, { data: pendentes }] = await Promise.all([
    supabase
      .from('vendas')
      .select('id, numero, total, created_at, ml_order_id')
      .not('ml_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('integracoes_mercado_livre_pedidos_pendentes')
      .select('id, ml_order_id, motivo, criado_em, resolvido')
      .eq('resolvido', false)
      .order('criado_em', { ascending: false }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Pedidos</h2>
        <Dica texto="Pedidos importados das lojas/marketplaces conectados." />
      </div>

      {(pendentes ?? []).length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            {pendentes!.length} pedido(s) do Mercado Livre precisam de revisão manual
          </p>
          <ul className="space-y-1 text-sm text-amber-700">
            {pendentes!.map((p) => (
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
            {(vendas ?? []).length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum pedido — conecte uma loja pra importar pedidos.</td></tr>
            ) : vendas!.map((v) => (
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/pedidos`. Expect: empty table (no real ML order
has landed yet) and no amber pending-orders box (none exist yet) — both
correct, this only becomes non-empty once Task 9's webhook actually fires
on a real order.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/pedidos/page.tsx
git commit -m "Meus Pedidos mostra vendas sincronizadas do Mercado Livre e pendencias"
```

---

### Task 11: `sincronizarEstoqueML` — empurra estoque pro Mercado Livre

**Files:**
- Modify: `lib/mercado-livre.ts`

**Interfaces:**
- Consumes: `chamarML`, `conexaoAtual` (this file); `createServiceClient` from `@/lib/supabase/server`.
- Produces: `export async function sincronizarEstoqueML(produtoId: string): Promise<void>` — never throws (catches and logs internally). Consumed by Task 12.

- [ ] **Step 1: Append to `lib/mercado-livre.ts`**

```ts
const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

// Chamar depois de QUALQUER mudança em estoque do depósito Petrópolis Loja
// (venda de balcão, devolução, ajuste manual, venda do próprio Mercado
// Livre). Fire-and-forget por design: nunca deixa uma falha na API do ML
// derrubar a operação de estoque/venda que já aconteceu de verdade —
// mesmo princípio já usado neste projeto pra escrita de caixa na
// devolução (ver app/painel/devolucoes/actions.ts).
export async function sincronizarEstoqueML(produtoId: string): Promise<void> {
  try {
    const conexao = await conexaoAtual()
    if (!conexao) return // nao conectado, nada a fazer

    const supabase = await createServiceClient()
    const [{ data: anuncio }, { data: estoque }] = await Promise.all([
      supabase
        .from('integracoes_mercado_livre_anuncios')
        .select('ml_item_id')
        .eq('produto_id', produtoId)
        .maybeSingle(),
      supabase
        .from('estoque')
        .select('quantidade')
        .eq('produto_id', produtoId)
        .eq('deposito_id', DEPOSITO_PETROPOLIS_LOJA)
        .maybeSingle(),
    ])
    if (!anuncio) return // produto nao tem anuncio no ML, nada a fazer

    const quantidade = Math.max(0, Math.round(estoque?.quantidade ?? 0))
    await chamarML(`/items/${anuncio.ml_item_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available_quantity: quantidade }),
    })
  } catch (e) {
    console.error(`Falha ao sincronizar estoque do produto ${produtoId} com o Mercado Livre:`, e)
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add lib/mercado-livre.ts
git commit -m "Adiciona sincronizacao de estoque com o Mercado Livre"
```

---

### Task 12: Chama `sincronizarEstoqueML` nos 5 pontos que mexem em estoque

**Files:**
- Modify: `app/painel/pdv/actions.ts` (~line 369, right after the `caixa_id` update)
- Modify: `app/painel/devolucoes/actions.ts` (~line 244, right after `registrar_devolucao` succeeds)
- Modify: `app/painel/estoque/actions.ts` (two call sites: single-item `registrarMovimento` ~line 90, and batch `registrarMovimentoLote` ~line 208)
- Modify: `app/painel/estoque/conferencia/actions.ts` (~line 165, inside the loop)

**Interfaces:**
- Consumes: `sincronizarEstoqueML` from `@/lib/mercado-livre` (Task 11).

- [ ] **Step 1: `app/painel/pdv/actions.ts`**

Add the import near the top of the file (alongside existing imports), and
call it once per item sold, right after the existing `caixa_id` update
block (around line 369):

```ts
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
```

```ts
  // Amarra a venda ao caixa aberto (pro fechamento X/Z reconciliar por caixa).
  // Silencioso se a coluna caixa_id ainda não existe (pré-migração).
  try { await supabase.from('vendas').update({ caixa_id: caixaId }).eq('id', data.venda_id as string) } catch { /* pré-migração */ }

  // Estoque mudou pra cada item vendido — avisa o Mercado Livre se algum
  // deles tiver anúncio linkado (fire-and-forget, nunca falha a venda).
  // `itens` já é `ItemCarrinho[]` (parâmetro da função) — tem `produto_id`.
  for (const item of itens) {
    void sincronizarEstoqueML(item.produto_id)
  }
```

- [ ] **Step 2: `app/painel/devolucoes/actions.ts`**

Add the import, and call it once per returned item, right after the RPC
succeeds (around line 244, after `if (!data) throw ...`):

```ts
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
```

```ts
  const devolucaoId = (data as { devolucao_id: string }).devolucao_id
  const reembolso = Number((data as { reembolso?: number }).reembolso ?? 0)

  for (const item of input.itens) {
    void sincronizarEstoqueML(item.produto_id)
  }
```

- [ ] **Step 3: `app/painel/estoque/actions.ts` — single-item movimentação**

Add the import once at the top of the file:

```ts
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
```

Find this exact block (currently at lines 82-92):

```ts
  const { error } = await supabase.rpc('movimentar_estoque', {
    p_produto_id: produto_id,
    p_deposito_id: deposito_id,
    p_operacao: operacao,
    p_quantidade: quantidade,
    p_series: [],
    p_observacao: observacao,
    p_user: user.id,
    p_created_at: createdAt,
  })
  if (error) redirect(`/painel/estoque/historico?erro=${encodeURIComponent(error.message)}`)
```

Replace with:

```ts
  const { error } = await supabase.rpc('movimentar_estoque', {
    p_produto_id: produto_id,
    p_deposito_id: deposito_id,
    p_operacao: operacao,
    p_quantidade: quantidade,
    p_series: [],
    p_observacao: observacao,
    p_user: user.id,
    p_created_at: createdAt,
  })
  if (error) redirect(`/painel/estoque/historico?erro=${encodeURIComponent(error.message)}`)
  void sincronizarEstoqueML(produto_id)
```

- [ ] **Step 4: `app/painel/estoque/actions.ts` — batch movimentação**

In the same file, find this exact block (currently at lines 200-212, inside
the batch loop):

```ts
    const { data, error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: produtoId,
      p_deposito_id: deposito_id,
      p_operacao: item.operacao,
      p_quantidade: Math.round(item.quantidade),
      p_series: imeis.map((serie) => ({ serie })),
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: createdAt,
    })
    if (error) { erroRpc = error.message; break }
    imeisDuplicados += (data as { duplicados?: number })?.duplicados ?? 0
```

Replace with:

```ts
    const { data, error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: produtoId,
      p_deposito_id: deposito_id,
      p_operacao: item.operacao,
      p_quantidade: Math.round(item.quantidade),
      p_series: imeis.map((serie) => ({ serie })),
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: createdAt,
    })
    if (error) { erroRpc = error.message; break }
    imeisDuplicados += (data as { duplicados?: number })?.duplicados ?? 0
    void sincronizarEstoqueML(produtoId)
```

- [ ] **Step 5: `app/painel/estoque/conferencia/actions.ts`**

Add the import at the top of the file:

```ts
import { sincronizarEstoqueML } from '@/lib/mercado-livre'
```

Find this exact block (currently at lines 157-169):

```ts
    const { error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: m.produto_id,
      p_deposito_id: deposito_id,
      p_operacao: operacao,
      p_quantidade: quantidade,
      p_series: [],
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: new Date().toISOString(),
    })
    if (error) {
      return { ok: false, aplicadas, erro: `Erro no produto ${m.nome}: ${error.message}. Foram aplicadas ${aplicadas} antes de parar.` }
    }
```

Replace with:

```ts
    const { error } = await supabase.rpc('movimentar_estoque', {
      p_produto_id: m.produto_id,
      p_deposito_id: deposito_id,
      p_operacao: operacao,
      p_quantidade: quantidade,
      p_series: [],
      p_observacao: observacao,
      p_user: user.id,
      p_created_at: new Date().toISOString(),
    })
    if (error) {
      return { ok: false, aplicadas, erro: `Erro no produto ${m.nome}: ${error.message}. Foram aplicadas ${aplicadas} antes de parar.` }
    }
    void sincronizarEstoqueML(m.produto_id)
```

(This block is followed by `aplicadas++` a couple of lines later in the
existing file — leave that line untouched, the sync call above is
independent of the counter.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 7: Manual check**

With the Mercado Livre connection and at least one imported anúncio from
Task 8 still live: pick a produto that DID match an anúncio, do a small
real stock movement for it via "Estoque → Movimentar Estoque" (e.g.
"ajuste" to the same current quantity, harmless), and confirm — via the
Mercado Livre seller site or `GET /items/{id}` — that `available_quantity`
matches. This is the one check in this whole plan that proves the stock
sync direction TecnoCell → Mercado Livre actually works end to end.

- [ ] **Step 8: Commit**

```bash
git add app/painel/pdv/actions.ts app/painel/devolucoes/actions.ts app/painel/estoque/actions.ts app/painel/estoque/conferencia/actions.ts
git commit -m "Sincroniza estoque com o Mercado Livre em toda mudanca no deposito Petropolis Loja"
```

---

### Task 13: Verificação final

**Files:**
- None created/modified — this task only verifies Tasks 1–12 together.

- [ ] **Step 1: Whole-project type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 2: Confirm the connection is still healthy**

Re-run the manual check from Task 6 (or just re-visit `/painel/integracoes`
and confirm the card still shows "Conectado como..." — the connection
made during Task 6 should still be valid, `tokenValido()` should have kept
it refreshed if any task's manual checks called the ML API since).

- [ ] **Step 3: Confirm normal PDV sales still work**

Run one small real sale through the PDV exactly like earlier in this
project's testing history (search a cheap product with stock, pay exact
amount, confirm). This is the regression check that Task 12's edits to
`app/painel/pdv/actions.ts` didn't break the existing sale flow — the
`sincronizarEstoqueML` call must never prevent a sale from completing,
even for a product with no Mercado Livre anúncio (the function returns
early and silently in that case).

- [ ] **Step 4: git status clean**

Run: `git status --short`
Expected: no output — everything from Tasks 1-12 already committed.

- [ ] **Step 5: Report open items to the user**

This plan cannot fully verify Peça 3 (webhook → real order → venda) or
the Mercado Livre → TecnoCell direction of Peça 4, because both need a
real paid Mercado Livre order, which nothing in this plan can trigger.
Report clearly: the connection, import, and TecnoCell → Mercado Livre
stock push are verified end-to-end; the order webhook is verified only
for its safe-rejection paths (wrong topic, bad body) — it needs a real
order (or a Mercado Livre test/sandbox order, if the user's account has
access to one) to confirm the full path before relying on it at the
counter.
