# Relatório da noite — 21/10/2026 (trabalho autônomo)

Pedido do dono: "melhore ainda mais nosso trabalho, vou dormir, faz o que puder sem ajuda".

Regras que a noite seguiu, sem exceção: nada de push, nada de deploy, nada de alteração
em banco, dado real, financeiro, caixa ou estoque. Tudo em branch local.

## Resumo

| # | O que era | Onde | Situação |
|---|---|---|---|
| 1 | Card "Fiado em aberto" do cliente mostrava valor errado | `app/painel/clientes/[id]/editar/page.tsx` | **Corrigido** (bug real, dinheiro) |
| 2 | Fluxo de caixa futuro parava em 1000 linhas | `app/painel/financeiro/fluxo/page.tsx` | **Corrigido** (proteção; hoje não afeta) |
| 3 | KPI de vendas do vendedor ia travar em 1000 no fim do mês | `app/painel/page.tsx` | **Corrigido** (bug real, quase estourando) |
| 4 | Não dava pra rodar os testes sem `tsx` instalado | `test/alias.mjs` | **Adicionado** |
| 5 | Sem conferência da dívida de fiado por cliente | `scripts/conferir-fiado-por-cliente.mjs` | **Adicionado** |

## 1. Fiado em aberto do cliente (bug de dinheiro — corrigido)

**O que o dono via:** no cadastro do cliente, o card "Fiado em aberto" mostrava um
número menor do que a dívida real — e em alguns casos zero.

**Causa raiz:** a tela montava a dívida a partir dos lançamentos ligados às **20 últimas
vendas** do cliente (`.limit(20)` na consulta de vendas). Quem tinha dívida de venda mais
antiga, ou quitação/nota manual lançada fora dessas 20, aparecia devendo menos.

**Medição no banco de produção (só leitura) antes da correção:**

- 567 notas de fiado pendentes, R$ 49.508,52 no total, 121 devedores.
- 1.016 clientes com venda no app.
- **10 cadastros mostravam valor diferente do real, somando R$ 10.440,51 a menos.**
- Pior caso: card mostrava **R$ 1.667,00** para dívida real de **R$ 6.288,40**.

**Correção:** a tela passou a usar a **mesma regra da tela Fiados** — lançamento
`tipo='receber'` + `status='pendente'`, onde o dono é o `pessoa_id` da nota ou, nas notas
antigas sem `pessoa_id`, a pessoa da venda ligada (435 notas hoje). Não se casa por NOME:
dois cadastros com o mesmo nome fazem a dívida de um aparecer no outro (testei — gerava
atribuição errada e foi descartado).

**Impacto em outras telas:** nenhum. Só o card do cadastro do cliente mudou; a tela
Fiados já usava essa regra. Nenhum cálculo de caixa, venda ou estoque foi tocado.

## 2. Fluxo de caixa futuro (proteção — corrigido)

A consulta de contas a pagar pendentes futuras não paginava; o PostgREST devolve no
máximo 1000 linhas por consulta, então a partir daí o fluxo futuro e a **sugestão de
transferência pra conta CNPJ** (que sai das despesas fixas do mês) passariam a
subnotificar **sem avisar ninguém**.

Hoje: 23 linhas, R$ 52.417,00 — o teto não é atingido. É proteção pra quando entrar
parcelamento/repetição em volume. Usei `fetchAll` + desempate por `id` na ordenação,
porque página com ordem que empata pode pular ou duplicar linha entre as fatias.

## 3. KPI de vendas do vendedor (bug real, quase estourando — corrigido)

O dashboard do vendedor monta "meu faturamento no mês" e "vendas hoje" com uma
consulta **sem paginação**. O PostgREST devolve no máximo 1000 linhas.

Medido no banco em 22/10: o vendedor de maior volume já tem **874 vendas** no mês
(1 a 22 de outubro, 4.085 vendas na loja). Faltavam ~126 vendas para a consulta
começar a mentir — ou seja, **estouraria antes do fim do mês**, e o total de
faturamento/meta do vendedor congelaria em 1000 vendas, sem aviso.

Correção: as duas consultas passaram a paginar (`fetchAll`), com desempate por `id`
na ordenação. Também ancorei a janela no fuso de São Paulo
(`${hoje}T00:00:00-03:00`) e troquei o corte de data por `diaSP()`.

Sobre o fuso, sendo honesto: medi e **nenhuma venda deste mês aconteceu depois das
21h** (a loja fecha antes), então esse pedaço não muda número nenhum hoje. Foi
correção de consistência com a regra documentada do projeto, não bug em produção.

## 3b. Por que isso importa mais que parece

Esses três primeiros itens são o **mesmo defeito**: consulta que devolve lista e
soma a lista, sem paginar. O modo de falha é sempre igual — o número diminui
devagar e ninguém percebe, até alguém decidir dinheiro com base nele. Vale a pena,
numa próxima noite, varrer as telas que somam listas e conferir uma por uma.

## 4. Testes rodando de novo

Os testes de lógica (`test/*.test.ts`) importam com o alias `@/lib/...` e não havia
runner instalado que resolvesse isso. Com `test/alias.mjs`:

```
node --import ./test/alias.mjs test/logica.test.ts
node --import ./test/alias.mjs test/motoboy.test.ts
node --import ./test/alias.mjs test/pix-conciliacao.test.ts
node --import ./test/alias.mjs test/robustez.test.ts
```

Resultado: **158 testes, 158 passando** (60 + 13 + 4 + 81).

## Verificação desta noite

- `npx tsc --noEmit` → exit 0 (antes e depois das mudanças).
- `npm run build` → "Compiled successfully in 23.5s". A etapa final (TypeScript do Next)
  não terminou porque o sandbox da sessão bloqueia processo filho (`spawn EPERM`) — não é
  erro de código. Type-check foi validado separado, com exit 0.
- Conferência numérica das duas correções: `node scripts/conferir-fiado-por-cliente.mjs`.

## Teste manual pro dono (5 minutos, no site)

1. Abra **Fiados** e anote o total de um devedor grande (ex.: o maior da lista).
2. Vá em **Clientes**, ache esse mesmo cliente e abra o cadastro.
3. O card "Fiado em aberto" tem que mostrar **o mesmo valor** da tela Fiados.
   Antes podia mostrar menos (no pior caso, R$ 1.667 contra R$ 6.288).
4. Confira 2 ou 3 devedores. Se algum divergir, anote o nome e me avise — aí é nota
   sem dono (hoje há **1 nota de R$ 790,00** sem cliente identificável).

O deploy dessa correção só vale no site **depois** da palavra-chave do dono. Enquanto
não subir, a tela online continua com o número errado.

## Achados que NÃO corrigi (e por quê)

- **`app/painel/entregas/page.tsx` e `motoboy/page.tsx`**: listam entregas pendentes sem
  paginação e usam `.in('venda_id', [...])` sem lote. Hoje o volume de pendentes é baixo
  e o risco é só de lista cortada, não de valor errado. Fica pra quando crescer.
- **`clientes/[id]/editar`**: o histórico do SIGE casa por `ilike('cliente', nome)` com o
  nome cru. Se o nome tiver `%` ou `_`, o filtro vira curinga. Só exibição (não soma
  dinheiro), então não mexi.
- **`app/convite/actions.ts`**: define senha por token, sem limite de tentativas. Aumentar
  segurança aqui mexe em autenticação — exige decisão e teste do dono.
- **Nada de banco.** Nenhuma migration foi criada ou aplicada nesta noite.

## Estado do repositório

Branch local `noite/2026-10-21`, **sem push**. `main` intacta, produção intacta.
