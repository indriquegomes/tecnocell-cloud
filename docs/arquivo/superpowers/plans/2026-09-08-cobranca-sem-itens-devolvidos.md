# Cobrança sem itens devolvidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover da mensagem de cobrança peças já devolvidas, preservando apenas quantidades ainda devidas.

**Architecture:** Adicionar cálculo puro em `lib/cobranca-fiado.ts` que agrega venda e devolução por produto. A página consulta `itens_devolucao` junto com os itens vendidos e usa o resultado para montar `pecasPorVenda`.

**Tech Stack:** Next.js, TypeScript, Supabase PostgREST, Node test runner.

## Global Constraints

- Quantidade exibida = vendida menos devolvida por `venda_id + produto_id`.
- Item zerado não aparece; devolução parcial mostra saldo.
- Saldo financeiro continua vindo de `lancamentos`.
- Nenhuma dependência nova.

---

### Task 1: Filtrar peças devolvidas da cobrança

**Files:**
- Modify: `lib/cobranca-fiado.ts`
- Modify: `app/painel/fiados/page.tsx`
- Test: `test/cobranca-fiado.test.mts`

**Interfaces:**
- Consumes: itens vendidos `{ venda_id, produto_id, nome, quantidade }` e devolvidos no mesmo formato.
- Produces: `pecasRestantesPorVenda(vendidos, devolvidos): Map<string, string[]>`.

- [ ] **Step 1: Escrever teste falhando**

```ts
test('omite item totalmente devolvido e reduz devolução parcial', () => {
  const resultado = pecasRestantesPorVenda([
    { venda_id: 'v1', produto_id: 'p1', nome: 'Tela A', quantidade: 1 },
    { venda_id: 'v1', produto_id: 'p2', nome: 'Tela B', quantidade: 3 },
    { venda_id: 'v1', produto_id: 'p3', nome: 'Tela C', quantidade: 1 },
  ], [
    { venda_id: 'v1', produto_id: 'p1', quantidade: 1 },
    { venda_id: 'v1', produto_id: 'p2', quantidade: 1 },
  ])
  assert.deepEqual(resultado.get('v1'), ['2x Tela B', 'Tela C'])
})
```

- [ ] **Step 2: Confirmar falha**

Run: `node --test --experimental-strip-types test/cobranca-fiado.test.mts`
Expected: FAIL porque `pecasRestantesPorVenda` ainda não existe.

- [ ] **Step 3: Implementar cálculo mínimo**

Agregar vendidos e devolvidos por chave composta, calcular `Math.max(vendido - devolvido, 0)` e formatar quantidade maior que 1 com `Nx`.

- [ ] **Step 4: Integrar consulta**

Em cada lote de vendas, buscar `devolucoes(venda_id, itens_devolucao(produto_id, quantidade))`, achatar resultados e passar vendidos/devolvidos ao helper antes de preencher `pecasPorVenda`.

- [ ] **Step 5: Verificar**

Run: `node --test --experimental-strip-types test/cobranca-fiado.test.mts`
Expected: todos os testes PASS.

Run: `npx tsc --noEmit`
Expected: nenhuma falha nova relacionada aos arquivos alterados.

- [ ] **Step 6: Commit**

```bash
git add lib/cobranca-fiado.ts app/painel/fiados/page.tsx test/cobranca-fiado.test.mts
git commit -m "fix: omitir itens devolvidos da cobrança"
```
