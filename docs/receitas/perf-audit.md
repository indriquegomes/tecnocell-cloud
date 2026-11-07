# Receita — Deixar o TecnoCell rápido (`/perf-audit`)

Ataca lentidão **medindo**, não chutando. Peso se prova com número: MB de HTML e
ms de render, no local **e** em produção.

Nasceu do PDV (07/07/2026): abria em 13–15 s com **5,57 MB**. Depois virou
**~1 s / 0,10 MB** (−98%). O que resolveu não foi CSS nem cache: a tela
**embutia 7.983 produtos + 2.397 clientes + 45 mil itens de tabela** no HTML.
Passou tudo para busca sob demanda.

## Como pedir

```
/perf-audit             # as telas mais usadas, ranqueadas por peso
/perf-audit pdv         # foca uma tela
/perf-audit prod        # mede em produção
```

## Regras de ouro

1. **Medir antes de tocar.** Primeiro número (MB + ms), depois diagnóstico, só
   então o corte. Sem medição, sem mexer.
2. **O gargalo quase sempre é DADO DEMAIS no HTML**, não CPU. O servidor
   responde rápido (TTFB ~18 ms); o peso é o server component mandando a lista
   inteira para o navegador.
3. **Provar no navegador** (Playwright), local e produção. Reportar antes→depois
   em número.
4. **Não quebrar comportamento.** Busca, preço e carrinho têm que continuar
   iguais — testar o fluxo, não só o tamanho.

## Fase 1 — Medir

```js
const t0 = Date.now()
const resp = await p.goto(BASE + '/painel/<tela>', { waitUntil: 'domcontentloaded' })
const mb = ((await resp.text()).length / 1024 / 1024).toFixed(2)
await p.waitForSelector('<marcador da tela>', { timeout: 40000 })
console.log(mb, 'MB ·', (Date.now() - t0) + 'ms')
```

Ranquear por MB **e** por ms. Referência medida em 06/11/2026 (produção, sessão
logada): média 1,8 s · Reposição 10,1 s · Saúde 6,0 s · Fechamento do Mês 5,5 s ·
Contas 5,3 s · Promoções 4,9 s · Relatórios 4,3 s.

## Fase 2 — Achar o que pesa

Não adivinhar: **medir cada lista**. Script `.cjs` que puxa os mesmos dados da
página e imprime `JSON.stringify(x).length` por conjunto e por campo.

```js
const kb = o => (JSON.stringify(o).length / 1024).toFixed(0) + ' KB'
console.log('produtos:', kb(prod), '| só descricao:', kb(prod.map(p => p.descricao)))
```

Lição do PDV: emagrecer cada item (cortar descrição/imagem) tirou só 540 KB de
2,2 MB — **o grosso era a lista inteira**. A solução foi não mandar a lista.

## Fase 3 — Cortar na raiz (em ordem de ganho)

1. **Busca sob demanda** — em vez de embutir N mil registros, buscar no servidor
   conforme digita (server action com `.ilike`/`.limit`, debounce ~250 ms) e
   guardar um cache que cresce no navegador. Ver `buscarProdutosPDV` /
   `buscarClientesPDV` em `app/painel/pdv/`. Busca sem acento usa coluna
   normalizada (`busca_norm`/`nome_norm`) com fallback antes da migration.
2. **Lazy-load do secundário** — dado que só serve depois de uma escolha (itens
   de tabela de preço, ficha detalhada) carrega quando escolhe.
3. **Contagem em vez de lista** — se a tela só usa `x.length`, trocar por
   `select('id', { count: 'exact', head: true })`.
4. **Paginar agregação** — relatório que soma tudo: paginar ou somar no banco
   (cuidado com o cap de 1000 linhas do PostgREST — usar `fetchAll`).

## Fase 4 — Provar e reportar

Rodar a Fase 1 de novo (antes→depois), confirmar em produção que o deploy
entrou, e testar o fluxo (busca acha, preço certo, carrinho soma).

```
## Perf — <tela> — <data>
<tela>: <MB antes> / <ms antes>  →  <MB depois> / <ms depois>  (−N%)
Causa: <o que pesava>  ·  Corte: <o que fiz>
Verificado: local ✅ · produção ✅ · fluxo ✅
```
