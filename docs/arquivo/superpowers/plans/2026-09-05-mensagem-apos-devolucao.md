# Mensagem após devolução Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir mensagem pronta para copiar e enviar por WhatsApp após devolução que gere vale-crédito ou cancele fiado não pago.

**Architecture:** Função pura monta texto e link. Action retorna valores confirmados pela RPC e telefone já ligado à venda. Cliente guarda resultado antes de fechar modal e mostra card de sucesso.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase, `node:test` via `tsx`.

## Global Constraints

- Não criar fluxo de cancelar devolução.
- `credito_conta` gera mensagem de vale-crédito.
- `cancelamento_fiado` gera mensagem de dívida cancelada.
- Outros reembolsos mantêm confirmação simples.
- WhatsApp exige telefone com 10 ou 11 dígitos; copiar funciona sem telefone.
- Nenhuma dependência nova.

---

### Task 1: Texto e link

**Files:**
- Create: `lib/mensagem-devolucao.ts`
- Test: `test/mensagem-devolucao.test.mts`

**Interfaces:**
- Produces: `mensagemDevolucao({ tipo, cliente, valor, produtos, numero }): string | null`
- Produces: `whatsappDevolucao(telefone, mensagem): string | null`

- [x] **Step 1: Write failing tests** cobrindo vale, cancelamento de fiado, múltiplos produtos, outro reembolso e telefone inválido.
- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/mensagem-devolucao.test.mts`
Expected: FAIL porque `lib/mensagem-devolucao.ts` não existe.

- [x] **Step 3: Write minimal implementation** com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, lista de produtos e `https://wa.me/55...`.
- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/mensagem-devolucao.test.mts`
Expected: PASS.

### Task 2: Integrar ao sucesso da devolução

**Files:**
- Modify: `app/painel/devolucoes/actions.ts`
- Modify: `app/painel/devolucoes/DevolucoesClient.tsx`

**Interfaces:**
- `VendaParaDevolucao.telefone: string | null`
- `registrarDevolucao(...): Promise<{ id: string; abate_fiado: number; reembolso: number }>`
- Consumes: funções da Task 1.

- [x] **Step 1: Extend action result** usando `abate_fiado` e `reembolso` já retornados pela RPC; carregar `telefone/celular` junto da pessoa.
- [x] **Step 2: Replace boolean success state** por `{ mensagem: string | null; whatsapp: string | null }`.
- [x] **Step 3: Build message from confirmed result**: `reembolso` para `credito_conta`, `abate_fiado` para `cancelamento_fiado`, nomes/quantidades de `itensDev` e número da venda.
- [x] **Step 4: Render success card** com texto, `Copiar mensagem`, `WhatsApp` quando válido e confirmação simples quando mensagem for `null`.
- [x] **Step 5: Verify types and build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit only feature files**

```powershell
git add -- lib/mensagem-devolucao.ts test/mensagem-devolucao.test.mts app/painel/devolucoes/actions.ts app/painel/devolucoes/DevolucoesClient.tsx docs/superpowers/plans/2026-09-05-mensagem-apos-devolucao.md
git commit -m "feat: oferecer mensagem apos devolucao"
```
