---
name: perf-audit
description: "Auditoria de performance do TecnoCell — mede peso (payload HTML) e tempo de cada tela rodando o app (Playwright, dev E prod), acha o que pesa de verdade e corta na raiz. Use quando o usuário falar em lentidão, deixar o sistema mais rápido/ágil/leve, performance, otimizar tela, tela demorando pra abrir."
trigger: /perf-audit
---

# /perf-audit — Deixar o TecnoCell rápido

Ataca lentidão **medindo**, não chutando. A regra de ouro: **peso se prova com número** (MB do HTML + ms de render), no dev e em produção. Nada de "acho que é isso".

Nasceu do PDV (07/07/2026): abria em 13-15s / **5,57 MB**. Depois da auditoria virou **~1s / 0,10 MB** (−98%). O que resolveu não foi mexer em CSS nem cache — foi achar que a tela **embutia 7.983 produtos + 2.397 clientes + 45k itens de tabela** no HTML e passar tudo pra **busca sob demanda**.

## Como usar

```
/perf-audit             # audita as telas mais usadas, ranqueia por peso
/perf-audit pdv         # foca uma tela
/perf-audit prod        # mede em produção (tecnocell-cloud.vercel.app)
```

## Regras de ouro

1. **Medir antes de tocar.** Primeiro número (MB + ms), depois diagnóstico, só então corte. Sem medição = sem mexer.
2. **O gargalo quase sempre é DADO DEMAIS no HTML**, não CPU. TTFB do servidor é ~18ms (rápido). O peso é o server component mandando lista inteira pro cliente.
3. **Provar no browser** (Playwright), dev e prod. Reportar o antes→depois em número.
4. **Não quebrar comportamento.** A busca/preço/carrinho tem que continuar igual — testar o fluxo, não só o tamanho.

## Fase 1 — Medir (o número manda)

Playwright: login → `goto(tela, {waitUntil:'domcontentloaded'})` → `resp.text().length` = tamanho do HTML. Cronometrar até o seletor-chave da tela aparecer.

```js
const t0=Date.now()
const resp=await p.goto(BASE+'/painel/<tela>',{waitUntil:'domcontentloaded'})
const mb=((await resp.text()).length/1024/1024).toFixed(2)
await p.waitForSelector('<marcador da tela>',{timeout:40000})
console.log(mb,'MB ·',(Date.now()-t0)+'ms')
```

Ranquear as telas por MB. As suspeitas conhecidas (medidas 06-07/07): **PDV ✅ resolvido**, **Estoque ~5,4s / 618KB**, **Relatórios ~6,3s**, Produtos/Clientes já paginados mas dá pra enxugar.

## Fase 2 — Achar o que pesa (decompor o payload)

Não adivinhar qual campo/lista é o vilão — **medir cada um**. Script `.cjs` no scratchpad puxando os mesmos dados que a página embute e imprimindo `JSON.stringify(x).length` por dataset e por campo:

```js
const kb=o=>(JSON.stringify(o).length/1024).toFixed(0)+' KB'
console.log('produtos:',kb(prod), '| só descricao:',kb(prod.map(p=>p.descricao)))
```

Lição do PDV: trim de campo (descricao/imagem) só cortava 540KB de 2,2MB — **o grosso era a lista inteira**. Por isso a solução foi não mandar a lista, não emagrecer cada item.

## Fase 3 — Cortar na raiz (padrão que funcionou)

Em ordem de ganho:

1. **Busca sob demanda** — em vez de embutir N mil registros, a tela busca no servidor conforme digita (server action com `.ilike`/`.limit`, debounce ~250ms). Vira um **cache acumulável** no cliente; o resto da tela (carrinho, seleção) lê desse cache. Ver `buscarProdutosPDV`/`buscarClientesPDV` em `app/painel/pdv/`.
   - Busca sem acento: coluna normalizada + trigger + índice (`busca_norm`/`nome_norm`), igual `2026-08-09-produtos-busca-sem-acento.sql`. Sempre deixar **fallback** por nome/código pra não quebrar antes da migration rodar.
2. **Lazy-load do secundário** — dado que só serve depois de uma escolha (itens de tabela de preço, ficha detalhada) carrega quando escolhe, não no load. Ver `buscarItensTabela`.
3. **Contagem em vez de lista** — se a página só usa `x.length`, trocar por `select('id',{count:'exact',head:true})`.
4. **Paginar agregação** — relatórios/listas que somam tudo: paginar ou agregar no banco (cuidado com o cap de 1000 do PostgREST → [[bug-postgrest-max-rows-1000]]).

## Fase 4 — Provar e reportar

Rodar a Fase 1 de novo (antes→depois) no dev, dar push só com OK ([[fluxo-testar-dev-antes-de-subir]]), e **confirmar em produção que o deploy entrou** medindo o payload lá (não basta o `git push` — esperar o build; PDV caiu de 5,57MB→0,10MB em prod). Testar o fluxo (busca acha, preço certo, carrinho soma) — não só o tamanho.

Relatório curto:

```
## Perf — <tela> — <data>
<tela>: <MB antes> / <ms antes>  →  <MB depois> / <ms depois>  (−N%)
Causa: <o que pesava>  ·  Corte: <o que fiz>
Verificado: dev ✅ · prod ✅ · fluxo ✅
```

Ver [[plano-melhorias-preparado]] (item 8), [[padrao-lista-universal]], [[bug-postgrest-max-rows-1000]].
