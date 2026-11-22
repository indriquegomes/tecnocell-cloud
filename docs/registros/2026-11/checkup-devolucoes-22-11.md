# Check-up focado: devolução de compra e dinheiro devolvido ao cliente — 22/11/2026

> Escopo pedido pelo dono: cruzar a lista de estornos do WhatsApp (01–21/11) com o app,
> testar a usabilidade das formas de devolver dinheiro ao cliente e apontar o que
> força a pessoa a fazer a coisa certa. **Somente leitura** — nada foi corrigido em
> produção nesta análise além do aviso de tela (ainda não publicado).

Alvo: banco de produção (leitura) + código. Não rodei clique-a-clique em produção:
toda devolução de teste mexeria em estoque, dívida e caixa de dado real.

## 1. O que a tela permite hoje (5 formas de reembolso)

`app/painel/devolucoes/DevolucoesClient.tsx` — `CREDITO_OPTS`:

| Opção | O que o app faz | Sai dinheiro de onde |
|---|---|---|
| 🎟️ Vale Crédito (conta do cliente) | grava em `creditos_clientes` | de lugar nenhum |
| 💵 Dinheiro | movimento de caixa `devolucao` | **gaveta** (exige caixa aberto) |
| 💠 PIX | lançamento `Devolução — nome` com `conta_id` | conta que recebeu a venda |
| 💳 Débito / Crédito | estorno na maquininha (operador faz na máquina) | adquirente |
| — Sem reembolso | **nada** | **nada** |

## 2. As 5 regras duras do servidor (`app/painel/devolucoes/actions.ts`)

1. **Dinheiro só no mesmo dia da venda** (a gaveta do dia já foi contada).
2. **Venda no cartão devolve por estorno** — PIX bloqueado.
3. **Venda em dinheiro do mesmo dia não devolve em PIX** (senão o banco paga e a
   gaveta fica com o dinheiro).
4. **Venda que não entrou em dinheiro não devolve em dinheiro.**
5. **Estorno de cartão só de venda que passou na maquininha.**

Cada bloqueio fica em `logs_atividade` e o dono pode liberar com **senha de
liberação** (3 erros em 10 min bloqueiam por 10 min). O RPC também recusa:
venda cancelada, reembolso acima do vendido e reembolso que não fecha com as formas.

## 3. Achados (por severidade)

### 🔴 CRÍTICO 1 — "Sem reembolso" com valor a devolver = dinheiro some do Financeiro

A opção `sem_reembolso` aparece na lista **mesmo quando há reembolso > 0**
(`CREDITO_OPTS.filter(op => !op.destaque)`, linha 1179). A action envia
`tipo_credito = 'sem_reembolso'` e o RPC, na linha 238 da migration
`20261027211000`, **não cria nada** para
`tipo_credito in ('sem_reembolso','cancelamento_fiado')`.

Resultado: devolução concluída, estoque devolvido, cliente pago por PIX **fora do
app**, e nenhum lançamento no Financeiro.

**Prova nos dados de novembro:** 39 estornos pagos por PIX (R$ 5.526,90) ×
`devolucoes` registradas como `sem_reembolso` e só 7 lançamentos `Devolução —`
(R$ 678,00) antes da correção de hoje.

**Correção certa (duas camadas):**
- tela: `sem_reembolso` só existe quando não há valor a devolver (o painel laranja
  já cobre esse caso);
- servidor: o RPC recusa `reembolso > 0.005` com `tipo_credito` em
  (`sem_reembolso`,`cancelamento_fiado`) — hoje ele aceita calado.

### 🔴 CRÍTICO 2 — Devolução de fiado que paga PIX dobra o prejuízo

Se a venda foi fiada, o RPC abate a dívida (`abate_fiado`) e o que sobra vira
reembolso. Quando o atendente escolhe "sem reembolso" e paga o cliente por PIX por
fora, o cliente fica **com a dívida cancelada e com o dinheiro**. Não há aviso
nenhum na tela dizendo "esta venda era fiado: se você pagar o cliente, está
devolvendo dinheiro que a loja nunca recebeu".

