# Cobrança sem itens devolvidos

## Problema

A tela de fiados monta as peças da cobrança usando todos os `itens_venda`. Ela não desconta quantidades registradas em `itens_devolucao`, então peças já devolvidas aparecem no WhatsApp.

## Regra

- Calcular saldo físico por `venda_id + produto_id`: quantidade vendida menos quantidade devolvida.
- Omitir produto com saldo zero.
- Mostrar somente a quantidade restante quando a devolução for parcial.
- Manter valor da cobrança vindo do saldo do lançamento financeiro; não recalcular dívida pelos itens.
- Não excluir a venda inteira quando apenas uma peça foi devolvida.

## Implementação

Reusar a consulta em lotes da tela de fiados. Buscar `itens_devolucao` ligados às vendas por meio de `devolucoes`, agregar quantidades devolvidas e filtrar os itens antes de montar `pecasPorVenda`.

Extrair somente o cálculo puro de quantidade restante para teste, evitando nova camada ou dependência.

## Testes

- Item totalmente devolvido desaparece.
- Devolução parcial mantém apenas quantidade restante.
- Item sem devolução permanece igual.
- Valor financeiro da nota não muda.
