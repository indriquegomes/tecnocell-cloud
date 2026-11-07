# Dashboard da Loja Mercado Livre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the per-store Mercado Livre dashboard (Dashboard, Meus
Anúncios, Minhas Vendas, Perguntas e Respostas, Anúncios do Catálogo,
Mensagens pós-venda) reached from the connected store card in Minhas
Lojas.

**Architecture:** A tabbed sub-section under
`app/painel/integracoes/lojas/mercado-livre/`, each tab its own route.
Data functions live in a new `lib/mercado-livre-dashboard.ts` (keeps
`lib/mercado-livre.ts` focused on the API client). Two new webhook
topics (`questions`, `messages`) branch inside the existing
`app/api/integracoes/mercado-livre/webhook/route.ts`, reusing its
already-built idempotency/error-handling shape. No new npm dependency —
this project has no charting library; the "Fluxo de Vendas" panel is a
CSS-bar chart (matches the plain-Tailwind style used everywhere else in
this codebase, e.g. `app/painel/relatorios`).

**Tech Stack:** Next.js App Router (server components + server
actions), Supabase (service client, no RLS), Tailwind, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-19-dashboard-loja-mercado-livre-design.md`
(read alongside `docs/superpowers/specs/2026-08-19-mercado-livre-integracao-design.md`,
the foundation this builds on).

## Global Constraints

- Depósito fixo pra estoque do Mercado Livre: **PETRÓPOLIS LOJA**
  (`63d9054d59a9c829747233d4`) — mesma constante já usada em
  `lib/mercado-livre.ts` e no webhook de pedidos.
- Conexão é singleton: sempre `id = 'principal'` em
  `integracoes_mercado_livre`. Nunca ler/gravar outro id.
- Toda chamada à API do Mercado Livre passa por `chamarML()`
  (`lib/mercado-livre.ts`) — nunca lê `access_token` direto do banco em
  código novo.
- Qualquer lista que pode passar de 1000 linhas usa `fetchAll`/
  `fetchAllIn` de `lib/supabase/server.ts` — Supabase corta em 1000
  silenciosamente.
- Nunca usar `toISOString()` pra agrupar/exibir data — usar fuso
  `America/Sao_Paulo` (`diaSP()`, criada na Tarefa 3; `formatDate()` já
  existe em `lib/utils.ts`).
- Contadores que dependem de tabela ainda não criada nesta execução do
  plano (perguntas/mensagens, até as Tarefas 8/10 rodarem) devolvem `0`
  em vez de quebrar a página — nunca "N/A", nunca erro na tela.
- Sem fila assíncrona pros webhooks novos (mesma decisão YAGNI da spec
  anterior — volume de uma loja pequena).
- Sem criptografia de coluna nova, sem dependência nova no
  `package.json` — nenhuma parte deste plano precisa disso.

---

### Task 1: Migration — colunas e tabelas novas

**Files:**
- Create: `supabase/migrations/2026-08-19-dashboard-loja-mercado-livre.sql`

**Interfaces:**
- Produces: colunas `integracoes_mercado_livre_anuncios.is_catalogo`
  (boolean, default false) e `.catalog_product_id` (text, nullable);
  tabelas `integracoes_mercado_livre_perguntas` e
  `integracoes_mercado_livre_mensagens`. Todas as tarefas seguintes
  dependem deste schema existir no banco de produção.

- [ ] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- Dashboard por loja do Mercado Livre — colunas e tabelas novas
-- Ver docs/superpowers/specs/2026-08-19-dashboard-loja-mercado-livre-design.md
-- ============================================================

-- Parte 1/5: catálogo é lido pelo card "Anúncios de catálogo ativos" do
-- Dashboard antes da Parte 5 (Anúncios do Catálogo) existir de verdade —
-- fica default false até a Tarefa 9 passar a preencher de verdade.
alter table integracoes_mercado_livre_anuncios
  add column if not exists is_catalogo boolean not null default false;
alter table integracoes_mercado_livre_anuncios
  add column if not exists catalog_product_id text;

-- Parte 4: pergunta pública pré-venda.
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

-- Parte 6: chat pós-venda (mensagens entre comprador e vendedor de um pedido).
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

- [ ] **Step 2: Parar aqui — checkpoint humano**

Este projeto não tem uma ferramenta de MCP do Supabase conectada nesta
sessão. **Não seguir para a Tarefa 2 até o usuário confirmar que rodou
este SQL no SQL Editor do Supabase e que as duas tabelas + duas colunas
existem.** Isso é idêntico ao checkpoint da Tarefa 1 do plano anterior
(`2026-08-19-mercado-livre-integracao.md`) — mesmo procedimento.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026-08-19-dashboard-loja-mercado-livre.sql
git commit -m "Adiciona migration do dashboard por loja do Mercado Livre"
```

---

### Task 2: Casca de abas + link real em Minhas Lojas

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/layout.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/AbasLojaML.tsx`
- Modify: `app/painel/integracoes/lojas/page.tsx`

**Interfaces:**
- Consumes: `conexaoAtual()` de `lib/mercado-livre.ts` (já existe,
  devolve `ConexaoML | null`, campos `ml_user_id`, `ml_nickname`,
  `expira_em`).
- Produces: `AbasLojaML` (client component, sem props) — renderiza a
  barra de abas; tarefas seguintes só precisam criar
  `.../mercado-livre/<aba>/page.tsx` pra a aba aparecer navegável (o
  componente já lista todas as 5 abas fixas, cada `<Link>` funciona
  assim que a rota existir — Next 404 normalmente se a rota ainda não
  existe, o que é aceitável durante a execução do plano e nunca fica
  visível em produção porque as tarefas são commitadas em sequência).

- [ ] **Step 1: Criar o componente de abas**

```tsx
// app/painel/integracoes/lojas/mercado-livre/AbasLojaML.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ABAS = [
  { href: '/painel/integracoes/lojas/mercado-livre',            label: 'Dashboard' },
  { href: '/painel/integracoes/lojas/mercado-livre/anuncios',    label: 'Meus Anúncios' },
  { href: '/painel/integracoes/lojas/mercado-livre/vendas',      label: 'Minhas Vendas' },
  { href: '/painel/integracoes/lojas/mercado-livre/perguntas',   label: 'Perguntas e Respostas' },
  { href: '/painel/integracoes/lojas/mercado-livre/catalogo',    label: 'Anúncios do Catálogo' },
]