### 🟡 MÉDIO 3 — Crédito de devolução pode virar dinheiro duas vezes

O modo misto permite `credito_conta` + `pix` na mesma devolução. Em novembro, 4
devoluções tinham crédito em conta **e** PIX saiu: Igor Kreischer 349,00 ·
SUPERCELL 45,00 · Samira Amorim dos Reis 4,00 · Larissa Playtec 141,00. Falta uma
trava simples: crédito gerado por devolução **não pode** ser pago em dinheiro
depois — ou o crédito é cancelado quando o dinheiro sai.

### 🟡 MÉDIO 4 — Sem registro de "quem pagou fora do app"

Não existe campo para dizer "eu paguei o cliente pelo PagBank agora e quero o
lançamento". O caminho que sobra é escolher PIX (que cria o lançamento) — mas nada
na tela lembra disso depois que a devolução já foi salva. Consequência: ninguém
volta para corrigir.

### 🟢 PEQUENO 5 — Comentário enganoso no código

`actions.ts:447` diz "SEM EXCEÇÃO (decisão do dono em 22/10): nem o master libera",
mas as regras usam `barrar()`, que **libera com a senha do master**. Ou o comentário
sai, ou a senha sai — hoje o código e o comentário contam histórias diferentes.

### 🟢 PEQUENO 6 — Aviso novo (feito hoje, não publicado)

Devolução sem valor mostra aviso vermelho dizendo que o app não lança saída e que,
se o cliente recebeu por PIX/dinheiro, o valor tem que estar preenchido.

## 4. Teste de usabilidade por cenário (o que acontece hoje)

| # | Cenário | Hoje | Veredito |
|---|---|---|---|
| 1 | Compra em PIX, cliente desiste, devolve por PIX | tela sugere PIX, RPC cria lançamento com a conta da venda | ✔ certo |
| 2 | Mesmo caso, atendente escolhe "Sem reembolso" e paga PIX por fora | devolução salva, **nenhum lançamento** | ✖ crítico 1 |
| 3 | Compra fiada devolvida | dívida abatida, sem saída de dinheiro | ✔ certo — **se** não pagar nada |
| 3b | Compra fiada devolvida **e** PIX pago ao cliente | dívida cancelada + dinheiro devolvido | ✖ crítico 2 |
| 4 | Compra em dinheiro de hoje, devolver em dinheiro | gaveta, exige caixa aberto | ✔ certo |
| 4b | Compra em dinheiro de hoje, devolver em PIX | bloqueia (REGRA 3) | ✔ certo |
| 5 | Compra em dinheiro de outro dia, devolver em dinheiro | bloqueia (REGRA 1) → PIX ou crédito | ✔ certo |
| 6 | Compra no cartão, devolver em PIX | bloqueia (REGRA 2), só master com senha | ✔ certo |
| 7 | Troca por outro item do mesmo valor | devolução sem reembolso + venda nova; estoque do antigo volta | ✔ certo |
| 7b | Troca com diferença paga pelo cliente | venda nova com pagamento; devolução sem reembolso | ✔ certo |
| 8 | Devolução parcial de venda mista (parte fiado, parte paga) | RPC abate fiado primeiro, resto vira reembolso | ✔ certo |
| 9 | Devolução de venda cancelada | RPC recusa com mensagem clara | ✔ certo |
| 10 | PIX de devolução em conta inativa | RPC recusa "Conta de reembolso inexistente ou inativa" | ✔ certo |

## 5. Travаs propostas (ordem de impacto)

1. **Tela:** esconder "Sem reembolso" quando `reembolso > 0.01` (1 linha).
2. **Banco:** RPC recusar `reembolso > 0` sem forma de pagamento (migration nova,
   copiando o corpo da última — `20261027211000`).
3. **Tela:** aviso quando a venda tem fiado: "a dívida será cancelada; se você pagar
   o cliente, estará devolvendo dinheiro que a loja não recebeu".
4. **Tela:** confirmação extra quando o cliente recebe crédito em conta — mostrar o
   saldo que ele passa a ter, para o operador ver o crédito nascer.
