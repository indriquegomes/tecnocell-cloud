# Receita — Tocar uma sequência longa (`/execute-plan`)

Para tarefa de muitos passos (varrer Estoque + Relatórios, aplicar um padrão em N
telas, cumprir um roadmap do dia): planeja tudo, executa em sequência
**verificando cada passo**, e só volta ao dono no fim — ou se travar de verdade.
Não ficar perguntando "agora faço o próximo?".

## Fluxo

1. **Plano curto primeiro.** Listar os passos concretos (arquivo/ação/como
   verificar) numa lista de tarefas. Passo bom = tem como provar que ficou
   pronto.
2. **Confirmar o plano com o dono** (uma vez). Ideia grande ou irreversível:
   alinhar antes. Depois do OK, **tocar sem parar**.
3. **Executar em ordem**, um passo por vez:
   - fazer a mudança;
   - **verificar rodando** (Playwright/UI, medir, screenshot) — ganho se prova
     executando (`checkup.md`, `perf-audit.md`);
   - marcar como feito e emendar o próximo. Só interromper o dono se: travou sem
     saída, apareceu decisão que muda o rumo, ou algo destrutivo/irreversível.
4. **Dev primeiro, subir com OK.** Iterar no `localhost:3000`; só vai para a
   Vercel com o OK do dono. Depois do push, confirmar deploy READY.
5. **Revisar o diff antes de commitar** — arquivo por arquivo, nada de mudança
   solta. Arquivo novo precisa de `git add`, senão a Vercel quebra (armadilha na
   seção 9 do `AGENTS.md`).
6. **Relatório no fim** — o que foi feito, o que foi verificado, o que ficou de
   fora e por quê. Registrar o que sobrou em `docs/passagem-de-turno.md`.

## Regras

- **Uma lista de tarefas visível** guia tudo; manter atualizada.
- **Não abandonar no meio.** Terminou um item, emenda o próximo.
- **Não inflar o escopo.** Só o combinado no plano — sem feature extra.
- **Verificação não é opcional.** Passo sem prova de que funciona não está pronto.
- Cansou ou mudou o rumo? Repactuar, não seguir cego.

Combina com `perf-audit.md` (varrer telas lentas em sequência) e `checkup.md`
(validar tudo no fim).
