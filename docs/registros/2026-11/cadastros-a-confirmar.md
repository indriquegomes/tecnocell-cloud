# Cadastros a confirmar — 11/11/2026

> Lista mandada ao dono em 10/11/2026 e respondida em 11/11/2026. Tudo aqui está
> **resolvido**: o que ele mandou apagar foi apagado, o que ele mandou manter ficou.
> Backups em `docs/registros-banco/backup-cadastros-apagados-2026-11-11.json` e
> `docs/registros-banco/backup-mesclar-clientes-2026-11-10.json`.

## Apagados — 14 cadastros

Nome de nota e de troca do SIGE, mais cadastro parado sem movimento. Nenhum tinha
venda, lançamento ou crédito.

| Cadastro | Por quê |
|---|---|
| CNN DA SEMANA QUE VEM | nome de nota no SIGE; o fornecedor de verdade é **CNN** (mantido) |
| COMPONENTES SP | nome de nota no SIGE |
| COMPONENTES DESCOBERTOS | nome de nota no SIGE |
| MERCADORIAS · TROCA MERCADORIAS · TROCAS MERCADORIAS · TROCAS DRAGÃO CELL FORNECEDOR · TROCA ZL CELL FORNECEDOR · TROCAS CNN | jeito antigo de lançar peça que volta de São Paulo; hoje isso é a aba **Trocas** |
| KASSEN · TOP10 · CANETINHAS · COCA COLA · SP | cadastro antigo, sem nenhum movimento |

**TROCA ZL CELL FORNECEDOR** tinha 4 notas de entrada (10, 34, 78 e 103) e 11 produtos
ligados. As notas e os produtos **não foram apagados** — ficaram sem fornecedor
(`fornecedor_id` nulo), porque a mercadoria entrou de verdade e o estoque é real.

## Mantidos

| Cadastro | Por quê |
|---|---|
| **CNN** | é o fornecedor de verdade; o nome limpo dele é esse |
| **MAIK CELL** | cliente que ficou devendo muito; o dono quer o cadastro |
| **DANIEL CAMELO** | cliente; o dono quer o cadastro |

## Duplicatas resolvidas

| Par | Resultado |
|---|---|
| H2O × 3 fichas vazias | apagadas; a real virou **H2O** |
| DIAMONDS × FORNECEDOR DIAMONDS | nota 39 movida; ficha vazia apagada |
| ELETROCELL × ELETROCELL MERCADORIAS | 7 vendas (2.957,50) movidas; ficha vazia apagada |
| BH SMART × BH SMART | 2 vendas (469,70) movidas; inativa apagada |
| ANDRE RODRIGUES × 2 | 8 créditos, 3 lançamentos, 2 pedidos e 13 vendas movidos para a ficha com CPF |
| JONATHAN MATHEUS VICTORIA DA ROCHA × 2 | 113 vendas movidas para a ficha com CPF |

## Nomes limpos (sem precisar confirmar)

`H2O FORNECEDOR` → **H2O** · `ADL FORNECEDOR` → **ADL** · `ZL CELL FORNECEDOR` → **ZL** ·
`INOVA MERCADORIAS` → **INOVA**, mais 19 fichas pequenas que perderam a palavra
(DIRECT CELL, DRAGÃO CELL, TIOCELL, TOK, HONYAN, TPLINK, TOP CELULARES, TAYYAR CELL,
TURBO CELL, CENTRO CELL, X CELL, TV BOX, 313, MOHAMAD FERRAMENTAS, MICHEL, SUN, ANNE,
KW2, RAAH).

## O que continua aberto fora desta lista

1. **30 cadastros com `idpessoa` no fim do id** — sobra da importação do SIGE. É chave
   primária em texto referenciada por vendas, lançamentos e notas; trocar exige cascata.
   Enquanto existir, rotina que monte id de pessoa pode repetir o erro dos 23 lançamentos
   órfãos de salário (religados em 11/11).
2. **Tipo dos cadastros que ficaram** — MAIK CELL e DANIEL CAMELO seguem como `cliente`
   por decisão do dono; se algum dia forem fornecedor, o certo é trocar o campo `tipo`.
