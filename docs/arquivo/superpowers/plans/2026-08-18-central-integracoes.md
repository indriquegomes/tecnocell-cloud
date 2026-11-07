# Central de Integrações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full "Central de Integrações" navigation shell — 9 sections + submenus, matching the structure mapped live from SIGE — with zero real integrations connected. Every "Conectar"/"Adicionar" action shows an honest "not available yet" message instead of pretending to work.

**Architecture:** New top-level Next.js App Router module under `app/painel/integracoes/`, one `page.tsx` per section (server components, mostly static — only "Meus Produtos" reads real data). No new server actions, no new Supabase tables. A single reusable client component (`BotaoIndisponivel`) handles every "not connected yet" button. Sidebar and permission catalog get one new entry group each, following the exact pattern every other module already uses.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4 (brand colors already remapped onto `blue-*`/`accent-*`), Supabase (service-role reads only, no writes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-18-central-integracoes-design.md`

## Global Constraints

- No new Supabase tables/migrations in this plan (spec: "Dado / banco").
- Permission key is exactly `integracoes`, added to `lib/permissoes.ts` following the existing `ROTAS_PERMISSAO`/`TODAS_PERMISSOES` shape.
- Routes live under `app/painel/integracoes/` exactly as listed in the spec's "Estrutura no TecnoCell" table — no renaming.
- Brand blue = Tailwind `blue-600`/`blue-700` (already remapped to `#1B6CA8`/`#155A8F` in `app/globals.css`); brand orange = `accent-500`/`accent-600`. Module-header icon uses inline `text-[#1B6CA8]`, matching `marcas`/`categorias`/`tabelas-preco` exactly — nowhere else in this plan uses inline hex.
- Every "Conectar" / "Adicionar Loja" / "Adicionar Integração" / "Adicionar Expedição" / "Adicionar Plataforma" button must show the literal message **"Integração ainda não disponível — em construção."** on click — never a silent no-op, never a fake success state.
- "Meus Produtos" is the one page with real data: it reads the existing `produtos`/`estoque`/`categorias` tables, read-only, no new columns.
- This project has no unit test framework (`CLAUDE.md`: "Não há suíte de testes unitários"). The test cycle for every task in this plan is: `npx tsc --noEmit` (must exit 0) + a manual browser check described in the task. Task 13 adds one consolidated Playwright smoke script covering all 9 routes.
- Don't touch `app/painel/pdv/`, any RPC, or any money/stock-writing code path — this plan is 100% read-only UI.

---

### Task 1: Permission catalog + sidebar icon

**Files:**
- Modify: `lib/permissoes.ts`
- Modify: `components/icons.tsx`

**Interfaces:**
- Produces: permission key `'integracoes'` usable by `requirePermissao('integracoes')` and `temPermissao(permissoes, 'integracoes', isMaster)` in later tasks. Produces `IconIntegracao` component (same signature as every other icon: `(p: SVGProps<SVGSVGElement>) => ReactNode`) for later tasks to import from `@/components/icons`.

- [ ] **Step 1: Add the 9 routes to `ROTAS_PERMISSAO`**

In `lib/permissoes.ts`, add these lines inside the existing `ROTAS_PERMISSAO` object (anywhere — order doesn't matter, existing entries aren't alphabetized either):

```ts
  '/painel/integracoes':                    'integracoes',
  '/painel/integracoes/lojas':               'integracoes',
  '/painel/integracoes/produtos':            'integracoes',
  '/painel/integracoes/pedidos':             'integracoes',
  '/painel/integracoes/sincronizacoes':      'integracoes',
  '/painel/integracoes/mensagens':           'integracoes',
  '/painel/integracoes/financeiras':         'integracoes',
  '/painel/integracoes/expedicao':           'integracoes',
  '/painel/integracoes/drop-shipping':       'integracoes',
```

- [ ] **Step 2: Add the permission itself to `TODAS_PERMISSOES`**

In the same file, inside the `TODAS_PERMISSOES` array, under the existing `grupo: 'Módulos'` entries, add:

```ts
  { grupo: 'Módulos',  key: 'integracoes', label: 'Integrações',          desc: 'E-commerce, marketplace, pagamento, logística e drop shipping' },
```

- [ ] **Step 3: Add `IconIntegracao` to `components/icons.tsx`**

Append this export (plug/link glyph — Lucide `plug` path, same `Base` wrapper every other icon uses):

```tsx
export const IconIntegracao = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></Base>
)
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/permissoes.ts components/icons.tsx
git commit -m "Adiciona permissao e icone pro modulo Integracoes"
```

---

### Task 2: Sidebar entry

**Files:**
- Modify: `components/Sidebar.tsx`

**Interfaces:**
- Consumes: `IconIntegracao`, `IconStore`, `IconPackage`, `IconClipboard`, `IconSwap`, `IconFile`, `IconWallet` from `@/components/icons` (all already exist except `IconIntegracao`, added in Task 1). Consumes permission key `'integracoes'` (added in Task 1).
- Produces: 9 visible nav links once the routes exist (Tasks 4–12) and the user has the `integracoes` permission or is Master.

- [ ] **Step 1: Add the 9 icons to the `ICONS` map**

In `components/Sidebar.tsx`, the `ICONS` map (around line 16), add:

```tsx
  '/painel/integracoes':                IconIntegracao,
  '/painel/integracoes/lojas':          IconStore,
  '/painel/integracoes/produtos':       IconPackage,
  '/painel/integracoes/pedidos':        IconClipboard,
  '/painel/integracoes/sincronizacoes': IconSwap,
  '/painel/integracoes/mensagens':      IconFile,
  '/painel/integracoes/financeiras':    IconWallet,
  '/painel/integracoes/expedicao':      IconSwap,
  '/painel/integracoes/drop-shipping':  IconPackage,
```

And add `IconIntegracao` to the existing icon import block at the top of the file (the `import { IconDashboard, IconUser, ... } from '@/components/icons'` line) — just add `IconIntegracao` to that list, don't reformat the rest.

- [ ] **Step 2: Add the new group to `navCompleto`**

Add this group to the `navCompleto` array — place it right after the `'Cadastros'` group and before `'Admin'` (matches the module's position in the CLAUDE.md module list, after Cadastros-level modules and before Admin-level ones):

```ts
  {
    group: 'Integrações',
    items: [
      { href: '/painel/integracoes',                label: 'Dashboard',                permissao: 'integracoes' },
      { href: '/painel/integracoes/lojas',           label: 'Minhas Lojas',             permissao: 'integracoes' },
      { href: '/painel/integracoes/produtos',        label: 'Meus Produtos',            permissao: 'integracoes' },
      { href: '/painel/integracoes/pedidos',         label: 'Meus Pedidos',             permissao: 'integracoes' },
      { href: '/painel/integracoes/sincronizacoes',  label: 'Sincronizações Pendentes', permissao: 'integracoes' },
      { href: '/painel/integracoes/mensagens',       label: 'Mensagens Automáticas',    permissao: 'integracoes' },
      { href: '/painel/integracoes/financeiras',     label: 'Financeiras',              permissao: 'integracoes' },
      { href: '/painel/integracoes/expedicao',       label: 'Expedição',                permissao: 'integracoes' },
      { href: '/painel/integracoes/drop-shipping',   label: 'Drop Shipping',            permissao: 'integracoes' },
    ],
  },
```

**Important:** `exactOnly` (near the top of the `Sidebar` component) currently lists `['/painel', '/painel/estoque']` — routes that must match *exactly* to be "active" rather than prefix-matched. `/painel/integracoes` (the Dashboard) has 8 sub-routes nested under it (`/painel/integracoes/lojas`, etc.), so without adding it to `exactOnly`, visiting `/painel/integracoes/produtos` would make the **Dashboard** link *also* show active (because `pathname.startsWith('/painel/integracoes')` is true for every sub-route). Add `'/painel/integracoes'` to the `exactOnly` array, same reasoning as `/painel/estoque`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0. (The 9 routes don't exist as pages yet — that's fine, `Link href` doesn't require the route to exist at compile time in this Next.js version's typed-routes setup used elsewhere in the file; if `tsc` complains about `href` typing, confirm by checking how `navCompleto` already references not-yet-built routes elsewhere — it doesn't, so this is a fresh check.)

- [ ] **Step 4: Manual check**

Start the dev server (`npm run dev` if not already running) and load `/painel` as a Master user. Expect: sidebar shows a new **"Integrações"** section, closed by default, with 9 items. Clicking any of them 404s for now (pages come in later tasks) — that's expected at this point.

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "Adiciona secao Integracoes no menu lateral"
```

---

### Task 3: Shared platform catalog + "not available" button

**Files:**
- Create: `lib/integracoes.ts`
- Create: `components/BotaoIndisponivel.tsx`

**Interfaces:**
- Produces: `PLATAFORMAS: Plataforma[]` (type `{ chave: string; nome: string }`) from `lib/integracoes.ts`, consumed by Task 4 (Dashboard cards).
- Produces: `<BotaoIndisponivel label={string} className?={string} />` client component, consumed by Tasks 4, 5, 10, 11, 12.

- [ ] **Step 1: Write `lib/integracoes.ts`**

```ts
// Catálogo de plataformas de e-commerce/marketplace que o SIGE já integra
// (mapeado ao vivo em ec.sigecloud.com.br, 18/08/2026). Nenhuma está
// conectada de verdade no TecnoCell ainda — cada conexão real vira um
// projeto próprio quando houver credencial da plataforma (ex: Mercado
// Livre precisa do TecnoCell virar app cadastrado no Mercado Livre
// Developers antes de qualquer código de OAuth).
export type Plataforma = { chave: string; nome: string }

export const PLATAFORMAS: Plataforma[] = [
  { chave: 'loja-integrada', nome: 'Loja Integrada' },
  { chave: 'magento',        nome: 'Magento' },
  { chave: 'magento2',       nome: 'Magento 2' },
  { chave: 'mercado-livre',  nome: 'Mercado Livre' },
  { chave: 'woocommerce',    nome: 'WooCommerce' },
  { chave: 'neo',            nome: 'NEO' },
  { chave: 'via-marketplace', nome: 'Via Marketplace' },
  { chave: 'moovin',         nome: 'Moovin' },
  { chave: 'magalu',         nome: 'Magazine Luiza Marketplace' },
  { chave: 'b2w',            nome: 'B2W' },
  { chave: 'nuvemshop',      nome: 'Nuvem Shop' },
  { chave: 'shopee',         nome: 'Shopee' },
  { chave: 'amazon',         nome: 'Amazon' },
  { chave: 'ecomece',        nome: 'Ecomece' },
]
```

- [ ] **Step 2: Write `components/BotaoIndisponivel.tsx`**

```tsx
'use client'
import { useState } from 'react'

// Botao reutilizavel pra qualquer acao de integracao que ainda nao existe
// de verdade (Conectar, Adicionar Loja, Adicionar Integracao...). Nunca
// finge que funciona -- avisa e para ai. Cada instancia tem seu proprio
// estado, entao varios cards na mesma tela nao se atrapalham.
export function BotaoIndisponivel({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  const [avisado, setAvisado] = useState(false)

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setAvisado(true)}
        className={className ?? 'rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition'}
      >
        {label}
      </button>
      {avisado && (
        <p className="text-xs font-medium text-amber-600">
          Integração ainda não disponível — em construção.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/integracoes.ts components/BotaoIndisponivel.tsx
git commit -m "Adiciona catalogo de plataformas e botao de integracao indisponivel"
```

---

### Task 4: Dashboard page (`/painel/integracoes`)

**Files:**
- Create: `app/painel/integracoes/page.tsx`

**Interfaces:**
- Consumes: `IconIntegracao` (`@/components/icons`), `Dica` (`@/components/Dica`), `BotaoIndisponivel` (`@/components/BotaoIndisponivel`), `PLATAFORMAS` (`@/lib/integracoes`).

- [ ] **Step 1: Write the page**

```tsx
import { IconIntegracao } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'
import { PLATAFORMAS } from '@/lib/integracoes'

export default function IntegracoesDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconIntegracao className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Integrações</h2>
        <Dica texto="Central de e-commerce, marketplace, pagamento, logística e drop shipping. Nenhuma integração está conectada ainda — cada uma vira um projeto próprio quando tiver a credencial da plataforma." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PLATAFORMAS.map((p) => (
          <div key={p.chave} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-gray-800">{p.nome}</p>
              <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                Não conectado
              </span>
            </div>
            <BotaoIndisponivel
              label="Conectar"
              className="w-full rounded-xl border border-blue-200 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes`. Expect: header "Integrações", 14 cards (Loja Integrada, Magento, Magento 2, Mercado Livre, WooCommerce, NEO, Via Marketplace, Moovin, Magazine Luiza Marketplace, B2W, Nuvem Shop, Shopee, Amazon, Ecomece), each with a "Não conectado" badge and a "Conectar" button. Click one "Conectar" button — the amber warning text appears under that specific card only, the others stay unaffected. Sidebar's "Dashboard" item under Integrações is highlighted active; the other 8 items are not (confirms Task 2's `exactOnly` fix worked).

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/page.tsx
git commit -m "Cria dashboard da Central de Integracoes"
```

---

### Task 5: Minhas Lojas page

**Files:**
- Create: `app/painel/integracoes/lojas/page.tsx`

**Interfaces:**
- Consumes: `IconStore` (`@/components/icons`), `Dica`, `BotaoIndisponivel`.

- [ ] **Step 1: Write the page**

```tsx
import { IconStore } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'

export default function IntegracoesLojasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Minhas Lojas</h2>
        <Dica texto="Lojas virtuais e marketplaces conectados. Cada loja conectada mostra anúncios, vendas, perguntas e catálogo — só depois de conectada de verdade." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Nenhuma loja conectada ainda.</p>
        <div className="mt-4 flex justify-center">
          <BotaoIndisponivel label="+ Adicionar Loja" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/lojas`. Expect: header "Minhas Lojas", empty-state card, "+ Adicionar Loja" button that shows the "não disponível" warning on click.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/lojas/page.tsx
git commit -m "Cria pagina Minhas Lojas da Central de Integracoes"
```

---

### Task 6: Meus Produtos page (real data)

**Files:**
- Create: `app/painel/integracoes/produtos/page.tsx`

**Interfaces:**
- Consumes: `createServiceClient` (`@/lib/supabase/server`), `formatBRL` (`@/lib/utils`), `IconPackage` (`@/components/icons`), `Dica`, `BuscaLista` (`@/components/BuscaLista`), `Paginacao` (`@/components/Paginacao`).
- Reads: `produtos` table (`id, nome, preco, ativo, busca_norm`), embedded `estoque(quantidade)`, embedded `categorias(nome)`. Read-only — no writes.

- [ ] **Step 1: Write the page**

```tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BuscaLista } from '@/components/BuscaLista'
import { Paginacao } from '@/components/Paginacao'

const POR_PAGINA = 30

type ProdutoLinha = {
  id: string
  nome: string
  preco: number | null
  estoque: { quantidade: number | null }[] | null
  categorias: { nome: string } | null
}

export default async function IntegracoesProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string }>
}) {
  const { busca, pagina: paginaStr } = await searchParams
  const pagina = Math.max(1, Number(paginaStr) || 1)
  const supabase = await createServiceClient()

  let q = supabase
    .from('produtos')
    .select('id, nome, preco, estoque(quantidade), categorias(nome)', { count: 'exact' })
    .eq('ativo', true)
    .order('nome')

  const termo = busca?.trim()
  if (termo) {
    // Mesmo jeito de tirar acento usado em app/painel/tabelas-preco/actions.ts
    // (buscarProdutosParaTabela) — charCodeAt em vez de regex com unicode
    // embutido, pra não arriscar corromper o arquivo (projeto já teve
    // problema de encoding antes, ver CLAUDE.md).
    const semAcento = termo.normalize('NFD').split('')
      .filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 })
      .join('').toLowerCase()
    q = q.ilike('busca_norm', `%${semAcento}%`)
  }

  const de = (pagina - 1) * POR_PAGINA
  const { data, count } = await q.range(de, de + POR_PAGINA - 1)
  const produtos = (data ?? []) as unknown as ProdutoLinha[]
  const total = count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Produtos</h2>
        <Dica texto="Catálogo do TecnoCell, pronto pra anunciar quando alguma integração for conectada de verdade. Nenhum produto está integrado ainda." />
      </div>

      <BuscaLista basePath="/painel/integracoes/produtos" placeholder="Buscar produto..." />

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Categoria</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Preço Venda</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estoque</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Integrado com</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {produtos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
            ) : produtos.map((p) => {
              const estoqueTotal = (p.estoque ?? []).reduce((soma, e) => soma + (e.quantidade ?? 0), 0)
              return (
                <tr key={p.id} className="hover:bg-blue-50/60 transition">
                  <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.nome}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.categorias?.nome ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{formatBRL(p.preco ?? 0)}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">{estoqueTotal}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Não integrado</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Paginacao
          pagina={pagina}
          totalPaginas={totalPaginas}
          total={total}
          params={termo ? { busca: termo } : {}}
          basePath="/painel/integracoes/produtos"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0. If it complains about the shape of `estoque`/`categorias` in the select's inferred type, that's expected — Supabase's generated types don't always match embedded selects; the `as unknown as ProdutoLinha[]` cast (same idiom already used in `app/painel/tabelas-preco/[id]/page.tsx`) is what resolves it. Don't loosen types further than that cast.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/produtos`. Expect: real products from the catalog listed (not empty), with category name (not the raw hierarquia code), price formatted as `R$ X,XX`, stock quantity, and "Não integrado" badge on every row. Type something in the search box — list narrows after ~350ms without a full page reload. Confirm pagination controls appear if there are more than 30 active products (there are — this session brought the catalog to 1.629 products).

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/produtos/page.tsx
git commit -m "Cria pagina Meus Produtos da Central de Integracoes"
```

---

### Task 7: Meus Pedidos page

**Files:**
- Create: `app/painel/integracoes/pedidos/page.tsx`

**Interfaces:**
- Consumes: `IconClipboard` (`@/components/icons`), `Dica`.

- [ ] **Step 1: Write the page**

```tsx
import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'

const COLUNAS = [
  'Código Ecommerce', 'Cliente', 'Data Criação', 'Status',
  'Status do Envio', 'Valor', 'Origem', 'Última Sincronização',
]

export default function IntegracoesPedidosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconClipboard className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Meus Pedidos</h2>
        <Dica texto="Pedidos importados das lojas/marketplaces conectados. Vazio até a primeira integração ser conectada de verdade." />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {COLUNAS.map((c) => (
                <th key={c} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={COLUNAS.length} className="px-4 py-10 text-center text-sm text-gray-400">
                Nenhum pedido — conecte uma loja pra importar pedidos.
              </td>
            </tr>
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

Visit `/painel/integracoes/pedidos`. Expect: header "Meus Pedidos", table with the 8 correct column headers, empty-state row spanning all columns.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/pedidos/page.tsx
git commit -m "Cria pagina Meus Pedidos da Central de Integracoes"
```

---

### Task 8: Sincronizações Pendentes page

**Files:**
- Create: `app/painel/integracoes/sincronizacoes/page.tsx`

**Interfaces:**
- Consumes: `IconSwap` (`@/components/icons`), `Dica`.

- [ ] **Step 1: Write the page**

```tsx
import { IconSwap } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default function IntegracoesSincronizacoesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconSwap className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Sincronizações Pendentes</h2>
        <Dica texto="Fila de produtos aguardando sincronizar com as lojas virtuais conectadas." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Nenhuma sincronização pendente.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/sincronizacoes`. Expect: header "Sincronizações Pendentes", empty-state card "Nenhuma sincronização pendente."

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/sincronizacoes/page.tsx
git commit -m "Cria pagina Sincronizacoes Pendentes da Central de Integracoes"
```

---

### Task 9: Mensagens Automáticas page

**Files:**
- Create: `app/painel/integracoes/mensagens/page.tsx`

**Interfaces:**
- Consumes: `IconFile` (`@/components/icons`), `Dica`.

- [ ] **Step 1: Write the page**

```tsx
import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default function IntegracoesMensagensPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mensagens Automáticas</h2>
        <Dica texto="Manda mensagem automática pro cliente quando um evento acontecer (ex: pedido despachado). Depende de uma loja conectada primeiro." />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Conecte uma loja em &quot;Minhas Lojas&quot; pra configurar mensagens automáticas.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/mensagens`. Expect: header "Mensagens Automáticas", empty-state text pointing at "Minhas Lojas".

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/mensagens/page.tsx
git commit -m "Cria pagina Mensagens Automaticas da Central de Integracoes"
```

---

### Task 10: Financeiras page

**Files:**
- Create: `app/painel/integracoes/financeiras/page.tsx`

**Interfaces:**
- Consumes: `IconWallet` (`@/components/icons`), `Dica`, `BotaoIndisponivel`.

- [ ] **Step 1: Write the page**

```tsx
import { IconWallet } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'

export default function IntegracoesFinanceirasPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconWallet className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Integrações Financeiras</h2>
          <Dica texto="Bancos digitais e meios de pagamento integrados. Nenhum conectado ainda." />
        </div>
        <BotaoIndisponivel label="+ Adicionar Integração" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Você ainda não configurou uma integração financeira.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/financeiras`. Expect: header "Integrações Financeiras", "+ Adicionar Integração" button top-right, empty-state card below.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/financeiras/page.tsx
git commit -m "Cria pagina Financeiras da Central de Integracoes"
```

---

### Task 11: Expedição page

**Files:**
- Create: `app/painel/integracoes/expedicao/page.tsx`

**Interfaces:**
- Consumes: `IconSwap` (`@/components/icons`), `Dica`, `BotaoIndisponivel`.

- [ ] **Step 1: Write the page**

```tsx
import { IconSwap } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'

export default function IntegracoesExpedicaoPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconSwap className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Expedição</h2>
          <Dica texto="Transportadoras e integrações de logística/entrega. Nenhuma conectada ainda." />
        </div>
        <BotaoIndisponivel label="+ Adicionar Expedição" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Você ainda não configurou uma expedição.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/expedicao`. Expect: header "Expedição", "+ Adicionar Expedição" button top-right, empty-state card below.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/expedicao/page.tsx
git commit -m "Cria pagina Expedicao da Central de Integracoes"
```

---

### Task 12: Drop Shipping page

**Files:**
- Create: `app/painel/integracoes/drop-shipping/page.tsx`

**Interfaces:**
- Consumes: `IconPackage` (`@/components/icons`), `Dica`, `BotaoIndisponivel`.

- [ ] **Step 1: Write the page**

```tsx
import { IconPackage } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { BotaoIndisponivel } from '@/components/BotaoIndisponivel'

export default function IntegracoesDropShippingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IconPackage className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Drop Shipping</h2>
          <Dica texto="Plataformas de fornecedor pra importar produto direto. Nenhuma conectada ainda." />
        </div>
        <BotaoIndisponivel label="+ Adicionar Plataforma" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-gray-500">Você ainda não configurou uma plataforma.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit code 0.

- [ ] **Step 3: Manual check**

Visit `/painel/integracoes/drop-shipping`. Expect: header "Drop Shipping", "+ Adicionar Plataforma" button top-right, empty-state card below.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/drop-shipping/page.tsx
git commit -m "Cria pagina Drop Shipping da Central de Integracoes"
```

---

### Task 13: Full-module smoke test + final verification

**Files:**
- None created/modified — this task only verifies Tasks 1–12 together.

**Interfaces:**
- Consumes: all 9 routes from Tasks 4–12, the sidebar from Task 2, the permission from Task 1.

- [ ] **Step 1: Type-check the whole project one more time**

Run: `npx tsc --noEmit`
Expected: exit code 0. This is the first check that compiles everything together — catches any cross-file mistake individual tasks couldn't see (e.g., an icon name typo that happened to match nothing).

- [ ] **Step 2: Write and run a Playwright smoke script**

Save as a temp file (same pattern used throughout this project's manual testing — see any `_test_*.mjs` used earlier in the project's history, delete it after running, never commit it):

```js
import { chromium } from 'playwright';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf-8').replace(/^﻿/, '').split('\n')
    .filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const ROTAS = [
  ['/painel/integracoes', 'Integrações'],
  ['/painel/integracoes/lojas', 'Minhas Lojas'],
  ['/painel/integracoes/produtos', 'Meus Produtos'],
  ['/painel/integracoes/pedidos', 'Meus Pedidos'],
  ['/painel/integracoes/sincronizacoes', 'Sincronizações Pendentes'],
  ['/painel/integracoes/mensagens', 'Mensagens Automáticas'],
  ['/painel/integracoes/financeiras', 'Integrações Financeiras'],
  ['/painel/integracoes/expedicao', 'Expedição'],
  ['/painel/integracoes/drop-shipping', 'Drop Shipping'],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/login');
await page.fill('input[name="email"]', env.TESTE_USUARIO_EMAIL);
await page.fill('input[name="password"]', env.TESTE_USUARIO_SENHA);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}), page.click('button[type="submit"]')]);

let falhas = 0;
for (const [rota, titulo] of ROTAS) {
  await page.goto(`http://localhost:3000${rota}`, { waitUntil: 'networkidle' });
  const status = await page.evaluate(() => document.title); // sanity: page rendered, not a 404 shell
  const temTitulo = await page.locator(`text=${titulo}`).first().isVisible().catch(() => false);
  console.log(rota, '->', temTitulo ? 'OK' : 'FALHOU (titulo nao encontrado)');
  if (!temTitulo) falhas++;
}

console.log(falhas === 0 ? 'TODAS AS ROTAS OK' : `${falhas} rota(s) com problema`);
await browser.close();
process.exit(falhas > 0 ? 1 : 0);
```

Run: `node _smoke_integracoes.mjs`
Expected: `TODAS AS ROTAS OK`, exit code 0.

- [ ] **Step 3: Clean up the temp script**

```bash
rm -f _smoke_integracoes.mjs
git status --short
```

Expected: no output (nothing pending — the smoke script was never committed).

- [ ] **Step 4: Manual permission check**

As a non-Master user without the `integracoes` permission, confirm the "Integrações" sidebar group doesn't render at all (matches how every other module's `permissao` gate already behaves — no new logic needed here, just confirming Task 1/2 wired the existing `temPermissao`/`podeVer` machinery correctly).

- [ ] **Step 5: Final commit (if anything is pending)**

```bash
git status --short
```

If clean (expected — every prior task already committed its own work), nothing to do. If anything is unexpectedly staged, investigate before committing — don't blindly `git add -A`.
