---
name: checkup
description: "Check-up profundo do sistema TecnoCell — roda o app de verdade (Playwright), caça erros/bugs/regressões, valida CRUD real, revisa os padrões de bug conhecidos do projeto e lista melhorias. Use quando o usuário pedir check-up, auditoria, análise do sistema, procurar erros/bugs, testar tudo, revisão geral ou QA."
trigger: /checkup
---

# /checkup — Check-up profundo do TecnoCell

Auditoria de saúde do sistema **rodando o app**, não só lendo código. A regra de ouro: bug se prova **executando**. Screenshot e captura de console são a evidência — nada de "deve funcionar".

Nasceu de um check-up real (28/06/2026) que achou dois bugs sérios que o build local escondia: um arquivo `untracked` que quebrava o deploy na Vercel, e `criar registro` quebrado em 5 módulos. Esta skill existe pra reencontrar esse tipo de coisa sempre.

## Como usar

```
/checkup              # check-up completo (todas as fases)
/checkup deploy       # só Fase 1 — integridade de deploy (rápido)
/checkup <módulo>     # foca um módulo (ex: /checkup depositos)
/checkup estatico     # só Fase 4 — revisão de padrões, sem rodar o app
```

## Regras de ouro (NÃO quebrar)

1. **READ-ONLY por padrão.** Detecta e reporta. Só corrige depois do usuário dizer **"passa"** (protocolo do projeto).
2. **Dado de teste = prefixo `__QA__` + cleanup garantido.** Todo registro criado pra testar é deletado no `finally`, mesmo se o teste falhar. O banco local usa o **mesmo Supabase de produção** — não pode sobrar lixo.
3. **Produção é dado real.** Navegar e ler: OK. Finalizar venda, mexer em estoque, escrever: **NÃO** em produção. Fluxos de escrita só local com cleanup.
4. **Nunca expor credenciais.** Este arquivo vai pro git (repo público). Login de teste vem do `.env.local` ou o usuário fornece na hora. Nunca hardcodar senha em arquivo versionado — os scripts ficam no scratchpad (efêmero).
5. **Relatório por severidade** no fim: 🔴 crítico · 🟡 médio · 🟢 pequeno/UX. Cada um com causa-raiz e correção sugerida.

## Fase 0 — Escopo e setup

- `git log --oneline -20` e `git diff --stat HEAD~N` — o que mudou desde o último check-up.
- Decidir alvo: **produção** (`https://tecnocell-cloud.vercel.app`, read-only) ou **local** (`npm run dev`, permite CRUD com cleanup). Para check-up completo: subir `next dev` em background e testar local.
- Confirmar Playwright: `node_modules/playwright` existe. Scripts `.cjs` vão no scratchpad e fazem `require('<abs>/node_modules/playwright')`.

## Fase 1 — Integridade de deploy (NUNCA pular)

O bug mais traiçoeiro do projeto: **build local passa, Vercel quebra.**

- `git status --short` → tem arquivo `??` (untracked) que o código já importa? Rodar `git grep -l "components/<Novo>" HEAD` pra ver se algum arquivo commitado usa um arquivo não-commitado. → ver [[deploy-vercel-git-add-novos-arquivos]]
- `npm run build` local — passa? (necessário, não suficiente)
- **Produção está rodando o código atual?** Logar em produção e procurar um marcador do código recente (um texto/elemento novo). Se a UI está atrasada vs o repo, o deploy está congelado.
- Após qualquer push: confirmar que o deploy da Vercel ficou **READY**, não só que o `git push` subiu.

## Fase 2 — Smoke de navegação

Playwright: login → visitar **todas** as rotas de `app/painel/**/page.tsx`. Por tela capturar:

- `console` type=error · `pageerror` (exception JS) · `response` status ≥ 400 (ignorar favicon)
- Tela quebrada: body com "Application error", "client-side exception", 404, ou **sem `<h2>`** (tela vazia)
- Screenshot `fullPage` de cada

Cuidado com **falso positivo**: comparar sempre o `<h2>` real com o sinal de erro. Uma tela com `<h2>` correto + "not found" no DOM = texto prefetch oculto, não bug. (Aconteceu — não reportar como quebra.)

