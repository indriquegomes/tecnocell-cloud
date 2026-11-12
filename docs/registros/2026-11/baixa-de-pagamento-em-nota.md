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

---

## 8. 12/11/2026 — a dívida voltou a bater com a planilha (111.442,26)

O dono mandou os cinco saldos da planilha: **ADL 27.463,68 · PLANETA CELL 12.555,96 ·
H2O 32.489,12 · ZL 3.689,80 · INOVA 35.243,70 = 111.442,26**. O app estava em
112.702,76 — 1.260,50 acima. Quatro fornecedores batiam ao centavo; só o H2O não.

**A causa:** um pagamento de **1.260,50 em 11/11/2026** (PIX, lançado sem fornecedor)
estava gravado com a categoria **`fornecedor/mercadoria`** — sem espaço em volta da
barra. A lista tolerante de `ehCompraDeMercadoria` (`lib/financeiro-setores.ts`) só
conhecia `fornecedor / mercadoria`, **com** espaço. E o abatimento em
`app/painel/financeiro/actions.ts` comparava a categoria por **igualdade exata** com
`'Mercadoria'`. Resultado: dois filtros independentes recusaram a mesma linha e a
nota do H2O nunca encolheu — o dinheiro saiu, a dívida ficou.

**O que foi corrigido:**

1. `ehCompraDeMercadoria` normaliza espaço em volta da barra — grafia não muda mais
   o significado (3 casos novos em `test/logica.test.ts`).
2. `marcarPago` usa essa régua única em vez de comparar texto exato.
3. `marcarPago` **avisa** quando um pagamento de mercadoria não tem fornecedor — antes
   passava em silêncio e a dívida ficava maior que a planilha.
4. O pagamento de 1.260,50 foi ligado ao cadastro do H2O e abatido pela
   `abaterNaDivida` (a mesma função do Financeiro e da troca), com o rastro no
   histórico da nota.
5. O mesmo fornecedor aparecia com **dois nomes** nas notas (`ADL` / `ADL FORNECEDOR`,
   `H2O` / `H2O FORNECEDOR`, `ZL` / `ZL CELL FORNECEDOR`). `pessoa_nome` foi alinhado
   ao nome do cadastro — soma não muda, mas agrupar/filtrar por nome deixou de mostrar
   o mesmo fornecedor duas vezes.

**Conferido depois (liquido = `valor − valor_pago`, status pendente, categoria
mercadoria, 31 linhas):**

| Fornecedor | App | Planilha | |
|---|---|---|---|
| ADL | 27.463,68 | 27.463,68 | ok |
| PLANETA CELL | 12.555,96 | 12.555,96 | ok |
| H2O | 32.489,12 | 32.489,12 | ok |
| ZL | 3.689,80 | 3.689,80 | ok |
| INOVA | 35.243,70 | 35.243,70 | ok |
| **Total** | **111.442,26** | **111.442,26** | **ok** |

**INOVA:** o saldo de 35.495,30 em 30/10 estava certo, e o abatimento de **251,60 é de
trocas ANTIGAS** (já lançado como linha negativa em 05/11). As trocas atuais da aba
Trocas não foram tocadas — ordem do dono em 12/11/2026.

**Aberto, não corrigido (falta informação):** existe um pagamento de **100,00 em
11/11** sem fornecedor, com a mesma descrição "PAGAMENTO DE MERCADORIA", e três PIX de
100,00 de clientes para **FERNANDES DA SILVA REPRESENTACAO COMERCIAL** (10 e 11/11) que
não têm cadastro de fornecedor nem dívida registrada no app. Não entram nos cinco
saldos da planilha, então nada aqui muda; ficam registrados para o dono dizer de quem
são.

> **Resolvido no item 10:** os dois primeiros parágrafos acima estão superados. A
> Fernandes da Silva é o próprio ZL, e os PIX não estavam perdidos — o app consolida o
> dia por loja. Ver seção 10.

---

## 9. 12/11/2026 — as duas réguas viraram uma (histórico de outubro)

Fechado o 1.260,50 e conferido o ZL, sobrou o histórico com **duas réguas** de baixa
convivendo: notas 91/92 pagas por `valor_pago` (o jeito antigo) e notas 112/113 pagas
por encolhimento (o jeito oficial). O total fechava, mas quem abrisse as notas de
outubro via duas linguagens.

**O que foi feito:** as **12 notas pendentes** de mercadoria que ainda tinham
`valor_pago` foram convertidas para a régua oficial — o valor da nota encolheu, o
`valor_pago` voltou a zero, o abatimento foi escrito na descrição e no histórico, e a
nota que zerou saiu como `cancelado` (não inventa pagamento).

| Fornecedor | Notas convertidas | valor_pago absorvido |
|---|---|---|
| ADL | 3 | 10.971,40 |
| H2O | 6 | 13.284,20 |
| ZL | 2 | 4.355,60 |
| **Total** | **12** | **28.611,20** |

**Nenhum centavo mudou.** Dívida por fornecedor antes e depois:

| Fornecedor | Antes | Depois |
|---|---|---|
| ADL | 27.463,68 | 27.463,68 |
| H2O | 32.489,12 | 32.489,12 |
| INOVA | 35.243,70 | 35.243,70 |
| PLANETA CELL | 12.555,96 | 12.555,96 |
| ZL | 3.689,80 | 3.689,80 |
| **Total** | **111.442,26** | **111.442,26** |

Hoje não existe nenhuma nota pendente de mercadoria com `valor_pago` (`n = 0`).
Backup das 12 linhas antes da conversão:
`docs/registros-banco/2026-11/backup-baixa-valor-pago-2026-11-12T17-07-53-032Z.json`.

**O que NÃO foi tocado:** as **208 notas de mercadoria já pagas** que carregam
`valor_pago` (724.486,33). São história encerrada — a recomendação 1 deste documento
continua valendo ("não reescrever o passado"). Duas delas têm `valor_pago` acima do
`valor`, e a auditoria do Saúde já as aponta.

---

## 10. 12/11/2026 — a Fernandes da Silva é o ZL (não é fornecedor solto)

O dono desconfiou que os PIX de cliente para **FERNANDES DA SILVA REPRESENTACAO
COMERCIAL SJC LTDA** estavam amarrados a algum fornecedor. Estavam: é o **ZL**,
cadastrado em `pessoa_chaves_pix` com `tipo_chave = 'Nome no comprovante'` (o
comprovante não traz chave nem CNPJ, só o nome do favorecido). Há uma segunda chave
igual: **PLANORH PLANEJAMENTO E ORGANIZACAO EMPRESARIAL**.

**E os PIX não estavam perdidos.** O app consolida o dia inteiro numa linha só, por
loja. Conferência dia a dia:

| Dia | Loja | PIX de cliente | Lançado |
|---|---|---|---|
| 10/11 | Petrópolis | 2.148,00 | 2.148,00 |
| 10/11 | Teresópolis | 2.207,60 | 2.207,60 |
| 11/11 | Teresópolis | 241,00 | 100,00 lançado + 141,00 abatido na nota 113 |

Um dos comprovantes de 10/11 traz o nome **mascarado**
(`FERNANDES ** ***** ************* ********* *** ****`) e mesmo assim entrou na soma —
o casamento por nome tolera máscara.

**Lição para a próxima conferência:** procurar um lançamento por comprovante individual
não acha nada; o lançamento é a soma do dia por loja. Foi o que fez a primeira análise
deste dia parecer que faltavam 5.022,90.
