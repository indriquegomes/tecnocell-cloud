# Entradas de 01 a 07/11 — o que entrou e o que ficou a receber

> Apuração de 09/11/2026, só leitura. Loja Petrópolis e Teresópolis juntas.

## 1. Vendas do período

| Loja | Vendas | Valor | Desconto |
|---|---|---|---|
| Petrópolis | 701 | 60.443,80 | 919,17 |
| Teresópolis | 652 | 54.205,62 | 1.178,49 |
| **Total** | **1.353** | **114.649,42** | **2.097,66** |

O valor da venda já vem líquido do desconto (a soma dos itens é maior).

## 2. Como foi pago

| Forma | Lançamentos | Valor |
|---|---|---|
| PIX | 115 | 10.281,90 |
| Dinheiro | 24 | 1.326,50 |
| Cartão de débito | 11 | 838,60 |
| Cartão de crédito | 3 | 192,00 |
| **Entrou na hora** | **153** | **12.639,00** |
| Fiado gerado | 1.338 | **108.908,56** |

Ou seja: de cada 100 reais vendidos, **11 entraram** e **89 viraram conta a receber**.

## 3. Fiado cobrado no período

| Forma | Valor |
|---|---|
| PIX | 41.937,49 |
| Dinheiro | 18.013,70 |
| Outras formas | 856,00 |
| **Total recebido de fiado** | **60.807,19** |

## 4. Devoluções

| Medida | Valor |
|---|---|
| Devoluções registradas | **358** |
| Valor devolvido | **29.527,43** |

Um quarto do faturamento do período voltou como devolução. É o número mais alto desta
conferência e merece olhar próprio: 358 devoluções em 7 dias, com 1.353 vendas, significa
uma devolução a cada 3,8 vendas.

## 5. Crédito de cliente

| Medida | Valor |
|---|---|
| Crédito criado no período | 9.348,63 |
| Crédito usado no período | 7.823,36 |

## 6. Divergência encontrada na composição da venda

Somando o que foi pago na hora com o fiado gerado das vendas do período:

| Medida | Valor |
|---|---|
| Total das vendas | 114.649,42 |
| Pago na hora | 12.639,00 |
| Fiado lançado nas vendas do período | 108.908,56 |
| Soma pago + fiado | **121.547,56** |
| Diferença acima do total vendido | **6.898,14** |

A venda paga com **vale-crédito** entra no total da venda e não aparece em `pagamentos_venda`
(o vale não é linha de pagamento). O crédito usado no período foi 7.823,36 — valor próximo
da diferença, mas não igual. Precisa de conferência fina: ou o lançamento a receber está
sendo criado pelo valor cheio da venda mesmo quando parte foi paga com vale, ou existe
venda contada duas vezes na composição.

## 7. Telegram — entrada

Quando os comprovantes do Telegram são cruzados com o app, os valores de entrada não são a
mesma coisa que o faturamento: o grupo recebe o comprovante do cliente pagando **fiado**, e
não o da venda nova. Por isso a conferência de entrada é app × notas de caixa, e o Telegram
serve como prova por cliente.
