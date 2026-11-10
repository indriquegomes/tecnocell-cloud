# Vale-crédito usado — o que os números mostram

> Apuração de 09/11/2026, leitura apenas. Base: 01 a 09/11.

## O que é o lançamento "Vale crédito usado"

Quando o cliente paga uma compra com o crédito que tem na loja, o app grava um
lançamento a pagar com a categoria **Vale crédito usado**. É assim que o crédito
consumido vira despesa — sem isso, a venda apareceria como faturamento e o outro lado
da conta não existiria.

## O que foi apurado

| Medida | Valor |
|---|---|
| Crédito disponível em 31/10 (saldo dos clientes antes de novembro) | **5.054,62** |
| Crédito usado pelos clientes de 01 a 07/11 (`creditos_clientes` tipo `uso`) | **7.823,36** |
| Crédito criado em novembro (devoluções virando crédito) | 9.348,63 |
| Lançado como despesa "Vale crédito usado" de 01 a 09/11 | **2.667,00** (71 lançamentos) |
| Lançamentos com venda amarrada | **0 de 71** |
| Lançamentos com devolução amarrada | **0 de 71** |

## Os dois problemas

### 1. Só o crédito do mês anterior vira despesa

A descrição dos lançamentos é sempre "Vale crédito usado (**mês anterior**)". Crédito
criado e usado dentro de novembro não gera despesa nenhuma: a venda conta como
faturamento e não tem contrapartida.

Pelo saldo de 31/10 (5.054,62), o máximo que poderia ter virado despesa com crédito
antigo é 5.054,62. Foi lançado 2.667,00. A diferença pode chegar a **2.387,62** de
crédito antigo consumido sem despesa — depende de qual crédito o cliente usou primeiro,
e o app não guarda essa ligação.

### 2. O lançamento não aponta para a venda nem para o crédito

Os 71 lançamentos não têm `venda_id` nem `devolucao_id`. Ou seja: é impossível provar
qual uso de crédito gerou qual despesa. Se um deles for lançado duas vezes, ninguém
descobre pela tela.

## Falsos suspeitos que a apuração descartou

A checagem de "mesma pessoa, mesmo dia, mesmo valor" apontou lançamentos repetidos.
Ao abrir cada caso, quase todos são legítimos:

| Cliente | O que parecia | O que é |
|---|---|---|
| SPEED CELL | 76,00 duas vezes em 06/11 | uma compra de 271,00 paga com crédito em quatro linhas distintas (67 + 76 + 76 + 52), cada uma com seu lançamento e seu movimento de crédito |
| SHAKURCELL | 70,00 três vezes | usos diferentes; em 09/11 foram 142 + 31 + 72 + 50, cada um com lançamento próprio |
| BRASILIA CELULARES | 57,00 duas vezes em 04/11 | os usos reais naquele dia foram 85 + 87 + 8; os 57,00 não estão amarrados a nada |
| Brunna Furtado Gonçalves | 260,00 em Bônus e em Comissão | bônus além da meta — confirmado pelo dono |

Conclusão: **não há duplicata comprovada** no vale-crédito. O que existe é falta de
ligação entre a despesa lançada e a compra que a gerou.

## A decisão que fica para o dono

Crédito usado vira despesa **sempre** (e o app passa a lançar na hora do uso, amarrado à
venda), ou continua valendo só para crédito de mês anterior como é hoje?

Se a resposta for "sempre", a mudança é no código que grava a despesa: hoje ele olha a
origem do crédito; passaria a lançar em todo uso, com `venda_id` preenchido — o que
resolve os dois problemas de uma vez (valor certo e rastro).
