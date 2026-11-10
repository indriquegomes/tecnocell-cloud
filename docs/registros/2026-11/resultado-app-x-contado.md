# Resultado — app × dinheiro contado

> Fechamento da conferência de novembro. Saldos do app lidos em 09/11/2026 pelo próprio
> código da tela Contas (`lib/saldos-contas.ts`). Valores contados informados pelo dono.
> Só leitura.

## O que o app mostra agora

| Conta | Saldo no app |
|---|---|
| PagBank | 44.125,86 |
| Cofre Petrópolis | 29.480,10 |
| Cofre Teresópolis | 15.866,50 |
| Caixa Petrópolis | 6.676,90 |
| Caixa Teresópolis | 9.181,80 |
| Cofre PagBank | 9.813,00 |
| TON Teresópolis | 63,00 |
| **Total** | **115.207,16** |

## O que foi contado

| Conta | Contado | App | Diferença |
|---|---|---|---|
| Cofre Petrópolis | 1.168,00 | 29.480,10 | **28.312,10 a mais no app** |
| Cofre Teresópolis | 2.553,00 | 15.866,50 | **13.313,50 a mais no app** |
| PagBank | 59,23 | 44.125,86 | **44.066,63 a mais no app** |
| **Total** | **3.780,23** | **89.472,46** | **85.692,23** |

Além disso o app mostra 15.858,70 em dinheiro de gaveta (Caixa Petrópolis 6.676,90 +
Caixa Teresópolis 9.181,80), que não entraram na contagem dele — o dono contou só os cofres.

## Por que a diferença existe — as duas causas, com números

### 1. Nenhum pagamento do mês foi registrado como saída de dinheiro

Nos 9 dias, o total pago foi **64.528,51**. Desse total, **48.638,96** é mercadoria. E
**26.569,50** de mercadoria foi lançada **sem conta** — ou seja, não descontou de banco nem
de cofre. As retiradas de gaveta registradas no período somam só 1.006,80.

O dinheiro saiu da gaveta e do cofre para pagar fornecedor, mas o app não tem esse caminho:
o lançamento existe como despesa paga e não aponta para conta nenhuma.

### 2. O PagBank recebe tudo e não devolve nada

A conta PagBank do app soma as vendas em PIX e cartão do mês e os recebimentos de fiado, e
desconta apenas os lançamentos com conta preenchida. Como 26.569,50 de mercadoria está sem
conta, esse valor nunca saiu do saldo — ele só sobe. Pelos números contados, o banco pagou:
quase tudo entrou e saiu, sobrando 59,23.

## O que falta para fechar ao centavo

Uma única informação: **de cada pagamento do mês, quanto saiu em dinheiro do cofre e quanto
saiu do PagBank**. Com essa divisão:

| Se souber | Dá para | 
|---|---|
| pagamento pago em dinheiro do cofre | baixar do cofre e conferir com a contagem |
| pagamento pago por PIX do PagBank | baixar do banco e conferir com o extrato |

Sem essa divisão, o máximo que se prova é o total: o app diz 89.472,46 nas três contas
contadas, o dono conta 3.780,23, e a diferença de 85.692,23 é maior que o total pago no mês
(64.528,51) — o que mostra que parte da diferença também é dinheiro que nunca passou por
conta nenhuma no app.

## Leitura de conjunto

| Medida | Valor |
|---|---|
| Pago no mês (01 a 09/11) | 64.528,51 |
| Pago em mercadoria | 48.638,96 |
| Mercadoria lançada sem conta | 26.569,50 |
| Retiradas de gaveta registradas | 1.006,80 |
| Diferença entre app e contagem | 85.692,23 |

A conclusão da conferência: **o app sabe o que foi vendido e o que foi comprado; não sabe de
onde saiu o dinheiro que pagou.** Enquanto o pagamento não apontar para uma conta (banco ou
cofre), o saldo de cada conta é uma ficção — e é isso que separa 89 mil de 3,7 mil.
