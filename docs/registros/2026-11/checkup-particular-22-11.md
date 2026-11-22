# Check-up — 22/11/2026 (rodada da aba Particular)

Alvo: **produção** (`tecnocell-cloud.vercel.app`), leitura. Dado de teste com prefixo
`__QA__` e limpeza conferida. Foco: aba nova do dono (Particular) + integridade geral.

## Fase 0 — escopo e preparo

- `git status`: só arquivos desta rodada (scripts, docs, `docs/registros-banco/2026-11/`).
  `docs/registros/2026-11/preview-nao-vender/` segue de fora (não é desta sessão).
- `npx tsc --noEmit` = **0** antes e depois de cada mudança.
- Alvo: produção. Nenhuma escrita em dado real; o único registro criado foi `__QA__`.

## Fase 1 — integridade de deploy

- Commits desta rodada: `af9ab04` (devolução + migration + scripts), `1716536` (decisões),
  `7358fa5` (aba Particular), `94faa83` (fix do Sair). Todos empurrados para `main`.
- **Produção roda o código atual**: verificado logado — a aba abre, o menu tem
  "Particular (dono)" e os cards mostram R$ 5.976,00 (nov/2026) e R$ 6.000,00 (jan/2027).

## Fase 2 — passar por todas as telas

**87 telas estáticas visitadas em produção: 86 OK, 1 falso positivo.**

| Tela | Resultado |
|---|---|
| 86 rotas | HTTP 200, título presente, **zero erro de console/exception** |
| `/painel/pedidos-app/imprimir` | 200 sem `<h1>/<h2>` — **é tela de impressão**, não tem título por desenho (falso positivo já conhecido) |
| `/painel/estoque/reposicao` | 4,1s (a mais lenta do dia; já medida em 1,9s warm — cold start) |

## Fase 3 — CRUD real com limpeza

Fluxo da aba Particular testado de ponta a ponta em produção:

1. **Prefill do atalho** `+ Nova conta particular` → formulário abre com
   `tipo = A Pagar` e `categoria = Particular` ✔
2. **Criação**: descrição `__QA__ conta particular teste`, valor `R$ 1,00` (campo
   mascarado digitou certo: `1.00` no input escondido) → salva e volta para o
   Financeiro ✔
3. **Banco**: `pagar / Particular / 1 / pendente` ✔
4. **Aba Particular**: a linha aparece na lista do mês ✔
5. **Limpeza**: registro apagado, **restos `__QA__` = 0** ✔

## Fase 4 — padrões de bug conhecidos

- Nenhuma escrita nova em tabela de PK TEXT (categoria é texto em `lancamentos`).
- Rota nova (`/painel/particular`) começou com `requirePermissao('master')` ✔.
- Permissão configurável: `lib/permissoes.ts` ganhou `/painel/particular: 'master'` ✔.
- Consulta da aba usa `fetchAll` (o PostgREST corta em 1000) ✔.
- Datas com `hojeSP()` e `formatDate` (fuso de São Paulo), sem `toISOString` ✔.
- Nenhum `<button>` dentro de `<button>` na tela nova.

## Fase 5 — usabilidade da aba

- Navegação de mês funciona: "mês seguinte →" levou de **Novembro De 2026** para
  **Dezembro De 2026** ✔
- Cards com quatro números e legenda curta (pró-labore · pagas · sobra · pendente);
  sobra fica **vermelha** quando negativa.
- Estado vazio tratado: "Nada lançado neste mês. Use '+ Nova conta particular'…"
- Mês sem pró-labore mostra aviso laranja com o combinado (4.000 + 2.000) e link
  para lançar.
- Pequeno: o nome do mês aparece como "Novembro De 2026" (capitalização do CSS);
  cosmético, não atrapalha leitura.

## 🟡 Achado de integração (corrigido)

**Botão "Sair" quebrava o formulário.** Em `components/BotaoSair.tsx`, o `form.submit()`
era chamado **depois** do `await signOut()` — nesse momento o `currentTarget` do evento
sintético já é `null`, e o clique estourava
`Cannot read properties of null (reading 'submit')`: o POST de saída não chegava no
servidor. Apareceu quando o teste de integração clicou no primeiro `button[type=submit]`
da tela (o do menu) e o formulário não salvou. Conserto: guardar o formulário **antes**
do await (commit `94faa83`). `tsc` = 0.

## Resumo

```
87 telas · 86 OK · 1 falso positivo (impressão) · 0 erro de console
CRUD da aba Particular: criar → aparece → apagar → 0 restos
1 bug real achado e corrigido (logout)
deploy verificado em produção
```
