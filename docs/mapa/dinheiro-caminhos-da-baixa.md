# Dinheiro: onde cada pagamento é gravado

> Mapa único das **baixas** (o ato de quitar uma conta a receber ou a pagar).
> Existe porque o mesmo ato hoje acontece em 13 lugares do app + 1 no sentido
> contrário (desfazer), e cada um grava coisas diferentes.
>
> Números medidos em **09/11/2026** com `node scripts/dinheiro-diagnostico.mjs`
> (só leitura). Se você mexer em qualquer um destes caminhos, **rode de novo**.
> Regras do projeto: `AGENTS.md`. Regra do dinheiro na fala: `AGENTS.md` §13.

## 1. Os caminhos (13 + o desfazer)

"Histórico" = grava uma linha em `lancamentos.historico_pagamentos` (é o que o
PDV mostra ao cliente no crediário). "Caixa" = grava `movimentos_caixa`.

| # | Caminho | Onde | Histórico | Data | Caixa |
|---|---|---|---|---|---|
| 1 | Receber fiado no PDV | RPC `receber_fiado_reais` + `app/painel/pdv/actions.ts:913` | sim | `::date` | em passo separado (`:924`) |
| 2 | Receber vários de uma vez | RPC `receber_lancamentos_lote` | sim | `::date` | sim, na mesma transação |
| 3 | Receber com vale-crédito | RPC `receber_fiados_vale` | sim | `::date` | não (vale não é dinheiro) |
| 4 | "Pago" no Financeiro | `app/painel/financeiro/actions.ts:231` | **não** | ISO com hora | em passo separado |
| 5 | Cliente pagou o fornecedor direto | `app/painel/pdv/operacao/actions.ts:305` | sim | ISO com hora | não (não passa na gaveta) |
| 6 | Entrega de vale-crédito | `app/painel/vales-credito/actions.ts:108` | sim | ISO com hora | em passo separado |
| 7 | Abater dívida de **fornecedor** com troca | `app/painel/trocas/actions.ts:306` | **não** | **nenhuma** | não; **muda `valor`** e marca `cancelado` |
| 8 | Sangria / retirada lançada no Financeiro | `app/painel/financeiro/actions.ts:462` | não | ISO com hora | vira conta, não movimento |
| 9 | Perda da troca | `app/painel/trocas/actions.ts:201` e `:357` | não | ISO com hora | não (não sai dinheiro) |
| 10 | Recebimento de OS | `app/painel/os/actions.ts:192` | não | só o dia | sim, antes, separado |
| 11 | Sinal de encomenda | `app/painel/encomendas/actions.ts:88` | não | só o dia | não |
| 12 | Salário semanal automático | `app/painel/lembretes/actions.ts:141` e `:162` | não | só o dia | não |
| 13 | Freelancer pago | `app/painel/freelancers/actions.ts:21` | não | — | não |
| 14 | Venda do Mercado Livre | `app/api/integracoes/mercado-livre/webhook/route.ts:188` | não | — | via RPC da venda |
| **↩** | **Desfazer pagamento** | RPC `desfazer_pagamento_atomico` (11/2026) | **não apaga** | apaga | apaga só `origem='financeiro'` |

Só os caminhos 1, 2, 3, 5 e 6 gravam histórico. Os outros 8 deixam o pagamento
sem rastro na tela do cliente.

## 2. Os leitores que discordam