5. **Relatório:** no Fechamento do Mês, listar devoluções com `tipo_credito` em
   (`sem_reembolso`,`cancelamento_fiado`) **e** PIX de saída no mesmo dia/valor — o
   detector do que passou antes da trava.

## 6. O que já foi corrigido nesta rodada

- 34 lançamentos `Devolução — cliente` criados (R$ 4.692,90) para os estornos pagos
  por PIX que não estavam no Financeiro — com backup e DESFAZER.
- Aviso vermelho na tela quando a devolução fica sem valor (não publicado).

## 7. Fiado × PIX de estorno — a distinção e a medição

São duas coisas diferentes que se cruzam:

| | Devolução de venda **fiada** | **Estorno** de venda paga |
|---|---|---|
| O que aconteceu | cliente levou sem pagar | cliente pagou (PIX/dinheiro/cartão) |
| O que a devolução faz | **cancela/abate a dívida** (`abate_fiado`) | **devolve o dinheiro** (`reembolso`) |
| Sai dinheiro? | **não** (salvo se o caixa pagar por fora) | sim, pela forma que entrou |
| Onde mexe | `lancamentos` de A Receber | `lancamentos` de A Pagar + conta/gaveta |

Elas se cruzam na **venda mista** (parte fiado, parte paga): o RPC abate a dívida
primeiro e só o resto vira reembolso — está correto no código.

**Medição de novembro (só leitura):** 1.045 devoluções, das quais **673 com fiado
abatido (R$ 54.248,50)** e 372 sem fiado (R$ 28.944,42). Dos 673, **um** caso acabou
com dívida cancelada **e** dinheiro pago: **UELINGTON BARRETO MARTINS, R$ 47,00**
(21/11). Ou seja: o risco existe, é real, mas em novembro custou R$ 47,00 — o
problema grande do mês foi o outro (valor a devolver sem forma de pagamento).

## 8. Travas aplicadas

1. **Tela** — "Sem reembolso" deixa de existir quando há valor a devolver
   (`DevolucoesClient.tsx`).
2. **Banco** — `supabase/migrations/2026-11-22-devolucao-exige-forma-de-reembolso.sql`:
   o RPC recusa `reembolso > 0` com `sem_reembolso`/`cancelamento_fiado` (uma forma
   só) e recusa misto sem nenhuma forma real. **NÃO aplicada** — precisa colar no SQL
   Editor do Supabase. Corpo copiado da última versão
   (`20261027211000`), só com a trava nova (conferido por diff).
3. **Tela** — aviso âmbar quando a venda é fiada: "esse cliente não pagou nada —
   devolver dinheiro agora é prejuízo de R$ X".
4. **Tela** — ao escolher vale-crédito, mostra o valor e o nome de quem recebe o saldo.
5. **Conferência** — `scripts/conferir-devolucoes-sem-lancamento.mjs <AAAA-MM>` (só
   leitura) lista, antes de fechar o mês: valor a devolver sem forma de pagamento,
   fiado cancelado + dinheiro pago, e crédito em conta + dinheiro pago.

## 9. O que o detector aponta em novembro (22/11, depois dos 34 lançamentos)

- **20 devoluções** com valor a devolver e **nenhuma** saída lançada — R$ 2.223,40
  (ex.: FABIANO 350,00 · Lucas Gabriel 229,00 · PEDRO HENRIQUE 217,00 · IMPERA 195,00).
  Boa parte dessas casou com as **retiradas de caixa** do item 3 (350 "venda fabiano",
  62 "venda wm", 196 "pagaram no cartão e quitaram no pix").
- **1** fiado cancelado + dinheiro pago: Uelington 47,00.
- **4** crédito em conta + dinheiro lançado do mesmo valor: DAVID DOS SANTOS MORTES
  45,00 · LK CELL 61,00 · LUIZ CARLOS SANTANA 67,00 · DENILSON PEÇAS 45,00 — dois
  deles por causa dos lançamentos desta rodada; o crédito tem que ser cancelado.