export function AbasLojaML() {
  const pathname = usePathname()
  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200">
      {ABAS.map((aba) => {
        const ativa = aba.href === '/painel/integracoes/lojas/mercado-livre'
          ? pathname === aba.href
          : pathname.startsWith(aba.href)
        return (
          <Link key={aba.href} href={aba.href}
            className={cn(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              ativa
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            )}>
            {aba.label}
          </Link>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Criar o layout que envolve todas as abas**

```tsx
// app/painel/integracoes/lojas/mercado-livre/layout.tsx
import { IconStore } from '@/components/icons'
import { conexaoAtual } from '@/lib/mercado-livre'
import { AbasLojaML } from './AbasLojaML'

export default async function LojaMercadoLivreLayout({ children }: { children: React.ReactNode }) {
  const conexao = await conexaoAtual()

  if (!conexao) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
          <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-500">
            Loja não conectada. Conecte em{' '}
            <a href="/painel/integracoes/lojas" className="text-blue-600 hover:underline">Minhas Lojas</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconStore className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mercado Livre</h2>
        <span className="inline-flex shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          {conexao.ml_nickname ?? conexao.ml_user_id}
        </span>
      </div>
      <AbasLojaML />
      {children}
    </div>
  )
}
```

- [ ] **Step 3: Fazer o card de Minhas Lojas virar link**

Ler `app/painel/integracoes/lojas/page.tsx` (já existe — mostra o card
"Mercado Livre" com "Conectado como {nickname}" e o botão
`ImportarAnunciosBotao`). Trocar o bloco do `<p className="font-semibold...">Mercado Livre</p>`
por um link pro dashboard novo, mantendo o resto do card (badge Ativo,
botão de importar) igual:

```tsx
// Trecho a substituir dentro do bloco `{conexaoML ? (...) : (...)}`,
// já existente em app/painel/integracoes/lojas/page.tsx:
<div>
  <a href="/painel/integracoes/lojas/mercado-livre" className="font-semibold text-gray-800 hover:text-blue-600 hover:underline">
    Mercado Livre
  </a>
  <p className="text-sm text-gray-500">Conectado como {conexaoML.ml_nickname ?? conexaoML.ml_user_id}</p>
</div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Teste manual (descrever pro usuário, não executar)**

Sem conta conectada em produção ainda: acessar
`/painel/integracoes/lojas/mercado-livre` direto pela URL deve mostrar
"Loja não conectada" (não deve dar erro 500). Depois que a conta for
conectada de verdade, o card em Minhas Lojas deve virar um link
clicável que leva pra essa página, mostrando as abas.

- [ ] **Step 6: Commit**

```bash
git add app/painel/integracoes/lojas/mercado-livre/layout.tsx app/painel/integracoes/lojas/mercado-livre/AbasLojaML.tsx app/painel/integracoes/lojas/page.tsx
git commit -m "Cria casca de abas do dashboard da loja Mercado Livre"
```

---

### Task 3: Dashboard — visão geral, sem estoque, mais vendidos, fluxo de vendas

**Files:**
- Create: `lib/mercado-livre-dashboard.ts`
- Create: `app/painel/integracoes/lojas/mercado-livre/page.tsx`
- Modify: `lib/utils.ts` (adiciona `diaSP`)

**Interfaces:**
- Consumes: `createServiceClient()`, `fetchAll`, `fetchAllIn` de
  `lib/supabase/server.ts`; `formatBRL` de `lib/utils.ts`.
- Produces (em `lib/mercado-livre-dashboard.ts`, consumido pela Tarefa
  4 também):
  - `DEPOSITO_PETROPOLIS_LOJA` (reexportada, mesma constante de
    `lib/mercado-livre.ts` — não duplicar o valor, importar de lá).
  - `type VisaoGeralML = { anunciosImportados: number; anunciosSimplesAtivos: number; anunciosCatalogoAtivos: number; perguntasNaoRespondidas: number; mensagensNaoLidas: number }`
  - `async function buscarVisaoGeral(): Promise<VisaoGeralML>`
  - `type AnuncioSemEstoque = { titulo: string; codigoProduto: string | null; mlItemId: string }`
  - `async function buscarAnunciosSemEstoque(): Promise<AnuncioSemEstoque[]>`
  - `type PontoFluxoVendas = { dia: string; faturamento: number; quantidade: number }`
  - `async function buscarFluxoVendas(): Promise<PontoFluxoVendas[]>`
  - `type AnuncioMaisVendido = { titulo: string; mlItemId: string; quantidadeVendida: number }`
  - `async function buscarMaisVendidos(): Promise<AnuncioMaisVendido[]>`

- [ ] **Step 1: Adicionar `diaSP` em `lib/utils.ts`**

Ler o arquivo primeiro (tem `hojeSP` logo depois do bloco de imports,
por volta da linha 28). Adicionar logo abaixo de `hojeSP`:

```ts
// Data (YYYY-MM-DD) de um timestamp ISO qualquer, no fuso America/Sao_Paulo —
// mesma lógica de hojeSP, mas pra converter um timestamp já existente (ex:
// agrupar vendas por dia), não "agora". Nunca usar .slice(0,10) num ISO: isso
// pega o dia em UTC, que vira o dia seguinte depois das 21h em SP.
export function diaSP(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
```

- [ ] **Step 2: Escrever `lib/mercado-livre-dashboard.ts`**

```ts
import { createServiceClient, fetchAll, fetchAllIn } from '@/lib/supabase/server'
import { diaSP } from '@/lib/utils'

const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

// Conta tolerando tabela ainda não criada nesta etapa do plano (Partes 4/6
// entram nas Tarefas 8 e 10) — devolve 0 em vez de quebrar o Dashboard.
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

export async function buscarVisaoGeral(): Promise<VisaoGeralML> {
  const supabase = await createServiceClient()
  const [importados, catalogo, perguntas, mensagens] = await Promise.all([
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true })),
    contarTolerante(supabase.from('integracoes_mercado_livre_anuncios').select('*', { count: 'exact', head: true }).eq('is_catalogo', true)),
    contarTolerante(supabase.from('integracoes_mercado_livre_perguntas').select('*', { count: 'exact', head: true }).eq('respondida', false)),
    contarTolerante(supabase.from('integracoes_mercado_livre_mensagens').select('*', { count: 'exact', head: true }).eq('lida', false)),
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

export async function buscarAnunciosSemEstoque(): Promise<AnuncioSemEstoque[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id')
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

export async function buscarFluxoVendas(): Promise<PontoFluxoVendas[]> {
  const supabase = await createServiceClient()
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const vendas = await fetchAll<{ total: number; created_at: string }>((de, ate) =>
    supabase.from('vendas').select('total, created_at')
      .not('ml_order_id', 'is', null).gte('created_at', desde).range(de, ate))

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

export async function buscarMaisVendidos(): Promise<AnuncioMaisVendido[]> {
  const supabase = await createServiceClient()
  const vendas = await fetchAll<{ id: string }>((de, ate) =>
    supabase.from('vendas').select('id').not('ml_order_id', 'is', null).range(de, ate))
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

  const anuncios = await fetchAllIn<{ ml_item_id: string; titulo_ml: string; produto_id: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios')
      .select('ml_item_id, titulo_ml, produto_id').in('produto_id', chunk).range(de, ate))

  return anuncios
    .map((a) => ({
      titulo: a.titulo_ml,
      mlItemId: a.ml_item_id,
      quantidadeVendida: somaPorProduto.get(a.produto_id as string) ?? 0,
    }))
    .sort((a, b) => b.quantidadeVendida - a.quantidadeVendida)
    .slice(0, 10)
}
```

- [ ] **Step 3: Escrever a página do Dashboard**

```tsx
// app/painel/integracoes/lojas/mercado-livre/page.tsx
import { formatBRL } from '@/lib/utils'
import {
  buscarVisaoGeral, buscarAnunciosSemEstoque, buscarFluxoVendas, buscarMaisVendidos,
} from '@/lib/mercado-livre-dashboard'

export default async function DashboardLojaMLPage() {
  const [visao, semEstoque, fluxo, maisVendidos] = await Promise.all([
    buscarVisaoGeral(),
    buscarAnunciosSemEstoque(),
    buscarFluxoVendas(),
    buscarMaisVendidos(),
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
    </div>
  )
}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Descrever pro usuário: com a Tarefa 1 aplicada mas ainda sem conta
conectada, `/painel/integracoes/lojas/mercado-livre` deve mostrar "Loja
não conectada" (herda do layout da Tarefa 2). Depois de conectar de
verdade e importar anúncios (fluxo já existente), os 5 cards de
contagem devem bater com o que existe no banco; "Anúncios Sem Estoque"
só aparece populado se algum produto casado tiver `quantidade = 0` no
depósito Petrópolis Loja.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/mercado-livre-dashboard.ts app/painel/integracoes/lojas/mercado-livre/page.tsx
git commit -m "Adiciona Dashboard da loja Mercado Livre: visao geral, fluxo de vendas, sem estoque, mais vendidos"
```

---

### Task 4: Dashboard — anúncios aguardando ajuste do Mercado Livre

**Files:**
- Modify: `lib/mercado-livre-dashboard.ts`
- Modify: `app/painel/integracoes/lojas/mercado-livre/page.tsx`

**Interfaces:**
- Consumes: `chamarML` de `lib/mercado-livre.ts`; `fetchAll` de
  `lib/supabase/server.ts`.
- Produces: `type AnuncioAguardandoAjuste = { titulo: string; mlItemId: string; subStatus: string }`,
  `async function buscarAnunciosAguardandoAjuste(): Promise<AnuncioAguardandoAjuste[]>`.

- [ ] **Step 1: Adicionar a função em `lib/mercado-livre-dashboard.ts`**

Consulta ao vivo na API (sem cache — mesma decisão de volume da spec).
Item em `status: 'under_review'` com `sub_status` `'warning'` ou
`'waiting_for_patch'` é o que o Mercado Livre chama de "aguardando
ajuste" (confirmado na documentação oficial: item fica ativo com
pendência de correção por até 2 dias antes de ser ocultado). Adicionar
ao final do arquivo:

```ts
import { chamarML } from '@/lib/mercado-livre'

type StatusItemML = { id: string; title: string; status: string; sub_status: string[] }

export type AnuncioAguardandoAjuste = { titulo: string; mlItemId: string; subStatus: string }

export async function buscarAnunciosAguardandoAjuste(): Promise<AnuncioAguardandoAjuste[]> {
  const supabase = await createServiceClient()
  const anuncios = await fetchAll<{ ml_item_id: string }>((de, ate) =>
    supabase.from('integracoes_mercado_livre_anuncios').select('ml_item_id').range(de, ate))
  if (anuncios.length === 0) return []

  const resultado: AnuncioAguardandoAjuste[] = []
  for (const a of anuncios) {
    try {
      const item = await chamarML<StatusItemML>(`/items/${a.ml_item_id}`)
      if (item.status !== 'under_review') continue
      const subStatus = item.sub_status.find((s) => s === 'warning' || s === 'waiting_for_patch')
      if (subStatus) resultado.push({ titulo: item.title, mlItemId: item.id, subStatus })
    } catch {
      // um item falhar não deve derrubar o painel inteiro — ignora e segue os outros
      continue
    }
  }
  return resultado
}
```

Nota pro implementador: adicionar o `import { chamarML } from
'@/lib/mercado-livre'` no topo do arquivo junto com os imports já
existentes de `lib/supabase/server` e `lib/utils`, não duplicado no meio.

- [ ] **Step 2: Adicionar o painel na página**

Em `app/painel/integracoes/lojas/mercado-livre/page.tsx`, trocar o
import e o `Promise.all` do topo (adicionados pela Tarefa 3) por:

```ts
import {
  buscarVisaoGeral, buscarAnunciosSemEstoque, buscarFluxoVendas, buscarMaisVendidos,
  buscarAnunciosAguardandoAjuste,
} from '@/lib/mercado-livre-dashboard'

// ...

const [visao, semEstoque, fluxo, maisVendidos, aguardandoAjuste] = await Promise.all([
  buscarVisaoGeral(),
  buscarAnunciosSemEstoque(),
  buscarFluxoVendas(),
  buscarMaisVendidos(),
  buscarAnunciosAguardandoAjuste(),
])
```

E adicionar mais um bloco de painel (mesmo estilo do "Anúncios Sem
Estoque") logo abaixo dele, no `return`:

```tsx
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
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Teste manual**

Descrever pro usuário: esse painel só é confiável depois da conta estar
conectada de verdade e ter anúncios importados — com o catálogo real,
qualquer anúncio marcado "Em revisão" no próprio site do Mercado Livre
deve aparecer aqui.

- [ ] **Step 5: Commit**

```bash
git add lib/mercado-livre-dashboard.ts app/painel/integracoes/lojas/mercado-livre/page.tsx
git commit -m "Adiciona painel de anuncios aguardando ajuste no Dashboard da loja ML"
```

---

### Task 5: Meus Anúncios

**Files:**
- Create: `app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx`

**Interfaces:**
- Consumes: `fetchAll` de `lib/supabase/server.ts`;
  `ImportarAnunciosBotao` de
  `app/painel/integracoes/lojas/ImportarAnunciosBotao.tsx` (já existe —
  client component sem props, chama a server action `importarAnuncios`
  já existente em `app/painel/integracoes/lojas/actions.ts` e faz
  `router.refresh()`); `BuscaLista` de `components/BuscaLista.tsx`;
  `formatBRL` de `lib/utils.ts`.

- [ ] **Step 1: Escrever a página**

```tsx
// app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx
import { createServiceClient, fetchAllIn } from '@/lib/supabase/server'
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
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>
}) {
  const { busca } = await searchParams
  const supabase = await createServiceClient()

  let q = supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, preco_ml, produto_id')
    .order('titulo_ml')

  const termo = busca?.trim()
  if (termo) q = q.ilike('titulo_ml', `%${termo}%`)

  const { data } = await q
  const anuncios = (data ?? []) as AnuncioLinha[]

  const produtoIds = anuncios.map((a) => a.produto_id).filter((id): id is string => !!id)
  const produtos = await fetchAllIn<{ id: string; codigo: string | null }>(produtoIds, (chunk, de, ate) =>
    supabase.from('produtos').select('id, codigo').in('id', chunk).range(de, ate))
  const codigoPorProduto = new Map(produtos.map((p) => [p.id, p.codigo]))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <BuscaLista basePath="/painel/integracoes/lojas/mercado-livre/anuncios" placeholder="Buscar anúncio..." />
        <ImportarAnunciosBotao />
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

Nota pro implementador: `ImportarAnunciosBotao` está em
`app/painel/integracoes/lojas/`, um nível acima desta nova pasta —
conferir se o import `@/app/painel/integracoes/lojas/ImportarAnunciosBotao`
resolve (o projeto usa alias `@/*` pra raiz, confirmar em
`tsconfig.json` se `@/app/...` funciona; se o padrão do projeto for só
`@/lib`, `@/components` etc., usar import relativo
`../../ImportarAnunciosBotao` em vez do alias).

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Teste manual**

Descrever pro usuário: a aba "Meus Anúncios" deve listar o mesmo total
que o card "Anúncios importados" do Dashboard mostra; buscar por parte
do título deve filtrar; clicar "Abrir" leva pro anúncio real no site do
Mercado Livre.

- [ ] **Step 4: Commit**

```bash
git add app/painel/integracoes/lojas/mercado-livre/anuncios/page.tsx
git commit -m "Adiciona aba Meus Anuncios no dashboard da loja Mercado Livre"
```

---

### Task 6: Minhas Vendas (extrai `buscarVendasML` compartilhada)

**Files:**
- Modify: `lib/mercado-livre.ts` (adiciona `buscarVendasML`)
- Modify: `app/painel/integracoes/pedidos/page.tsx` (passa a usar a função compartilhada em vez da query inline)
- Create: `app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx`

**Interfaces:**
- Produces: `type VendaML = { id: string; numero: number; total: number; created_at: string; ml_order_id: string }`,
  `type PedidoPendenteML = { id: string; ml_order_id: string; motivo: string; criado_em: string; resolvido: boolean }`,
  `async function buscarVendasML(): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }>`
  em `lib/mercado-livre.ts`.

- [ ] **Step 1: Adicionar `buscarVendasML` em `lib/mercado-livre.ts`**

Adicionar ao final do arquivo (depois de `urlAutorizacao`):

```ts
export type VendaML = { id: string; numero: number; total: number; created_at: string; ml_order_id: string }
export type PedidoPendenteML = { id: string; ml_order_id: string; motivo: string; criado_em: string; resolvido: boolean }

// Vendas do Mercado Livre + pedidos pagos que finalizar_venda não conseguiu
// processar (ver integracoes_mercado_livre_pedidos_pendentes). Usada tanto
// em "Meus Pedidos" (Central de Integrações) quanto na aba "Minhas Vendas"
// do dashboard desta loja — mesma consulta, um lugar só.
export async function buscarVendasML(): Promise<{ vendas: VendaML[]; pendentes: PedidoPendenteML[] }> {
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
  return {
    vendas: (vendas ?? []) as VendaML[],
    pendentes: (pendentes ?? []) as PedidoPendenteML[],
  }
}
```

- [ ] **Step 2: Refatorar `app/painel/integracoes/pedidos/page.tsx`**

Trocar a busca inline (o `Promise.all` com as duas queries direto no
componente) por uma chamada a `buscarVendasML()`. O JSX da tabela
continua idêntico — só a origem do dado muda:

```tsx
import { buscarVendasML } from '@/lib/mercado-livre'
import { formatBRL, formatDate } from '@/lib/utils'
import { IconClipboard } from '@/components/icons'
import { Dica } from '@/components/Dica'

export default async function IntegracoesPedidosPage() {
  const { vendas, pendentes } = await buscarVendasML()

  return (
    // ... resto do JSX igual ao arquivo atual, trocando `vendas`/`pendentes`
    // pelas variáveis acima em vez de `data: vendas`/`data: pendentes`
  )
}
```

Nota pro implementador: ler o arquivo atual
(`app/painel/integracoes/pedidos/page.tsx`) antes de editar — ele já
existe por inteiro, com todo o JSX da tabela e do bloco de pendências
amarelo. Só o topo (imports + a busca de dados) muda; o `return (...)`
inteiro fica igual, só trocando a origem de `vendas`/`pendentes`.

- [ ] **Step 3: Criar a aba "Minhas Vendas" reaproveitando o mesmo dado**

```tsx
// app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx
import { buscarVendasML } from '@/lib/mercado-livre'
import { formatBRL, formatDate } from '@/lib/utils'

export default async function MinhasVendasMLPage() {
  const { vendas, pendentes } = await buscarVendasML()

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

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Descrever pro usuário: `/painel/integracoes/pedidos` (tela antiga) e a
nova aba "Minhas Vendas" devem mostrar exatamente os mesmos números —
são a mesma consulta agora.

- [ ] **Step 6: Commit**

```bash
git add lib/mercado-livre.ts app/painel/integracoes/pedidos/page.tsx app/painel/integracoes/lojas/mercado-livre/vendas/page.tsx
git commit -m "Extrai buscarVendasML compartilhada e adiciona aba Minhas Vendas"
```

---

### Task 7: Perguntas e Respostas

**Files:**
- Modify: `app/api/integracoes/mercado-livre/webhook/route.ts`
- Modify: `lib/mercado-livre.ts` (adiciona `responderPerguntaML`)
- Create: `app/painel/integracoes/lojas/mercado-livre/perguntas/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/perguntas/actions.ts`
- Create: `app/painel/integracoes/lojas/mercado-livre/perguntas/ResponderPerguntaForm.tsx`
- Modify: `components/Sidebar.tsx` (badge)
- Modify: `components/PainelShell.tsx` (repassa `badges`)
- Modify: `app/painel/layout.tsx` (calcula e passa `badges`)

**Interfaces:**
- Consumes: `chamarML` de `lib/mercado-livre.ts`;
  `createServiceClient` de `lib/supabase/server.ts`.
- Produces: server action `responderPerguntaML(perguntaId: string, texto: string): Promise<{ ok: boolean; erro?: string }>`
  em `app/painel/integracoes/lojas/mercado-livre/perguntas/actions.ts`;
  prop nova `badges?: Record<string, number>` em `Sidebar`/`PainelShell`
  — Tarefa 10 (Mensagens) reusa essa mesma prop, só adicionando sua
  própria chave.

- [ ] **Step 1: Ramificar o webhook por `topic`**

Ler `app/api/integracoes/mercado-livre/webhook/route.ts` (já existe
por inteiro). A linha `if (body.topic !== 'orders_v2') return new
Response('ok', { status: 200 })` vira uma ramificação: extrair o corpo
atual do `POST` (tudo entre esse if e o fim da função, exceto a
declaração de `supabase`) pra uma função `processarPedido`, e adicionar
`processarPergunta` como um segundo `case`. Resultado:

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
type PerguntaML = { id: number; item_id: string; text: string; status: string }

export async function POST(req: NextRequest) {
  let body: Notificacao
  try {
    body = await req.json()
  } catch {
    return new Response('ok', { status: 200 }) // corpo ilegível — não é nosso problema, so 200 e ignora
  }

  const supabase = await createServiceClient()

  try {
    if (body.topic === 'orders_v2') await processarPedido(supabase, body)
    else if (body.topic === 'questions') await processarPergunta(supabase, body)
    // outros topics (ex: 'messages', adicionado na Tarefa 10) entram como novo `else if` aqui
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('Erro processando webhook do Mercado Livre:', e)
    return new Response('ok', { status: 200 })
  }
}

async function processarPedido(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  body: Notificacao,
) {
  const pedido = await chamarML<PedidoML>(body.resource)
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
    await registrarPendencia(supabase, pedido, 'Item sem produto correspondente cadastrado')
    return
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
    return
  }

  // Sem UPDATE de caixa_id de propósito — venda do ML nunca entra na
  // conferência de caixa físico (ver spec, Peça 3).
  await supabase.from('vendas').update({ ml_order_id: String(pedido.id) }).eq('id', data.venda_id as string)
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

async function processarPergunta(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  body: Notificacao,
) {
  const pergunta = await chamarML<PerguntaML>(body.resource)
  await supabase.from('integracoes_mercado_livre_perguntas').upsert({
    ml_question_id: String(pergunta.id),
    ml_item_id: pergunta.item_id,
    texto: pergunta.text,
    // Já respondida por outro canal (app do ML, etc.) ou deletada — não
    // mostrar como pendente aqui.
    respondida: pergunta.status !== 'UNANSWERED',
  }, { onConflict: 'ml_question_id' })
}
```

- [ ] **Step 2: Adicionar `responderPerguntaML` em `lib/mercado-livre.ts`**

```ts
export async function responderPerguntaML(mlQuestionId: string, texto: string): Promise<void> {
  await chamarML('/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question_id: Number(mlQuestionId), text: texto }),
  })
}
```

- [ ] **Step 3: Server action pra responder**

```tsx
// app/painel/integracoes/lojas/mercado-livre/perguntas/actions.ts
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
    .select('ml_question_id')
    .eq('id', perguntaId)
    .maybeSingle()
  if (!pergunta) return { ok: false, erro: 'Pergunta não encontrada.' }

  try {
    await responderPerguntaML(pergunta.ml_question_id, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao responder no Mercado Livre.' }
  }

  await supabase.from('integracoes_mercado_livre_perguntas').update({
    respondida: true,
    resposta_texto: texto,
    respondida_em: new Date().toISOString(),
  }).eq('id', perguntaId)

  revalidatePath('/painel/integracoes/lojas/mercado-livre/perguntas')
  return { ok: true }
}
```

- [ ] **Step 4: Formulário de resposta (client component)**

```tsx
// app/painel/integracoes/lojas/mercado-livre/perguntas/ResponderPerguntaForm.tsx
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

- [ ] **Step 5: Página da aba**

```tsx
// app/painel/integracoes/lojas/mercado-livre/perguntas/page.tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderPerguntaForm } from './ResponderPerguntaForm'

type PerguntaLinha = { id: string; texto: string; criado_em: string }

export default async function PerguntasMLPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('id, texto, criado_em')
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

- [ ] **Step 6: Item de menu + plumbing do badge — `Sidebar.tsx`**

Ler `components/Sidebar.tsx` por inteiro primeiro (já lido nesta
sessão — tem `type NavItem = { href: string; label: string; permissao?: string }`
e o `export function Sidebar({ permissoes, isMaster }: {...})`).
Um badge só aparece num item de menu que existe — adicionar as rotas
de Perguntas e Mensagens (Tarefa 9 adiciona a segunda) ao grupo
`'Integrações'` de `navCompleto`, e seus ícones ao mapa `ICONS`:

```tsx
// No mapa ICONS, junto das entradas '/painel/integracoes/...' já existentes:
'/painel/integracoes/lojas/mercado-livre/perguntas': IconFile,

// No grupo 'Integrações' de navCompleto, logo após a entrada 'Minhas Lojas':
{ href: '/painel/integracoes/lojas/mercado-livre/perguntas', label: 'Perguntas ML', permissao: 'integracoes' },
```

Alterações no componente `Sidebar`:

```tsx
// Adicionar ao tipo NavItem, junto dos campos existentes:
type NavItem = { href: string; label: string; permissao?: string }

// Nova prop na assinatura de Sidebar:
export function Sidebar({
  permissoes, isMaster, badges = {},
}: {
  permissoes: string[]
  isMaster: boolean
  badges?: Record<string, number>
}) {
  // ...resto do corpo igual...
```

Dentro do `.map((item) => { const Ic = ICONS[item.href]; return (...) })`,
depois de `{item.label}`, adicionar o badge:

```tsx
{item.label}
{badges[item.href] > 0 && (
  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
    {badges[item.href]}
  </span>
)}
```

- [ ] **Step 7: Repassar a prop em `PainelShell.tsx`**

Ler `components/PainelShell.tsx` por inteiro primeiro. Adicionar
`badges?: Record<string, number>` na assinatura de props do componente
(mesma lista onde já estão `permissoes`, `isMaster`, `avisosCaixa`,
`rotinas`) e passar pra `<Sidebar permissoes={permissoes}
isMaster={isMaster} badges={badges} />` (linha 117 do arquivo lido
nesta sessão).

- [ ] **Step 8: Calcular o badge em `app/painel/layout.tsx`**

Ler o arquivo por inteiro primeiro (já lido nesta sessão — tem o bloco
`if (userId) { try { ... avisosCaixa = ...; rotinas = ... } catch {} }`
por volta da linha 70-109). Adicionar, no mesmo bloco `try`, uma
contagem tolerante (tabela pode não ter perguntas pendentes, ou —
antes desta tarefa — nem existir; `count/error` do Supabase cobre os
dois casos igual):

```tsx
let badges: Record<string, number> = {}
// (dentro do `if (userId) { try { ... } catch {} }` já existente, junto das
// outras consultas em Promise.all — ou como uma consulta extra própria):
const { count: perguntasPendentes } = await supabase
  .from('integracoes_mercado_livre_perguntas')
  .select('*', { count: 'exact', head: true })
  .eq('respondida', false)
if (perguntasPendentes) {
  badges['/painel/integracoes/lojas/mercado-livre/perguntas'] = perguntasPendentes
}
```

E repassar em `<PainelShell ... badges={badges}>`.

- [ ] **Step 9: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 10: Teste manual**

Descrever pro usuário: não dá pra testar o webhook de perguntas sem uma
pergunta real chegando no Mercado Livre — depois de conectar a conta de
verdade, cadastrar a URL do webhook nas notificações do app (mesmo
passo já pendente da spec anterior, adicionando o tópico "Perguntas" à
assinatura) e esperar um comprador perguntar algo (ou usar a conta de
teste do próprio Mercado Livre, se tiver uma). Responder pela aba deve
fazer a pergunta sumir da lista e aparecer respondida no site do
Mercado Livre.

- [ ] **Step 11: Commit**

```bash
git add app/api/integracoes/mercado-livre/webhook/route.ts lib/mercado-livre.ts app/painel/integracoes/lojas/mercado-livre/perguntas components/Sidebar.tsx components/PainelShell.tsx app/painel/layout.tsx
git commit -m "Adiciona Perguntas e Respostas do Mercado Livre com badge no menu"
```

---

### Task 8: Anúncios do Catálogo

**Files:**
- Modify: `lib/mercado-livre.ts` (`buscarAnunciosDoVendedor` passa a trazer dados de catálogo)
- Modify: `app/painel/integracoes/lojas/actions.ts` (`importarAnuncios` grava `is_catalogo`/`catalog_product_id`)
- Create: `app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx`

**Interfaces:**
- Consumes: `chamarML` de `lib/mercado-livre.ts`.
- Produces: `buscarAnunciosDoVendedor` passa a devolver também
  `catalogo: boolean` e `catalogProductId: string | null` por item
  (campos novos, os já existentes `ml_item_id`/`titulo`/`preco`/`sku`
  continuam iguais — nenhuma tarefa anterior quebra).

- [ ] **Step 1: Estender `buscarAnunciosDoVendedor` em `lib/mercado-livre.ts`**

Ler a função atual (linhas ~104-130 do arquivo, já lido nesta sessão).
Trocar o `type ItemResp` e o corpo do `for` que monta `itens.push`:

```ts
type ItemResp = {
  id: string
  title: string
  price: number
  seller_custom_field: string | null
  attributes?: { id: string; value_name: string | null }[]
  catalog_listing?: boolean
  catalog_product_id?: string | null
}

export async function buscarAnunciosDoVendedor(mlUserId: string) {
  const itens: {
    ml_item_id: string; titulo: string; preco: number; sku: string | null
    catalogo: boolean; catalogProductId: string | null
  }[] = []
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
        catalogo: item.catalog_listing ?? false,
        catalogProductId: item.catalog_product_id ?? null,
      })
    }
    offset += limite
    if (offset >= pagina.paging.total) break
  }
  return itens
}
```

- [ ] **Step 2: Gravar os campos novos em `importarAnuncios`**

Ler `app/painel/integracoes/lojas/actions.ts` por inteiro (já lido
nesta sessão — a função `importarAnuncios` monta `linhas` a partir de
`anuncios.map((a) => {...})`). Adicionar `is_catalogo` e
`catalog_product_id` ao objeto retornado dentro do `.map`:

```ts
return {
  ml_item_id: a.ml_item_id,
  produto_id: produtoId,
  titulo_ml: a.titulo,
  preco_ml: a.preco,
  is_catalogo: a.catalogo,
  catalog_product_id: a.catalogProductId,
  atualizado_em: new Date().toISOString(),
}
```

- [ ] **Step 3: Página da aba Anúncios do Catálogo**

```tsx
// app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx
import { createServiceClient } from '@/lib/supabase/server'
import { chamarML } from '@/lib/mercado-livre'

type AnuncioCatalogo = { ml_item_id: string; titulo_ml: string; catalog_product_id: string }
type ProdutoCatalogo = { buy_box_winner: { item_id: string } | null }

export default async function CatalogoMLPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_anuncios')
    .select('ml_item_id, titulo_ml, catalog_product_id')
    .eq('is_catalogo', true)
  const anuncios = (data ?? []) as AnuncioCatalogo[]

  const comStatus = await Promise.all(anuncios.map(async (a) => {
    try {
      const produto = await chamarML<ProdutoCatalogo>(`/products/${a.catalog_product_id}`)
      const ganhando = produto.buy_box_winner?.item_id === a.ml_item_id
      return { ...a, ganhando }
    } catch {
      return { ...a, ganhando: null as boolean | null }
    }
  }))

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

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Teste manual**

Descrever pro usuário: depois de reimportar os anúncios (botão em
"Meus Anúncios"), qualquer anúncio que seja de catálogo no Mercado
Livre deve passar a contar em "Anúncios de catálogo ativos" no
Dashboard e aparecer nesta aba com "Ganhando" ou "Perdendo".

- [ ] **Step 6: Commit**

```bash
git add lib/mercado-livre.ts app/painel/integracoes/lojas/actions.ts app/painel/integracoes/lojas/mercado-livre/catalogo/page.tsx
git commit -m "Adiciona aba Anuncios do Catalogo com status de buybox"
```

---

### Task 9: Mensagens pós-venda

**Files:**
- Modify: `app/api/integracoes/mercado-livre/webhook/route.ts`
- Modify: `lib/mercado-livre.ts` (adiciona `responderMensagemML`)
- Create: `app/painel/integracoes/lojas/mercado-livre/mensagens/page.tsx`
- Create: `app/painel/integracoes/lojas/mercado-livre/mensagens/actions.ts`
- Create: `app/painel/integracoes/lojas/mercado-livre/mensagens/ResponderMensagemForm.tsx`
- Modify: `app/painel/layout.tsx` (mais uma chave no `badges`)
- Modify: `components/Sidebar.tsx` (item de menu "Mensagens ML" + ícone)

**Interfaces:**
- Consumes: mesmo padrão da Tarefa 7 (`chamarML`, `requirePermissao`,
  `badges` já existente na Sidebar/PainelShell — não precisa mexer no
  componente em si de novo, só adicionar item de menu + entrada no
  objeto `badges`).
- Produces: server action
  `responderMensagem(packId: string, texto: string): Promise<{ ok: boolean; erro?: string }>`.

- [ ] **Step 1: Adicionar o topic `messages` no webhook**

Em `app/api/integracoes/mercado-livre/webhook/route.ts` (já ramificado
pela Tarefa 7), adicionar mais um `else if` e a função
`processarMensagem`:

```ts
// No corpo de POST, junto dos outros `else if`:
else if (body.topic === 'messages') await processarMensagem(supabase, body)
```

```ts
type PackMensagensML = {
  messages: {
    message_id: string
    text: { plain: string }
    from: { user_id: number }
    to: { user_id: number }
  }[]
}

async function processarMensagem(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  body: Notificacao,
) {
  // body.resource pro topic 'messages' é algo como
  // '/messages/packs/{pack_id}/sellers/{seller_id}' — extrai o pack_id.
  const packId = body.resource.split('/packs/')[1]?.split('/')[0]
  if (!packId) return

  const { data: conexao } = await supabase
    .from('integracoes_mercado_livre')
    .select('ml_user_id')
    .eq('id', 'principal')
    .maybeSingle()
  if (!conexao) return

  const pack = await chamarML<PackMensagensML>(
    `/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale&mark_as_read=false`
  )

  for (const msg of pack.messages) {
    const autor = String(msg.from.user_id) === conexao.ml_user_id ? 'vendedor' : 'comprador'
    await supabase.from('integracoes_mercado_livre_mensagens').upsert({
      ml_message_id: msg.message_id,
      ml_pack_id: packId,
      autor,
      texto: msg.text.plain,
      lida: autor === 'vendedor', // mensagem do próprio vendedor não conta como não lida
    }, { onConflict: 'ml_message_id' })
  }
}
```

- [ ] **Step 2: Adicionar `responderMensagemML` em `lib/mercado-livre.ts`**

```ts
export async function responderMensagemML(packId: string, texto: string): Promise<void> {
  const conexao = await conexaoAtual()
  if (!conexao) throw new Error('Mercado Livre não está conectado')
  await chamarML(`/messages/packs/${packId}/sellers/${conexao.ml_user_id}?tag=post_sale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: { user_id: Number(conexao.ml_user_id) }, text: texto }),
  })
}
```

- [ ] **Step 3: Server action**

```tsx
// app/painel/integracoes/lojas/mercado-livre/mensagens/actions.ts
'use server'

import { createServiceClient, requirePermissao } from '@/lib/supabase/server'
import { responderMensagemML } from '@/lib/mercado-livre'
import { revalidatePath } from 'next/cache'

export async function responderMensagem(packId: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  await requirePermissao('integracoes')
  if (!texto.trim()) return { ok: false, erro: 'Escreva uma mensagem.' }

  try {
    await responderMensagemML(packId, texto)
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao enviar no Mercado Livre.' }
  }

  const supabase = await createServiceClient()
  await supabase.from('integracoes_mercado_livre_mensagens').update({ lida: true }).eq('ml_pack_id', packId)

  revalidatePath('/painel/integracoes/lojas/mercado-livre/mensagens')
  return { ok: true }
}
```

- [ ] **Step 4: Formulário (client component)**

```tsx
// app/painel/integracoes/lojas/mercado-livre/mensagens/ResponderMensagemForm.tsx
'use client'

import { useState } from 'react'
import { responderMensagem } from './actions'

export function ResponderMensagemForm({ packId }: { packId: string }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro('')
    const res = await responderMensagem(packId, texto)
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

- [ ] **Step 5: Página, agrupando por pack**

```tsx
// app/painel/integracoes/lojas/mercado-livre/mensagens/page.tsx
import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderMensagemForm } from './ResponderMensagemForm'

type MensagemLinha = { id: string; ml_pack_id: string; autor: string; texto: string; lida: boolean; criado_em: string }

export default async function MensagensMLPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_mensagens')
    .select('id, ml_pack_id, autor, texto, lida, criado_em')
    .order('criado_em', { ascending: true })
  const mensagens = (data ?? []) as MensagemLinha[]

  const porPack = new Map<string, MensagemLinha[]>()
  for (const m of mensagens) {
    const lista = porPack.get(m.ml_pack_id) ?? []
    lista.push(m)
    porPack.set(m.ml_pack_id, lista)
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
          <ResponderMensagemForm packId={packId} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Item de menu + mais uma chave no `badges`**

Em `components/Sidebar.tsx`: adicionar
`'/painel/integracoes/lojas/mercado-livre/mensagens': IconFile` ao
mapa `ICONS`, e
`{ href: '/painel/integracoes/lojas/mercado-livre/mensagens', label: 'Mensagens ML', permissao: 'integracoes' }`
ao grupo `'Integrações'` de `navCompleto`, logo após a entrada
"Perguntas ML" que a Tarefa 7 adicionou.

Em `app/painel/layout.tsx`, no mesmo bloco onde a Tarefa 7 adicionou
`perguntasPendentes` ao objeto `badges` já existente, adicionar a
contagem de mensagens não lidas:

```tsx
const { count: mensagensNaoLidas } = await supabase
  .from('integracoes_mercado_livre_mensagens')
  .select('*', { count: 'exact', head: true })
  .eq('lida', false)
  .eq('autor', 'comprador')
if (mensagensNaoLidas) {
  badges['/painel/integracoes/lojas/mercado-livre/mensagens'] = mensagensNaoLidas
}
```

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Teste manual**

Descrever pro usuário: mesmo caso da Tarefa 7 — precisa da conta
conectada e do tópico "Mensagens" assinado nas notificações do app do
Mercado Livre. Depois de um pedido real gerar uma mensagem pós-venda,
ela deve aparecer agrupada por pedido nesta aba, e responder por aqui
deve chegar de verdade pro comprador.

- [ ] **Step 9: Commit**

```bash
git add app/api/integracoes/mercado-livre/webhook/route.ts lib/mercado-livre.ts app/painel/integracoes/lojas/mercado-livre/mensagens app/painel/layout.tsx components/Sidebar.tsx
git commit -m "Adiciona Mensagens pos-venda do Mercado Livre"
```

---

## Notas de execução (pra quem coordena o plano via SDD)

- **Tarefa 1 tem checkpoint humano** — mesmo formato do plano anterior
  (`2026-08-19-mercado-livre-integracao.md`, Tarefa 1). Não despachar a
  Tarefa 2 até a confirmação.
- As Tarefas 4, 8 e 9 fazem chamada **ao vivo** à API do Mercado Livre
  por item, sem cache — aceitável pro volume desta loja (documentado na
  spec). Se o catálogo real crescer a ponto de a página ficar lenta,
  isso é uma otimização a revisar depois, não um defeito desta entrega.
- Nenhuma tarefa deste plano pode ser testada contra dado real de
  produção até a conta Mercado Livre estar conectada de verdade (ainda
  pendente, fora do escopo deste plano) — os "testes manuais"
  descritos em cada tarefa cobrem o que dá pra verificar sem isso
  (páginas não quebram, tipos batem, estados vazios corretos); o
  reviewer de cada tarefa deve tratar isso como limitação conhecida,
  não pedir prova de dado real que não existe ainda.