## Fase 3 — CRUD real com cleanup (só local)

Para cada módulo de cadastro: **criar** registro `__QA__` pelo form real → confirmar que aparece na lista → **editar** → confirmar → **deletar**. Cleanup no `finally` varrendo por `__QA__` e aceitando o `dialog` de confirmação. Ao fim, contar restos: tem que ser **zero**.

É a fase que pega bug de escrita que navegação não vê (foi assim que caiu o `null value in column "id"`).

## Fase 4 — Padrões de bug conhecidos do TecnoCell

Checklist específico do projeto (grep + leitura). Cada item já mordeu antes:

- **`criar` em tabela de PK TEXT gera `id`?** Tabelas do SIGE (depositos, pessoas, lancamentos, formas_pagamento, empresas, produtos) têm `id` TEXT sem default. Todo `.insert()` de criação precisa de `id: crypto.randomUUID()`. Grep: `\.insert\(` nos `actions.ts` e conferir se setam id. → [[criar-registro-pk-text-gerar-uuid]]
- **IDs do SIGE nunca castados para `::uuid`** em SQL/RPC. → [[ids-sige-sao-text-nao-uuid]]
- **Toda server action de escrita chama `requireAuth()`**? E `createServiceClient` nunca lança (quebra páginas). → [[arquitetura-auth-actions]]
- **Logout / ação destrutiva NUNCA atrás de `<Link>`/GET** — Next prefetcha e dispara sozinho. Tem que ser `<form method=POST>` ou botão com confirm. → [[bug-logout-prefetch-signout]]
- **Timezone fixado em `America/Sao_Paulo`** em datas renderizadas (evita hydration mismatch React #418). Grep: `toLocaleString`/`toLocaleDateString` sem `timeZone`.
- **Coluna integer recebe `Math.round`/`parseInt`**, não `parseFloat` cru (quebrou `finalizar_venda` e movimentações).
- **Módulo novo tem permissão configurável** no sistema de cargos. → [[regra-permissoes-universal]]
- **Lista nova segue o padrão universal** (cards + busca + filtros colapsáveis + tabela + badges). → [[padrao-lista-universal]]

Opcional: rodar a skill `code-review` no diff recente pra bugs de lógica.

## Fase 5 — Melhorias e UX (o "check-up fino")

- Estados vazios tratados ("Nenhum X no período")?
- Filtros, ordenação asc/desc e busca funcionam de verdade (clicar, não só existir)?
- Campos obrigatórios validados? Mensagem de erro clara?
- Telas lentas (medir tempo de resposta no log do dev)?
- Consistência visual com o brand (azul #1B6CA8 + laranja #F47920) e design clean. → [[design-clean-minimalista]]
- Pequenas melhorias: contadores, tooltips (`Dica`), atalhos, foco automático.

## Fase 6 — Relatório

```
## Check-up TecnoCell — <data>
Alvo: produção | local · Telas: N · CRUD: N módulos

🔴 CRÍTICO
  - <bug> — causa-raiz — correção sugerida — evidência

🟡 MÉDIO
  - ...

🟢 PEQUENO / UX
  - ...

✅ Verificado e OK: <resumo do que passou>
🧹 Cleanup: banco sem lixo de teste (confirmado)
```

Terminar perguntando o **"passa"** pra aplicar as correções seguras. Atualizar/criar memórias com bugs sistêmicos novos (`type: project`/`feedback`) pra alimentar a Fase 4 do próximo check-up.

## Anexo — fluxo do script Playwright (sem credenciais)

```js
const { chromium } = require('<abs>/node_modules/playwright')
// login via process.env ou prompt — NUNCA hardcodar
// smoke: for (rota of ROTAS) { goto; capturar console/pageerror/response>=400; screenshot }
// crud: criar __QA__ -> verificar -> editar -> deletar; cleanup no finally; restos === 0
```

Modelos de referência ficaram no scratchpad da sessão de 28/06: `smoke.cjs`, `validate.cjs`, `check-deploy.cjs`.