| Conta | Onde | Regra que usa |
|---|---|---|
| Data do pagamento (leitura A) | `app/painel/fechamento-mes/page.tsx:138`, `lib/contabilidade.ts:142` | converte pra Brasília |
| Data do pagamento (leitura B) | `app/painel/relatorios/page.tsx:485` | corta o texto em UTC (`.slice(0,10)`) |
| Gaveta (conta oficial) | RPC `calcular_valor_esperado` | texto **contém** "dinheiro"; venda sem olhar `pagamentos_venda.status` |
| Gaveta (limite de retirada) | `lib/caixa.ts:106` (`dinheiroNaGavetaDe`) | texto **exatamente** "dinheiro"; venda só com status `pago` |
| Gaveta (tela de operação) | `app/painel/pdv/operacao/page.tsx` (`tipoDoTexto`) | mapa de apelidos + **contém** "dinheiro" |
| Quanto o cliente deve (nome) | `app/painel/pdv/actions.ts:172` | `pessoa_nome` |
| Quanto o cliente deve (cadastro) | `app/painel/clientes/[id]/editar/page.tsx:46` | `pessoa_id` + nota antiga pela venda |
| Quanto o cliente deve (sem nota antiga) | `app/painel/devolucoes/actions.ts:775` | só `pessoa_id` |
| Quanto o cliente deve (por nome, agrupado) | `app/painel/fiados/page.tsx:119` | `semAcento(nome)` |

## 3. Números medidos (09/11/2026)

Fonte: `scripts/dinheiro-diagnostico.mjs` (só `select`). 12.503 lançamentos.

- **10.087 pagos**, 579 pendentes (500 a receber, 79 a pagar).
- **Data do pagamento em três formatos:** 7.851 em `15:00:00+00` (meio-dia de
  Brasília, leitura segura), **1.847 em `00:00:00+00`** (21h do dia anterior em
  Brasília, R$ 153.996,11) e o resto com hora real.
- **1.848 pagamentos mudam de dia** conforme a tela que lê. Desses, **2 caem em
  mês diferente** (outubro lido como setembro).
- **2.496 pagos sem histórico de pagamento** (R$ 825.724,98); **236** com
  histórico que não bate com `valor_pago` (R$ 7.378,72 de diferença).
- **1.465 pagos com `valor_pago` vazio** (R$ 118.509,33) — a maior parte na
  categoria `Vendas`, que é outro assunto (ver §5).
- **64 notas a receber sem `pessoa_id`** (R$ 5.003,33) — **todas** têm venda,
  então dá para resolver pela venda. Nenhuma órfã.
- **Nenhum** nome com mais de um cadastro devendo hoje.
- 500 pendentes a receber: **abaixo** do corte de 1.000 do PostgREST.

## 4. O que já está consertado

- **Crediário do PDV paginado** (`app/painel/pdv/actions.ts:585`): usa
  `fetchAll`. Antes, acima de 1.000 fiados pendentes o PDV mostrava menos
  dívidas que a tela Fiados.
- **Data do pagamento num formato só** — migration
  `supabase/migrations/2026-11-09-normalizar-data-pagamento.sql` (gatilho
  `normalizar_data_pagamento`). **Ainda NÃO aplicada.** Só age em escrita nova;
  não toca nas 1.847 linhas antigas.

## 5. O que falta, e por quê

1. **Uma função só de baixa** (valor pago + status + data + forma + conta +
   histórico + gaveta na mesma transação). Hoje o PDV faz em dois passos: se o
   segundo falhar — ou se não houver caixa aberto — o fiado fica pago e o
   dinheiro não entra em caixa nenhum. Modelo pronto para copiar:
   `receber_lancamentos_lote`.
2. **Desfazer pagamento não limpa o histórico.** `desfazer_pagamento_atomico`
   volta o lançamento para pendente e apaga o movimento, mas a linha de
   pagamento continua no `historico_pagamentos` — o crediário mostra um
   pagamento que não existe mais.
3. **`valor_pago` nulo em dois caminhos** (`os/actions.ts:192`,
   `encomendas/actions.ts:88`): gravam `status='pago'` sem `valor_pago`, então
   quem soma `valor - valor_pago` conta dinheiro recebido como dívida.
   **Não resolver com gatilho**: `app/painel/pdv/operacao/page.tsx:196-208` lê
   `valor_pago > 0` para saber quanto da venda foi pago como fiado depois da
   venda; preencher em toda linha paga faria a tela do caixa contar a venda
   inteira como fiado abatido. Conserto é no caminho de escrita, um por um.
4. **Dívida sempre pelo cadastro.** 4 consultas diferentes hoje (§2). A regra
   certa é `pessoa_id`, com a nota antiga resolvida pela venda — é o que
   `clientes/[id]/editar/page.tsx:46` já faz.
