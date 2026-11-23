# Achados depois do fechamento — outubro/2026

> Nota de rodapé do mês **já fechado**. Nada aqui volta para a lista de pendências de
> outro mês; serve para não se perder o rastro do que apareceu depois.

## Vale-crédito do ISEC: fica devendo R$ 230,00 (achado em 23/11/2026)

Ao conferir o saldo de vale-crédito em novembro, o ISEC apareceu com saldo negativo de
**R$ 230,00**. O motivo é de **outubro**, e o extrato mostra linha por linha:

| Quando | O que | Valor |
|---|---|---|
| 27/10 14:45 | crédito "Sinal de encomenda" | + 230,00 |
| 27/10 14:45 | crédito "Sinal encomenda frontal sansung m54…" | + 230,00 |
| 31/10 12:11 | uso "Usado na venda #10726" | − 460,00 |
| 31/10 16:09 | estorno de crédito #c24658f2 | − 230,00 |

Os dois créditos de 230,00 foram criados **no mesmo minuto**, com o mesmo valor — sinal de
encomenda lançado em dobro. Os dois foram gastos de uma vez no uso de 460,00 e, no fim do
dia 31/10, um deles foi estornado. Resultado: o cliente usou **R$ 230,00 de crédito que
não existia**.

Como outubro está fechado, **nada foi lançado em novembro**. Duas saídas, decisão do dono:

- cobrar: lançar "a receber" de R$ 230,00 no nome do ISEC, em novembro, com a descrição
  apontando para a venda #10726; ou
- perdoar: lançar como perda, com o motivo escrito.

Referência: `scripts/conferir-estornos-credito.mjs 2026-10` mostra o mesmo caso no mês de
origem (alarme 5 — estorno do mês que passou do saldo).
