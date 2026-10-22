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
- ⚠️ **Correção do número (22/10):** aquela primeira medição só comparava clientes que
  tinham venda no app. A varredura completa dá **12 cadastros e R$ 11.838,81** — os dois
  que faltaram (ALMA TECH R$ 608,30 e a cliente da nota de R$ 790) não têm venda no app.
  Número correto para citar: **12 cadastros, R$ 11.838,81**.

**Correção:** a tela passou a usar a **mesma regra da tela Fiados** — lançamento
`tipo='receber'` + `status='pendente'`, onde o dono é o `pessoa_id` da nota ou, nas notas
antigas sem `pessoa_id`, a pessoa da venda ligada (435 notas hoje). Não se casa por NOME:
dois cadastros com o mesmo nome fazem a dívida de um aparecer no outro (testei — gerava
atribuição errada e foi descartado).

**Quem era escondido (varredura completa, 22/10):**

| Cliente | Card mostrava | Real | Faltava | Notas escondidas |
|---|---|---|---|---|
| TRICELL 16 DE MARÇO | R$ 1.667,00 | R$ 6.288,40 | R$ 4.621,40 | 48 |
| TRICELL MR - MR CELL | R$ 1.107,00 | R$ 3.256,00 | R$ 2.149,00 | 24 |
| TRICELL CURSO LOJA | R$ 1.156,00 | R$ 2.251,00 | R$ 1.095,00 | 13 |
| SMART PHONE | R$ 1.334,90 | R$ 2.385,42 | R$ 1.050,52 | 9 |
| Isabela Ponciano Camara | R$ 0,00 | R$ 790,00 | R$ 790,00 | 1 |
| ALMA TECH ACESSÓRIOS | R$ 0,00 | R$ 608,30 | R$ 608,30 | 1 |
| CENTRAL TECH / UP CELL / PAC TEC | R$ 1.166,00 | R$ 1.723,00 | R$ 557,00 | 10 |
| LUIS GUILHERME FONTOURA SAMPAIO SIQUEIRA DA SILVA | R$ 0,00 | R$ 364,85 | R$ 364,85 | 1 |
| BRUNA ALVES | R$ 158,00 | R$ 465,00 | R$ 307,00 | 3 |
| Nikollas Bernardo Leocadio | R$ 0,00 | R$ 125,74 | R$ 125,74 | 2 |
| FORCELL CENTRO | R$ 1.366,00 | R$ 1.472,00 | R$ 106,00 | 1 |
| Maria Eduarda Kappler da Silva | R$ 427,30 | R$ 491,30 | R$ 64,00 | 1 |

O padrão: três TRICELL (revendedores que compram fiado muitas vezes por mês) concentram
R$ 7.865,40 dos R$ 11.838,81. Quem compra muito estoura fácil o recorte de 20 vendas.

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

## Escrita em produção autorizada depois (22/10)

Única alteração de DADO feita nesta frente, autorizada pelo dono ("liga o 790 a ela"):

| Antes | Depois |
|---|---|
| `lancamentos.id = 7498c104-e1cf-4513-b5e9-8881bb00184e` — R$ 790,00, `itens diversos`, venc 19/12/2026, `pessoa_id = null` | mesmo registro com `pessoa_id =` cadastro da cliente |

- Motivo: era a **única** nota do banco sem dono identificável. Casava só pelo nome, então
  aparecia na tela Fiados e **não** aparecia no cadastro da cliente (card mostrava R$ 0,00).
- Travas aplicadas antes de gravar: a nota tinha que estar `receber`/`pendente`, com valor
  exatamente R$ 790, sem `pessoa_id`, e o nome da nota tinha que ser idêntico ao nome do
  cadastro de destino. Tudo conferido; 1 linha alterada.
- Resultado conferido: card da cliente passou a mostrar **R$ 790,00**; notas sem dono no
  banco agora são **0**.
- **Reversão:** `UPDATE lancamentos SET pessoa_id = NULL WHERE id = '7498c104-e1cf-4513-b5e9-8881bb00184e';`
- Nenhum outro campo da nota foi tocado (valor, vencimento, loja, status continuam iguais).

## Estado do repositório

Branch local `noite/2026-10-21` foi mergeada na `main` e publicada (`84379be`, `14d1a0f`,
`3ddde37`). A nota de R$ 790 foi ligada depois disso — mudança de dado, não de código, e
não gera commit.