5. **Uma conta só de gaveta.** Apagar `dinheiroNaGavetaDe` de `lib/caixa.ts` e o
   `tipoDoTexto` da tela de operação; todos chamam `calcular_valor_esperado` e
   comparam por `formas_pagamento.tipo`, nunca por texto livre.
6. **Abatimento por troca** (caminho 7) destruir a nota: reduz `valor` e marca
   `cancelado` em vez de registrar pagamento com forma "Troca". Raio grande
   (mexe em `abaterNaDivida`, `abaterTrocasEmLote`, tela de trocas e na dívida
   que o fornecedor vê) — fazer por último, com exemplo de antes/depois.
7. **Schema real e formato único de migration.** `supabase/schema.sql` tem 191
   linhas para 76 tabelas usadas; 230 migrations em dois formatos de nome;
   `finalizar_venda` tem 19 versões. A coluna `lancamentos.pessoa_id` existe no
   banco e **não** existe em nenhuma migration.

## 6. Como conferir

```bash
node scripts/dinheiro-diagnostico.mjs   # números do banco real (só leitura)
npm run test:dinheiro                   # divergência das telas em banco de treino
npm run test:logica                     # os 210 testes de lógica de hoje
npm test                                # os dois
```

A migration nova passa por `test/dinheiro.test.mjs` (grupo "CORRIGIDO") antes de
existir no banco: o banco de treino aplica o arquivo e prova que os leitores
passam a concordar, inclusive na virada do mês.

## 7. Onde o dinheiro encosta: a conta — 4 respostas

Pergunta: "quando um pagamento é registrado, em qual CONTA o dinheiro encosta?"
Hoje há quatro respostas diferentes.

| Quem decide | Onde | Dinheiro em espécie vai para |
|---|---|---|
| A autoridade do saldo | `lib/saldos-contas.ts:42` (`contaDoDinheiro`) | **COFRE** da loja (decisão de 26/10); se não houver, conta tipo `caixa` |
| Recebimento de fiado no PDV | `app/painel/pdv/actions.ts:818` (`contaDaFormaTexto`) | conta tipo `caixa` |
| Recebimento de OS | `app/painel/os/actions.ts:137` (`contaDaFormaOS`) | conta tipo `caixa` |
| Baixa de vale-crédito | `lib/conta-da-forma.ts:38` (`contaDaForma`) | **nenhuma** (null — a cédula já é registrada em `movimentos_caixa`) |

Medido no banco real em 09/11/2026 (lançamentos `status='pago'` com `conta_id`):

| Conta | Lançamentos | Valor |
|---|---|---|
| tipo `cofre` (destino oficial do dinheiro em espécie) | 3 | R$ 14.650,00 |
| tipo `caixa` (deveria ser fundo fixo de troco) | **1.778** | **R$ 283.797,00** |
| tipo `banco` | 5.143 | R$ 623.448,28 |
| sem conta (lançamento de venda — esperado) | 3.163 | R$ 658.922,10 |

Leitura: o dinheiro de balcão está na conta que a regra diz que nunca se mexe. É
a origem do "banco apareceu com R$ 25 mil a mais" e de saldo de conta que não
fecha com o extrato.

### O que falta aqui (decisão do dono antes de codar)

1. **Qual é a resposta certa** para dinheiro em espécie: cofre (como a autoridade
   diz), conta `caixa`, ou nenhuma (só `movimentos_caixa`)? A resposta muda o
   saldo de 12 contas.
2. **Corrigir para trás** os R$ 283.797 na conta de troco, ou só daqui para
   frente? Corrigir para trás muda número já usado para decidir compra.
3. Depois da decisão: **uma função só** (substitui `contaDaFormaTexto`,
   `contaDaFormaOS`, `contaDaForma` e `contaDoDinheiro`), com número de antes e
   depois por conta e backup em `docs/registros-banco/`.

Enquanto a decisão não vem, caminho novo usa `lib/conta-da-forma.ts` e nenhum
caminho é "consertado" isolado — é assim que nasce a quinta resposta.

