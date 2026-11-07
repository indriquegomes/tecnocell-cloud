# Receita — Debug com causa-raiz (`/debug`)

Bug não se corrige adivinhando. Primeiro **entende o porquê**, depois conserta.
Trocar linha até parar de dar erro esconde a causa e volta pior depois.

Nasceu de acertos reais do projeto: o RLS do `movimentos_caixa` (causa:
`createServerClient` SSR sobrescrevendo o `Authorization`) e a devolução com
fiado (causa: `lancamentos.id` ser TEXT, não UUID). Nos dois casos o conserto
certo só apareceu **depois** de achar a causa.

## O método (não pular etapa)

1. **Reproduzir.** Fazer o bug acontecer de propósito, com passos fixos. Não
   consegue reproduzir? Primeiro consiga. Rodar o app de verdade
   (Playwright/UI), não imaginar.
2. **Coletar evidência.** Erro exato (console, `pageerror`, response ≥ 400, log
   do banco) — não paráfrase. Screenshot/captura. O erro literal costuma nomear
   a causa.
3. **Isolar.** Binária: onde entra certo e sai errado? Cortar até achar a
   linha/camada. Uma variável por vez.
4. **Provar a causa.** Antes de corrigir, escrever numa frase: "quebra PORQUE X".
   Testar essa hipótese (script que confirma X). Se não confirmar, hipótese
   errada — volta ao passo 3.
5. **Só então corrigir** — o mínimo que ataca X. E **verificar** rodando o fluxo
   de novo: o bug sumiu **e** nada quebrou em volta.

## Sinais de que você está chutando (pare)

- "Vou mudar isso e ver se resolve" sem saber por quê.
- Mais de uma mudança ao mesmo tempo.
- Colocar `try/catch`/optional-chaining para "sumir" com o erro sem entender.
- "Deveria funcionar" — no TecnoCell, bug se prova **executando**
  (ver `checkup.md`).

## Atalhos: causas que já morderam

Antes de investigar do zero, conferir a lista de **Armadilhas** na seção 9 do
`AGENTS.md`. Resumo do que mais aparece:

- Erro `text = uuid` / `uuid = text` em RPC → IDs do SIGE são TEXT.
- `null value in column "id"` ao criar → PK TEXT sem default, falta
  `crypto.randomUUID()`.
- Logout ou ação disparando sozinha → ação destrutiva atrás de `<Link>`/GET
  (o Next prefetcha).
- Lista "sumindo" acima de 1000 linhas → cap do PostgREST, falta `fetchAll`.
- Login preso / POST 404 em `/api/*` no dev → `.next` corrompido (apagar).
- Erro 500 ao salvar data → input `type="date"` vazio manda `""`.
- Checkbox lendo valor errado → `fd.get()` pegou o campo hidden.
- `RangeError: Invalid time value` → `Intl.format` com data inválida (lança).

Casa com um desses? Aplicar direto. Não casa? Seguir os 5 passos e, no fim, se a
causa for nova e sistêmica, **acrescentar na seção 9 do `AGENTS.md`**.
