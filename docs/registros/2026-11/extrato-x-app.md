# Extrato do PagBank × app — o que bate e o que não bate

> Cruzamento de 09/11/2026. Extrato: `Downloads/01-11-2026_09-11-2026.csv` (136 linhas,
> de 02 a 07/11). App: lançamentos a pagar com status pago, de 02 a 07/11.
> Casamento por **mesma data e mesmo valor**. Só leitura.

## Números gerais

| Medida | Valor |
|---|---|
| Saídas no extrato (02 a 07/11) | 29.140,73 |
| Saídas lançadas no app (02 a 07/11) | 52.156,41 |
| Casou nos dois (11 itens) | 5.852,62 |

A diferença grande tem explicação: **o extrato não é a conta que paga fornecedor**.

## 1. O que bate — salários

Os 8 salários de 07/11 batem um a um: Mariana 611,54 · Lucas 798 · Giovane 765 · Erick 950 ·
Isaac 600 · Maria Eduarda 623,08 · Nikollas 720 · Brunna 656. Total 5.723,62.

## 2. Divergência de data — comissão e bônus

O app lança como pagos em **03/11**. O dinheiro saiu em outro dia:

| Lançamento no app | Data no app | Data no extrato |
|---|---|---|
| Comissão · 260,00 × 3 (Petrópolis) e 350,00 × 3 (Teresópolis) | 03/11 | **04/11** |
| Bônus · 260,00 (Brunna) | 03/11 | **05/11** |

Não é erro de valor — é a data em que alguém marcou "pago" no sistema, não a data em que o
PIX saiu. Para conferência de caixa e de banco, a data do extrato é a verdadeira.

## 3. O que só existe no extrato (34 saídas)

| Tipo | Valor | Observação |
|---|---|---|
| Aplicação em CDB (2 lançamentos) | 11.890,00 | investimento, não é pagamento a fornecedor |
| Edson Canedo | 2.600,00 | sem lançamento no app |
| Luiza Lopes Neves da Veiga Pinto (QR Code) | 1.499,78 | sem lançamento |
| Monteverde & Miller — advogado | 810,50 | sem lançamento |
| Enel Distribuição Rio | 549,43 | concessionária, sem lançamento |
| Leoni de Souza Azevedo | 500,00 | sem lançamento |
| Isabela Ponciano Câmara | 461,88 | sem lançamento |
| Águia Branca Transportes | 345,18 | sem lançamento |
| Igor Kreischer | 349,00 | é o estorno de crédito que está pendente no app (cliente) |
| Samira Amorim dos Reis | 4,00 | é o estorno de crédito que está pendente no app (cliente) |
| Posto Barra | 79,19 | combustível, sem lançamento |
| Armazém do Grão | 50,65 | sem lançamento |
| João Vítor Maximiano França (2 PIX) | 230,00 + 504,50 | transferência para a conta principal, não é despesa |
| Clientes (Raphael, Victor, Romulo, Fernando, Arthur, Kleber, Vitor, Lucas Gabriel, Endrieli) | ~1.100,00 | devoluções/estornos a cliente, sem lançamento |

## 4. O que só existe no app (79 itens)

| Grupo | Valor | Por que não está no extrato |
|---|---|---|
| Pagamentos a H2O (todos) | ~48.115,56 | saíram de **outra conta**, não desta |
| Vale crédito usado (dezenas) | ~2.200,00 | não é dinheiro saindo: é abatimento de saldo do cliente |
| Uso interno 5,43 · motoboy 82,50 · devolução 205,00 | 292,93 | pagos por fora desta conta |

## Conclusão prática

1. **Esta conta do extrato paga salário, comissão, contas de consumo e devolução a cliente.**
   Ela não paga fornecedor de mercadoria.
2. **A data de pagamento no app não é a data do banco** para comissão e bônus: 03/11 no app,
   04/11 e 05/11 no extrato. Se a conferência do mês usar a data do app, a comissão cai em
   dia errado.
3. **Treze saídas do extrato não têm lançamento no app** (fora CDB e transferência):
   Edson Canedo 2.600,00 · Luiza 1.499,78 · advogado 810,50 · Enel 549,43 · Leoni 500,00 ·
   Isabela 461,88 · Águia Branca 345,18 · Posto Barra 79,19 · Armazém do Grão 50,65 mais os
   pagamentos pequenos a clientes. Isso é despesa que saiu e não está registrada.
4. Os estornos de Igor (349,00) e Samira (4,00) **foram pagos** em 02 e 03/11 — no app
   continuam pendentes.
