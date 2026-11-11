# Baixa de pagamento em nota — proposta para revisão

> Escrito em 11/11/2026, depois de a dívida dos fornecedores ter sido acertada com a
> planilha do dono (ADL 32.021,88 · H2O 36.453,62 · PLANETA 12.555,96 · ZL 3.930,80).
> Nada aqui foi aplicado: este documento existe para decidir antes.

## 1. O problema

Pagar um fornecedor **não abate a nota**. O pagamento entra como uma linha própria
("PAGAMENTO DE MERCADORIA", marcada paga) e a nota continua pendente. Resultado: a dívida
do fornecedor não acompanha o dinheiro que saiu — foi o que fez a ADL aparecer com
26.812,48 quando já tinha 7.355,60 pago.

## 2. O app já tem uma régua: `abaterNaDivida`

`app/painel/trocas/actions.ts` já resolve exatamente esse problema para **troca**:

1. procura as notas pendentes do fornecedor, da mais antiga para a mais nova;
2. **reduz o `valor` da nota** (`valor - abatido`) e acrescenta "(abateu X de troca)" na
   descrição;
3. quando a nota zera, marca `cancelado` — sai dos pendentes sem inventar pagamento;
4. se o abatimento for maior que a dívida, o que sobra vira **crédito** (linha negativa
   a pagar) que a próxima nota consome.

Ou seja: no app, abatimento **encolhe a nota**. Não usa `valor_pago`.

## 3. O que eu fiz hoje à mão

Para acertar ADL, H2O e ZL eu usei `valor_pago` (a nota fica com o valor cheio e acumula
a baixa). Funciona para o cálculo, mas é um **segundo mecanismo**: hoje existem notas com
`valor` reduzido por troca e notas com `valor_pago` cheio por baixa manual. Duas réguas
para a mesma coisa é o que gera número estranho depois.

## 4. Os dois caminhos

| | A — encolher a nota (o que o app já faz) | B — guardar `valor_pago` (o que eu usei) |
|---|---|---|
| Dívida | soma do `valor` das notas pendentes | soma de `valor − valor_pago` |
| Nota quitada | `valor` vira 0 e status `cancelado` | `valor_pago = valor` e status `pago` |
| Vantagem | uma régua só para troca e pagamento | mantém o valor original da nota visível |
| Risco | some o valor original (só a descrição conta a história) | precisa `valor_pago` em todo caminho de baixa; quem esquecer, a dívida mente |

## 5. Como está o dado hoje (não dá para trocar de régua sem conciliar)

| Fornecedor | Notas | Pagamentos | Notas − pagamentos | A pagar hoje |
|---|---|---|---|---|
| ADL | 35.363,00 | 11.872,08 | 23.490,92 | 32.021,88 |
| H2O | 48.954,74 | 57.186,14 | −8.231,40 | 36.453,62 |
| PLANETA | 11.988,92 | 567,04 | 11.421,88 | 12.555,96 |
| ZL | 8.285,00 | 4.457,00 | 3.828,00 | 3.930,80 |

As duas colunas não batem porque **parte dos pagamentos já foi abatida dentro de notas** e
parte não. Recalcular tudo por uma régua só exigiria saber, pagamento por pagamento, o que
já foi abatido — informação que hoje só existe escrita na descrição da nota.

## 6. Recomendação

1. **Não reescrever o passado.** A dívida atual já está igual à planilha do dono; mexer
   nela de novo para "uniformizar" é risco sem ganho.
2. **Regra daqui para frente:** ao marcar um pagamento a fornecedor como pago, aplicar o
   valor em `abaterNaDivida` — a mesma função da troca. A nota mais antiga encolhe, o que
   sobrar vira crédito com o fornecedor.
3. **Tela:** "A Pagar pendente" continua sendo a soma das notas pendentes; "já pago" passa
   a ser a soma dos pagamentos reais (sem contar nota paga duas vezes).

## 7. O que precisa decidir

1. Confirma o caminho **A** (encolher a nota) como régua oficial de abatimento?
2. O abatimento de pagamento vale para **toda** categoria de saída para fornecedor ou só
   `Mercadoria`?
3. Um pagamento **maior** que a dívida: vira crédito para a próxima nota (como a troca faz)
   ou fica como adiantamento em linha separada?
4. Nota que já foi paga **antes** desta regra existir: fica como está, sem retroativo?
