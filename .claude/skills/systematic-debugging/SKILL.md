---
name: systematic-debugging
description: "Disciplina de causa-raiz antes de corrigir — impede chutar soluções. Entender POR QUE quebrou (reproduzir + isolar + provar a causa) antes de escrever o fix. Use em qualquer bug não óbvio, comportamento estranho, erro intermitente, algo que 'deveria funcionar mas não funciona', regressão."
trigger: /debug
---

# /debug — Debugging sistemático

Bug não se corrige adivinhando. Primeiro **entende o porquê**, depois conserta. Trocar linhas até parar de dar erro esconde a causa e volta pior depois.

Nasceu de acertos reais do projeto: o RLS do `movimentos_caixa` (a causa era `createServerClient` SSR sobrescrevendo o `Authorization`) e a devolução com fiado (causa era `lancamentos.id` ser TEXT, não UUID). Nos dois casos o fix certo só apareceu **depois** de achar a causa — chute teria mascarado.

## O método (não pular etapa)

1. **Reproduzir.** Fazer o bug acontecer de propósito, com passos fixos. Não dá pra reproduzir → primeiro conseguir reproduzir. Rodar o app de verdade (Playwright/UI), não imaginar.
2. **Coletar evidência.** Erro exato (console, `pageerror`, response ≥400, log do banco), não paráfrase. Screenshot/captura. O erro literal costuma nomear a causa.
3. **Isolar.** Binária: onde entra certo e sai errado? Cortar o problema no meio até achar a linha/camada. Uma variável por vez.
4. **Provar a causa.** Antes de corrigir, escrever numa frase: "quebra PORQUE X". Testar essa hipótese (um script que confirma X) — se não confirmar, hipótese errada, volta ao passo 3.
5. **Só então corrigir** — o mínimo que ataca X. E **verificar** rodando o fluxo de novo (o bug sumiu E nada quebrou em volta).

## Sinais de que você está chutando (pare)

- "Vou tentar mudar isso e ver se resolve" sem saber por quê.
- Mais de uma mudança ao mesmo tempo.
- Adicionar try/catch/optional-chaining pra "sumir" o erro sem entender.
- "Deveria funcionar" — no TecnoCell, bug se prova **executando** (ver [[/checkup]]).

## Atalhos do TecnoCell (causas que já morderam)

Antes de investigar do zero, checar os padrões conhecidos — a causa pode já estar catalogada:

- Erro `text = uuid` / `uuid = text` em RPC → IDs do SIGE são TEXT ([[ids-sige-sao-text-nao-uuid]]).
- `null value in column "id"` ao criar → PK TEXT sem default, falta `crypto.randomUUID()` ([[criar-registro-pk-text-gerar-uuid]]).
- Logout/ação sozinha → destrutivo atrás de `<Link>`/GET, Next prefetcha ([[bug-logout-prefetch-signout]]).
- Lista some acima de 1000 linhas → cap do PostgREST ([[bug-postgrest-max-rows-1000]]).
- Login preso / POST 404 no dev → `.next` corrompido ([[bug-next-cache-corrompido-404-api]]).
- Data 500 no submit → input date vazio manda "" ([[bug-data-vazia-timestamp]]).
- Checkbox lê valor errado → `fd.get()` pega o hidden ([[bug-checkbox-fdget-hidden]]).

Casa com um desses → aplicar direto. Não casa → seguir o método de 5 passos e, no fim, se for causa nova e sistêmica, **salvar uma memória** pra alimentar esta lista.
