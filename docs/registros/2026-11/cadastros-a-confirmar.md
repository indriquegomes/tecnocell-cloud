# Cadastros a confirmar — 11/11/2026

> Lista para o dono dizer o que é cada ficha. Nada aqui foi alterado além do nome:
> o nome perdeu a palavra "FORNECEDOR" e "MERCADORIA", o tipo continua o que era.
> Levantado em 10/11/2026, para confirmação no dia seguinte.

## Fichas que ficaram sem a palavra no nome

| Nome agora | Tipo | Situação | Criada | Lançamentos | Vendas | Notas |
|---|---|---|---|---|---|---|
| COCA COLA | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| DANIEL CAMELO | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| CANETINHAS | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| KASSEN | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| MAIK CELL | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| TOP10 | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |
| SP | cliente | ativa | 04/09/2026 | 0 | 0 | 0 |

Sete fichas sem nenhum movimento. Duas perguntas para cada uma: **é fornecedor, cliente
ou não deveria existir?** E, no caso do `SP`: **qual é o nome real?** — "FORNECEDOR SP"
virou "SP", que não identifica ninguém.

## Fichas de processo (troca) — não são empresa

| Nome | Tipo | Lançamentos | Notas |
|---|---|---|---|
| MERCADORIAS | fornecedor | 0 | 0 |
| TROCA MERCADORIAS | fornecedor | 0 | 0 |
| TROCAS MERCADORIAS | fornecedor | 0 | 0 |
| TROCAS DRAGÃO CELL FORNECEDOR | fornecedor | 0 | 0 |
| TROCA ZL CELL FORNECEDOR | fornecedor | 0 | **4** |

Essas cinco são o jeito antigo de lançar a peça que volta de São Paulo, antes da função
de Trocas. `TROCA ZL CELL FORNECEDOR` tem 4 notas presas — entre elas a **nota 103**
(2.320,04), que o dono mandou ignorar em 10/11 porque não é dívida.

**Pergunta:** apagar as quatro que não têm nada, e a `TROCA ZL CELL FORNECEDOR` renomear
para o nome do processo (ou desligar depois que as notas antigas prescreverem)?

## Duplicatas encontradas no caminho

| Par | Situação |
|---|---|
| DIAMONDS × FORNECEDOR DIAMONDS | **resolvido** em 10/11: nota 39 movida, ficha vazia apagada |
| ELETROCELL × ELETROCELL MERCADORIAS | **resolvido** em 10/11: 7 vendas (2.957,50) movidas, ficha vazia apagada |
| H2O × 3 fichas vazias | **resolvido** em 10/11: as três apagadas, a real virou H2O |
| BH SMART × BH SMART | **resolvido** em 10/11: as 2 vendas (469,70) foram para a ficha `ambos` ativa, a inativa foi apagada. Ficou uma só, com 276 vendas |

## O que já foi consertado no nome (não precisa confirmar)

`H2O FORNECEDOR` → **H2O** · `ADL FORNECEDOR` → **ADL** · `ZL CELL FORNECEDOR` → **ZL** ·
`INOVA MERCADORIAS` → **INOVA**, mais 19 fichas pequenas que perderam a palavra
(DIRECT CELL, DRAGÃO CELL, TIOCELL, TOK, HONYAN, TPLINK, TOP CELULARES, TAYYAR CELL,
TURBO CELL, CENTRO CELL, X CELL, TV BOX, 313, MOHAMAD FERRAMENTAS, MICHEL, SUN, ANNE,
KW2, RAAH).

Backups de cada alteração em `docs/registros-banco/`.
