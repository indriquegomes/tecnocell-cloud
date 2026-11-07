# Tabela CUSTO Física Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir opção virtual CUSTO por tabela real, sincronizada com `produtos.preco_custo` e impossível de usar em venda/orçamento.

**Architecture:** Migração marca tabela consultiva com `usa_preco_custo`, cria CUSTO e mantém itens via trigger. PDV usa ID/flag real e actions validam flag no banco. Telas administrativas excluem CUSTO de vínculos e edição.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase PostgreSQL, Node test.

## Global Constraints

- Nenhuma rota ou aba nova.
- Fonte única: `produtos.preco_custo`.
- CUSTO visível para todo usuário com acesso ao PDV.
- Venda e orçamento bloqueados no cliente e servidor.
- Nenhuma promoção ou vínculo padrão com CUSTO.
- Migração idempotente; não toca venda, estoque ou histórico.

---

### Task 1: Criar e sincronizar tabela CUSTO

**Files:**
- Create: `supabase/migrations/2026-09-05_tabela_custo_consulta.sql`
- Create: `scripts-sinc/tabela-custo-fisica.test.mjs`

**Interfaces:**
- Produces: `tabelas_preco.usa_preco_custo boolean`
- Produces: `sincronizar_item_tabela_custo()` trigger function.

- [ ] **Step 1: Write failing static test** exigindo coluna, índice único parcial, criação/upsert da CUSTO, carga dos ativos e trigger de insert/update.
- [ ] **Step 2: Run `node --test scripts-sinc/tabela-custo-fisica.test.mjs`**; expected FAIL porque migration não existe.
- [ ] **Step 3: Write migration** usando `alter table ... add column if not exists`, bloco idempotente para CUSTO, `insert ... on conflict`, limpeza de inativos e trigger.
- [ ] **Step 4: Re-run test**; expected PASS.

### Task 2: Usar tabela real no PDV e bloquear no servidor

**Files:**
- Modify: `app/painel/pdv/page.tsx`
- Modify: `app/painel/pdv/PDVClient.tsx`
- Modify: `app/painel/pdv/actions.ts`
- Modify: `scripts-sinc/pdv-custo-consulta.test.mjs`

**Interfaces:**
- `TabelaPreco = { id: string; nome: string; usa_preco_custo: boolean }`
- `finalizarVenda(..., tabela_preco_id: string | null)` valida `usa_preco_custo` no banco.
- `salvarOrcamentoPDV` valida `input.tabela_preco_id` no banco.

- [ ] **Step 1: Change test first** para rejeitar constante `__custo__` e exigir flag/ID real.
- [ ] **Step 2: Run test**; expected FAIL no código virtual atual.
- [ ] **Step 3: Query `usa_preco_custo`** e manter CUSTO mesmo com restrição de tabelas por usuário.
- [ ] **Step 4: Replace virtual branches** por `tabelaSelecionada?.usa_preco_custo`; carregar itens normalmente, desativar promoções, bloquear botões e mostrar aviso.
- [ ] **Step 5: Validate table ID server-side** antes de salvar orçamento/finalizar venda; não confiar em boolean enviado pelo navegador.
- [ ] **Step 6: Run tests**; expected PASS.

### Task 3: Proteger administração e vínculos

**Files:**
- Modify: `app/painel/tabelas-preco/page.tsx`
- Modify: `app/painel/tabelas-preco/[id]/page.tsx`
- Modify: `app/painel/tabelas-preco/actions.ts`
- Modify: `app/painel/clientes/novo/page.tsx`
- Modify: `app/painel/clientes/[id]/editar/page.tsx`
- Modify: `app/painel/lojas/[id]/editar/page.tsx`
- Modify: `app/painel/usuarios/page.tsx`
- Modify: `app/painel/promocoes/[id]/page.tsx`

**Interfaces:**
- CUSTO aparece no card como `Somente consulta` sem excluir.
- Actions de editar/remover/importar/toggle rejeitam tabela com `usa_preco_custo=true`.
- Seletores administrativos consultam `.eq('usa_preco_custo', false)`.

- [ ] **Step 1: Add server guard** compartilhado nas mutations da tabela de preço.
- [ ] **Step 2: Render CUSTO read-only** na listagem/detalhe.
- [ ] **Step 3: Filter CUSTO from defaults/promotions** nos seletores existentes.
- [ ] **Step 4: Run `npx tsc --noEmit` and `npm run build`**; expected exit 0.
- [ ] **Step 5: Apply migration through project deployment path**, then query counts/sum and verify one CUSTO.
- [ ] **Step 6: Commit and publish only scoped files.**
