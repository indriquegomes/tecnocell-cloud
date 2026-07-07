---
name: execute-plan
description: "Encadeia trabalho longo de vários passos sem parar a cada etapa pra pedir 'agora faz o próximo'. Planeja, executa passo a passo verificando cada um, e reporta no fim. Use quando o usuário pedir pra fazer uma sequência/sprint, varrer vários módulos, 'faz tudo isso', roadmap de vários itens, ou aprovar um plano pra tocar sozinho."
trigger: /execute-plan
---

# /execute-plan — Tocar sprint de ponta a ponta

Pra tarefas de muitos passos (varrer Estoque + Relatórios, aplicar um padrão em N telas, roadmap do dia): planeja tudo, executa em sequência **verificando cada passo**, e só volta pro usuário no fim ou se travar de verdade. Não ficar perguntando "agora faço o próximo?".

## Fluxo

1. **Plano curto primeiro.** Listar os passos concretos (arquivo/ação/como verificar) numa lista de tarefas. Passo bom = tem um jeito de provar que ficou pronto.
2. **Confirmar o plano** com o usuário (uma vez). Ideias grandes/irreversíveis: alinhar antes ([[feedback-planejar-antes]]). Depois do OK, **tocar sem parar**.
3. **Executar em ordem**, um passo por vez:
   - Fazer a mudança.
   - **Verificar rodando** (Playwright/UI, medir, screenshot) — bug/ganho se prova executando, não lendo ([[/verify]], [[/checkup]]).
   - Marcar o passo como feito e ir pro próximo. Só interromper o usuário se: travou sem saída, decisão que muda o rumo, ou algo destrutivo/irreversível apareceu.
4. **Dev primeiro, push com OK.** Iterar no localhost:3000; só sobe pro Vercel com o OK do Vitor ([[fluxo-testar-dev-antes-de-subir]]). Depois do push, confirmar o deploy READY em produção.
5. **Revisar o diff antes de commitar** — arquivo por arquivo, nada de mudança solta ([[feedback-commit-diff-review]]). Arquivo novo → `git add` senão a Vercel quebra ([[deploy-vercel-git-add-novos-arquivos]]).
6. **Relatório no fim** — o que foi feito, o que foi verificado, o que ficou de fora e por quê.

## Regras

- **Uma lista de tarefas visível** guia tudo; mantê-la atualizada (feito/em andamento).
- **Não abandonar no meio.** Terminou um item, emenda o próximo.
- **Não inflar o escopo.** Só o que foi combinado no plano — sem feature extra ([[feedback-modulo-com-proposito]]).
- **Verificação não é opcional.** Passo sem prova de que funciona não está pronto.
- Cansou/mudou o rumo → reperguntar, não seguir cego.

Combina com [[/perf-audit]] (varrer telas lentas em sequência) e [[roadmap-modulo-vendas]] (sprint de módulos).
