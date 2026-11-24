# Régua da perda, da devolução e da troca

> **Para que serve:** dizer, em cada situação, o que é o certo — o que sai do estoque, o
> que entra no resultado e qual lançamento nasce. Se o sistema diverge daqui, o sistema é
> que está errado. Vale para os dois depósitos e para as duas lojas.

## 1. As três verdades que não mudam

1. **Perda é sempre pelo CUSTO, nunca pelo preço de venda.** O preço que não entrou não é
   despesa — é lucro que não aconteceu.
2. **O custo entra UMA vez.** Ou fica no resultado (peça perdida) ou volta para o estoque
   (peça boa). Nunca os dois; nunca nenhum.
3. **Toda saída de estoque tem motivo, autor, data e vínculo** (venda, devolução, troca,
   perda, uso interno, transferência, nota). Saída sem vínculo é furo e vira alerta.

## 2. Matriz — o que é o certo em cada caso

| Situação | Estoque | Resultado | Lançamento |
|---|---|---|---|
| Peça **vendida** | −custo | +preço (receita) e −custo (CMV) | venda (+ pagamento) |
| Cliente devolve **peça boa**, loja devolve o dinheiro | +custo (volta) | −preço (contra-receita) e **+custo** (estorno do CMV) | “Devolução — cliente” + estorno de custo |
| Cliente devolve **peça boa**, vira **vale-crédito** | +custo | receita reduzida na devolução; o crédito é **passivo** com o cliente | devolução + crédito no extrato do cliente |
| Cliente devolve **peça boa**, loja **não** devolve dinheiro | +custo | nada muda (loja ficou com o preço e com a peça) | só a devolução |
| Cliente devolve **peça quebrada**, loja devolve o dinheiro | não volta | −preço (contra-receita) e −custo (CMV fica) | “Devolução — cliente”; peça baixa como perda do custo |
| Cliente devolve **peça quebrada**, loja **não** devolve (cliente quebrou) | não volta | +preço fica e −custo (CMV) → margem = preço − custo | nada além da venda (o custo já está no CMV) |
| Peça **quebra no estoque** (nunca vendida) | −custo | −custo (perda) | `movimentar_estoque` perda → despesa “Perda: produto” (automática) |
| Peça vai para o fornecedor em **troca** e ele repõe | −custo, depois +custo | nada | troca + nota de entrada da reposição |
| Fornecedor **não troca** (peça perdida) | não volta | −custo | “Perda de troca — …” |
| Peça usada em **teste/consumo** | −custo | −custo (uso interno) | `movimentar_estoque` uso interno → despesa “Uso interno: produto” |
| **Falta de dinheiro** na gaveta | — | −valor (quebra de caixa) | “Perda / Quebra de caixa” — **nunca** junto com perda de mercadoria |

## 3. Identidades que têm de fechar todo mês (por depósito)

```
estoque final = estoque inicial
              + compras (notas de entrada)
              − custo das peças vendidas (CMV)
              + custo das peças devolvidas boas
              − perdas de estoque
              − uso interno
              ± transferências
```

E, para o dinheiro:

```
receita do mês = vendas pagas − devoluções pagas − descontos − créditos estornados
```

Fechou? O mês está certo. Não fechou? A diferença tem nome antes de fechar o mês.

## 4. O que o app faz hoje × o que é o certo

| Regra | App hoje |
|---|---|
| perda pelo custo, despesa automática na baixa | ✅ `movimentar_estoque(perda)` grava “Perda: produto” pelo custo |
| uso interno vira despesa | ✅ idem |
| fornecedor que não troca vira “Perda de troca” | ✅ |
| peça quebrada **não** volta ao estoque vendável | ✅ status `avaria` (23/11/2026) |
| devolução de **peça boa** estorna o custo (CMV) | ❌ **não faz** — o CMV é lido só de `itens_venda`; a peça volta ao estoque e o custo continua no resultado |
| quebra de caixa separada de perda de mercadoria | ❌ as duas caem em `Perda` |

**Tamanho do furo (novembro/2026):** 1.053 peças voltaram como `ok`, custo de
**R$ 45.870,72** — esse custo está no CMV do mês **e** a peça está no estoque. Pela régua,
o resultado de novembro está **pior** do que a verdade nesse tanto (o erro é a favor de
"lucro menor", nunca de lucro inventado).

## 5. Como fechar a diferença (quando o dono autorizar)

1. **Leitura do mês (barato, não mexe em dado):** o CMV passa a ser
   `Σ itens_venda.custo_unitario × qtd − Σ itens_devolucao(status 'ok').custo × qtd`.
   Uma linha na consulta do DRE/relatórios; o número do mês sobe exatamente o custo que
   voltou.
2. **Registro contábil (mais completo):** a devolução com peça boa grava um “estorno de
   custo” vinculado ao item devolvido, e o fechamento usa esse crédito. Dá histórico por
   peça e sobrevive a mudança de relatório.
