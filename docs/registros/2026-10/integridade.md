# Integridade de outubro/2026 (read-only)

## Fiado
- notas de fiado criadas no mês: 5872 · R$ 479.673,19
- em aberto hoje: 300 · R$ 26.520,69
- em aberto SEM cliente (pessoa_id nulo): 128 · R$ 10.092,24
- em aberto SEM venda ligada: 1
- **marcadas PAGAS com valor_pago = 0: 1470 · R$ 107.894,86** (dívida sumiu sem registro de pagamento)
- pagas com valor_pago MAIOR que a dívida: 0
- vencidas antes de outubro: 41 · R$ 4.408,36

## Vale-crédito
- histórica: 2860 linhas · credito R$ 87.562,84 · uso R$ 81.225,22 · estorno R$ 1.283,00
- **saldo de vale hoje (crédito − uso ± estorno): R$ 7.620,62**
- créditos sem cliente: 6
- no mês: +R$ 51.092,42 de crédito · R$ 50.371,78 de uso
- **clientes com saldo NEGATIVO: 0 · R$ 0,00**

## Devoluções (por que voltam)
| Motivo (label em lib/motivos.ts) | Registros | Valor | Unidades |
|---|---|---|---|
| Pediu pra testar | 1198 | R$ 97.166,29 | 1418 |
| Cliente dele desistiu | 438 | R$ 31.605,15 | 508 |
| Peça errada / não serviu | 209 | R$ 16.119,18 | 276 |
| Defeito alegado | 43 | R$ 4.448,00 | 44 |
| Outro | 10 | R$ 990,00 | 14 |

- devolvido R$ 150.328,62 = **29.7%** do vendido (R$ 506.509,63)

## Caixa por sessão (fechamento declarado × esperado)
- sessões: 85 · fechadas 85 · abertas 0
- maior diferença numa sessão (fechamento − abertura − movimentos de dinheiro): R$ 1.081,60 em 2026-10-20

## Estoque e movimentos
- linhas negativas: 1 (-8 un)
- movimentos do mês por operação (unidades): saida 2158 · entrada 12686 · uso_interno 14 · perda 1

