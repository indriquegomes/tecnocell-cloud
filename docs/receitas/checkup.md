# Receita — Check-up do sistema (`/checkup`)

Auditoria de saúde **rodando o app**, não só lendo código. A regra de ouro:
bug se prova **executando**. Screenshot e erro de console são a prova — nada de
"deve funcionar".

## Como pedir

```
/checkup              # completo (todas as fases)
/checkup deploy       # só integridade de deploy (rápido)
/checkup <módulo>     # foca um módulo (ex: /checkup depositos)
/checkup estatico     # só a revisão de padrões, sem rodar o app
```

## Regras de ouro (não quebrar)

1. **SÓ LEITURA por padrão.** Detecta e reporta; só corrige depois do dono
   dizer **"passa"**.
2. **Dado de teste = prefixo `__QA__` com limpeza garantida.** Todo registro
   criado para testar é apagado no `finally`, mesmo se o teste falhar — o banco
   local usa o **mesmo Supabase de produção**.
3. **Produção é dado real.** Navegar e ler: ok. Finalizar venda, mexer em
   estoque, escrever: **não**. Escrita só em teste com `__QA__` e limpeza.
4. **Nunca expor credencial.** Login de teste vem do `.env.local`
   (`TESTE_USUARIO_EMAIL` / `TESTE_USUARIO_SENHA`). Script fica em pasta
   temporária, nunca versionado.
5. **Relatório por severidade:** 🔴 crítico · 🟡 médio · 🟢 pequeno/UX — cada um
   com causa-raiz, correção sugerida e a prova.

## Fase 0 — Escopo e preparo

- `git log --oneline -20` e `git status --short` — o que mudou e o que está solto.
- Decidir alvo: **produção** (`https://tecnocell-cloud.vercel.app`, leitura) ou
  **local** (`npm run dev`, permite escrita com limpeza). Conferir se já existe
  dev server na porta 3000 antes de subir outro.
- Playwright: `node_modules/playwright` presente. Script `.cjs` numa pasta
  temporária fazendo `require('<abs>/node_modules/playwright')`.

## Fase 1 — Integridade de deploy (nunca pular)

O bug mais traiçoeiro: **build local passa, Vercel quebra.**

- `git status --short`: existe arquivo `??` (novo, não commitado) que o código
  já importa? `git grep -l "<arquivo>"` para descobrir.
- `npm run build` local passa? (necessário, não suficiente — na sandbox pode
  falhar por `spawn EPERM` na checagem de tipos; nesse caso rodar
  `npx tsc --noEmit` direto).
- **Produção está rodando o código atual?** Logar em produção e procurar um
  marcador de código recente (rota/tela nova). UI atrasada = deploy congelado.
- Depois de qualquer push: confirmar que o deploy da Vercel ficou **READY**.

## Fase 2 — Passar por todas as telas

Playwright: login → visitar **todas** as rotas de `app/painel/**/page.tsx`
(hoje são 84 sem parâmetro dinâmico + 16 com `[id]`, que precisam de ID real).
Por tela capturar:

- `console` type=error · `pageerror` (exception de JS) · `response` status ≥ 400
  (ignorar favicon e estáticos)
- Tela quebrada: "Application error", "client-side exception", 404, ou **sem
  `<h1>`/`<h2>`**
- Screenshot `fullPage` de cada tela com problema

**Cuidado com falso positivo:** comparar o título real com o sinal de erro. Tela
com `<h2>` correto + "not found" no DOM = texto de prefetch, não bug. Página de
impressão sem `?id=` legitimamente não tem título.

## Fase 3 — CRUD de verdade (com limpeza)

Para cada módulo de cadastro: **criar** registro `__QA__` pelo formulário real →
confirmar na lista → **editar** → confirmar → **deletar**. Limpeza no `finally`
varrendo por `__QA__` e aceitando o `dialog` de confirmação. No fim, contar
restos: tem que ser **zero**.

É a fase que pega erro de escrita que a navegação não vê (foi assim que apareceu
o `null value in column "id"`). Editar categoria/depósito usa o link real da
lista (`?editar=<código>`), não o nome.

## Fase 4 — Padrões de bug conhecidos

Checklist do projeto — a lista completa está na seção **9 (Armadilhas)** do
`AGENTS.md`. Conferir pelo menos:

- `criar` em tabela de PK TEXT gera `id: crypto.randomUUID()`?
- server action de escrita começa com `requireAuth`/`requirePermissao`?
- logout/ação destrutiva fora de `<Link>`/GET?
- toda data renderizada com `timeZone: 'America/Sao_Paulo'`?
- consulta que soma usa `fetchAll` (cap de 1000 linhas)?
- módulo novo tem permissão configurável em `lib/permissoes.ts`?

## Fase 5 — Melhorias e UX

- Estado vazio tratado ("Nenhum X no período")?
- Busca, ordenação e filtro funcionam **clicando**, não só existindo?
- Campo obrigatório validado com mensagem clara?
- Telas lentas (medir tempo de resposta — ver `perf-audit.md`).
- Consistência com a marca (azul `#1B6CA8` + laranja `#F47920`) — ver
  `docs/design/brand.md` e `design-polish.md`.

## Fase 6 — Relatório

```
## Check-up TecnoCell — <data>
Alvo: produção | local · Telas: N · CRUD: N módulos

🔴 CRÍTICO   — <bug> · causa-raiz · correção · prova
🟡 MÉDIO     — ...
🟢 PEQUENO   — ...
✅ Verificado e OK: <resumo>
🧹 Cleanup: banco sem lixo de teste (confirmado)
```

Terminar perguntando o **"passa"** para aplicar as correções seguras. Causa nova
e sistêmica que aparecer vai para a seção 9 do `AGENTS.md`.

## Modelo de script (sem credencial no arquivo)

```js
const { chromium } = require('<abs>/node_modules/playwright')
// login: preencher input[name="usuario"] e input[name="password"] e clicar em button[type="submit"]
// smoke:  for (rota of ROTAS) { goto; capturar console/pageerror/response>=400; screenshot }
// crud:   criar __QA__ -> conferir na lista -> editar -> deletar; limpeza no finally; restos === 0
```
