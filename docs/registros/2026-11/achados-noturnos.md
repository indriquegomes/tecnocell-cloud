# Achados noturnos — análise e melhorias seguras

> Trabalho feito sem o dono, de madrugada, em leitura e mudanças seguras. Nada aqui foi
> commitado nem publicado: as mudanças de código ficam no arquivo, esperando revisão dele.

## Resumo (leia só isto se tiver pressa)

**Cinco mudanças aplicadas no arquivo**, todas de texto ou código sem uso, nenhuma em cálculo
de dinheiro:

| # | Mudança | Arquivo |
|---|---|---|
| 1 | "Faltam 78% pra bater Granada" virou "Faltam R$ 179.706,70 pra bater Granada" — o cartão misturava a distância até o topo com a próxima faixa | `app/painel/page.tsx` |
| 2 | Removida a consulta de venda individual que ficou sem uso depois que o velocímetro passou a medir a loja | `app/painel/painel-vendedor/actions.ts` |
| 3 | Sigla **CMV** saiu da tela: virou "Custo das peças vendidas" no fechamento, no DRE, no gráfico e no diálogo de trocas | `fechamento-mes/page.tsx`, `relatorios/page.tsx`, `trocas/TrocasClient.tsx` |
| 4 | Cinco testes novos travando a regra que separa compra de estoque de despesa | `test/logica.test.ts` |

**Oito correções preparadas, esperando autorização** — tabela no fim deste arquivo.

**Verificação:** `npx tsc --noEmit` sem erro e **78 testes passando** (eram 73).

## Regra deste trabalho

| Pode | Não pode |
|---|---|
| ler código e banco | alterar dado de produção |
| corrigir texto de tela, comentário e código sem uso | mexer em cálculo de dinheiro, estoque, caixa |
| escrever documento | commit, push ou deploy |
| rodar type-check e testes | — |

## Achado 1 — o cartão de meta do painel misturava duas réguas (CORRIGIDO no arquivo)

**Onde:** `app/painel/page.tsx`, cartão grande de meta do master.

**O que mostrava:** um percentual calculado contra a **meta do topo** (ex.: 320.000) e, logo
abaixo, o texto "Faltam **78%** pra bater **Granada**". Os 78% eram o que faltava para o topo,
mas a frase dizia que era para Granada.

**Por que importa:** Granada está em 78% da meta do topo. Quem lesse "faltam 78% pra bater
Granada" entenderia que falta quase tudo para Granada — quando na verdade faltavam 72% da
própria Granada, ou 179.706,70 em reais.

**Correção aplicada no arquivo:** o texto passou a mostrar o valor em reais, que o código já
calculava e não usava — "Faltam R$ 179.706,70 pra bater Granada". O percentual grande continua
igual, agora com a legenda "da meta do topo", que é o que ele realmente mede.

**Estado:** alteração feita em `app/painel/page.tsx`, type-check e 73 testes passando,
**não commitada**.

## Achado 2 — três telas calculavam comissão por vendedor (já corrigido antes)

Registrado aqui só para não se perder: Relatórios e Painel do vendedor mostravam comissão de
0,5% sobre a venda de cada pessoa. A regra é comissão da loja dividida pelo time. As duas
telas foram corrigidas e publicadas antes do trabalho noturno (commit `aa2a28a`).

## Achado 3 — o mesmo 0,5% em dois lugares (já corrigido antes)

Configurações guardava `comissao_percentual` e o JSON de metas guardava `comissao`. Mudar em
um não mudava o outro. Corrigido e publicado (commit `b1bcc4a`).

## Fila para as próximas rodadas

1. Varrer as telas de **estoque** e **vendas** atrás do mesmo tipo de problema: número que
   mede uma coisa e texto que diz outra.
2. Conferir telas que somam dinheiro sem paginar (`fetchAll`), comparando o total com o banco.
3. Procurar cálculo com data errada (fuso) em relatórios.
4. Listar código sem uso depois das últimas mudanças de metas e comissão.
5. Preparar (sem aplicar) as correções que dependem de autorização.

## Achado 4 — Fiados: o total da tela confere com o banco (VERIFICADO, nada a corrigir)

A tela Fiados soma as notas a receber pendentes por cliente. Conferido contra o banco:
**442 notas · 38.546,09**. A consulta da tela filtra `tipo = receber`, `status = pendente`,
pagina com `fetchAll` e só conta o que ainda deve acima de 1 centavo — igual à conta que fiz
à mão. Nenhuma divergência.

## Achado 5 — Estoque: duas telas usam réguas diferentes (55,00 hoje, cresce com o tempo)

| Tela | O que soma | Valor agora |
|---|---|---|
| Painel (RPC `dashboard_resumo`) | só produto **ativo**, quantidade > 0 | **394.965,43** |
| Fechamento do mês (`lib/estoque-custo.ts`) | qualquer produto, quantidade > 0 | **395.020,43** |

A diferença de 55,00 vem de **um** produto desativado que ainda tem peça em estoque. Hoje é
pequeno; cresce a cada produto desativado com saldo. O fechamento congela esse número como
"estoque final" e ele vira a abertura do mês seguinte, então a diferença se propaga.

**Correção preparada (não aplicada):** filtrar `produtos.ativo` também no `estoque-custo.ts`,
para as duas telas usarem a mesma régua. É mudança de código, sem tocar em dado — mas mexe no
número do fechamento, então precisa de autorização.

## Achado 6 — as vendas importadas do SIGE estão marcadas como "uso interno"

A base tem **53.879 vendas**: 42.358 com `uso_interno = true` e 11.521 com `false`.

As 42.328 vendas importadas do SIGE (`numero >= 100000`, R$ 3.855.282,60, até 14/09/2026)
foram gravadas com **`uso_interno = true`**. É por isso que nenhum relatório do mês as mostra:
todo relatório filtra `uso_interno = false`.

**O que isso resolve:** as vendas antigas não contaminam faturamento, metas e comissão.

**O que isso cria:** o campo "uso interno" deixou de significar consumo interno e virou
"venda histórica importada". Quem olhar um relatório de uso interno vai encontrar 42 mil
linhas de venda de 2025 e 2026. Também explica por que o filtro `numero < 100000` existe em
alguns lugares e não em outros: ele é redundante agora, mas só porque ninguém marcou as
importadas como `false` depois.

**Correção preparada (não aplicada):** nenhuma no código. Se quiser limpar a leitura, o
caminho é marcar as importadas com uma coluna própria (`origem = 'sige'`) em vez de usar
`uso_interno`. Isso é migration e mexe em 42 mil linhas — só com autorização.

## Achado 7 — uma venda com data de 1899

Existe **1 venda** com `data = 1899-12-30`, sobra da importação. Valor 263,50. Não entra em
relatório de 2026, mas aparece em qualquer consulta por período aberto e pode confundir
ordenação. **Correção preparada:** apagar ou corrigir a data dessa única linha — é dado, só
com autorização.

## Achado 9 — "CMV" na tela (CORRIGIDO no arquivo)

**Onde:** `app/painel/fechamento-mes/page.tsx` (cabeçalho da folha de resumo), `app/painel/relatorios/page.tsx` (DRE e gráfico) e `app/painel/trocas/TrocasClient.tsx` (confirmação do ajuste de custo).

**O que aparecia:** "Estoque consumido (CMV)", "Custo dos produtos (CMV)", "Custo (CMV)" e, no diálogo de trocas, "não reavalia estoque nem CMV".

**Por que importa:** CMV é sigla de contador — a regra do projeto é que qualquer pessoa entenda a tela de primeira. O dono já pediu várias vezes para tirar termo de contador.

**Correção aplicada no arquivo:** virou "Custo das peças vendidas", "Custo das peças" e, no diálogo de trocas, "custo das próximas vendas" e "não mexe em estoque nem no custo". O texto de ajuda do DRE também deixou de citar a sigla.

**Estado:** type-check limpo e 78 testes passando, **não commitado**.

## Achado 10 — a tela Trocas não tem permissão de rota (esperando autorização)

**Onde:** `lib/permissoes.ts` (tabela `ROTAS_PERMISSAO`) e `app/painel/trocas/page.tsx`.

O menu esconde "Trocas" de quem não tem a permissão `estoque`, e todas as ações da tela
exigem `estoque`. Mas **a rota não está na tabela de permissões**: o guarda do layout só
bloqueia rota mapeada (`app/painel/layout.tsx:64-67`). Quem digitar `/painel/trocas` na barra
de endereço abre a tela e vê a lista — sem poder alterar nada, porque as ações barram.

As outras telas que apareceram sem guarda são sub-rotas cobertas pelo prefixo da rota mãe
(`/painel/compras/nova` cai em `/painel/compras`, por exemplo) ou telas liberadas de propósito
(Meu Perfil).

**Correção preparada (não aplicada):** uma linha em `ROTAS_PERMISSAO` —
`'/painel/trocas': 'estoque'`. É mudança de permissão, então só com autorização.

## Achado 11 — o DRE soma conta a pagar cancelada (esperando autorização)

**Onde:** `app/painel/relatorios/page.tsx:409-411`.

A consulta de despesas do DRE filtra `tipo = 'pagar'` e a data de vencimento, **sem filtrar
status**. Pendente e pago entram (correto para competência), mas **cancelado também entraria**.

Hoje o risco é zero: existe **uma única** conta a pagar cancelada na base, de valor 0,00.
Se alguém cancelar uma conta com valor, ela passa a derrubar o resultado do período.

**Correção preparada (não aplicada):** acrescentar `.neq('status', 'cancelado')` na consulta.

## Achado 12 — a tela Contas carrega 8 vezes mais pagamento do que precisa (esperando autorização)

**Onde:** `lib/saldos-contas.ts:48`.

A conta do saldo busca **todos** os pagamentos de venda com status pago — 7.905 linhas, 8
requisições de 1.000 — e depois descarta em JS tudo que é de venda anterior a 01/11
(linha 113). Sobram 184 linhas úteis.

A tabela tem `created_at`. Filtrando por `created_at >= 01/11` na consulta, o volume cai de
7.905 para **184 linhas (97,7% menos)** — e o resultado é idêntico, porque:

- nenhum pagamento aprovado está sem venda vinculada (conferido: 0 de 7.905), então o descarte
  em JS não pega nada que o filtro de data deixaria passar;
- venda anterior a 01/11 já era descartada.

**Correção preparada (não aplicada):** `.gte('created_at', INICIO_COFRE)` na consulta de
`pagamentos_venda`. É a função que calcula o saldo de todas as contas — mexe em dinheiro,
então só com autorização e teste antes.

Ganho real: 8 requisições viram 1, e a tela Contas e o Financeiro param de baixar 7.700 linhas
inúteis por abertura.

## Correções que esperam autorização (com impacto)

| # | O que | Impacto | Estado |
|---|---|---|---|
| 1 | Filtrar produto ativo em `estoque-custo.ts` | estoque final do fechamento cai 55,00 e passa a bater com o painel | **APLICADO** 10/11 |
| 2 | Origem da venda em coluna própria | relatórios de uso interno ficam legíveis | **APLICADO** 10/11 — coluna `origem`: 42.328 sige · 11.551 app |
| 3 | Corrigir a venda com data 1899 | tira 1 linha absurda da base | **APLICADO** 10/11 — vizinhas 249620 a 249640 são todas de 10/09/2026 |
| 4 | Alinhar data de comissão e bônus com o extrato | o pagamento cai no dia certo | **APLICADO** 10/11 — 6 comissões em 04/11, bônus em 05/11 |
| 5 | Dar baixa nos estornos de Igor (349,00) e Samira (4,00) | dívida com cliente sai do pendente | **APLICADO** 10/11 — Igor 06/11, Samira 03/11, conta PagBank |
| 6 | Categorizar os dois H2O sem categoria de 09/11 | deixa de contar como despesa | **APLICADO** 10/11 |
| 7 | `'/painel/trocas': 'estoque'` na tabela de permissões | a tela deixa de abrir para quem não tem a permissão | **pendente — depende do dono** |
| 8 | `.neq('status','cancelado')` no DRE | conta cancelada deixa de derrubar o resultado | **APLICADO** 10/11 |
| 9 | `.gte('created_at', INICIO_COFRE)` no saldo | tela Contas baixa 184 linhas em vez de 7.905 | **APLICADO** 10/11 — saldos recalculados: idênticos |

## Achado 8 — a regra de mercadoria não tinha teste (ADICIONADO)

A função que decide se um lançamento é **estoque** ou **despesa**
(`ehCompraDeMercadoria`) não tinha nenhum teste. É a regra que, se errar, dobra a conta do
mês — foi ela que precisou ser corrigida em 04/11, quando 34 mil de fornecedor entraram como
despesa.

Adicionados 5 testes em `test/logica.test.ts`:

| Teste | O que trava |
|---|---|
| grafias que contam como compra | Mercadoria, Fornecedor / Mercadoria, Fornecedor ZL, fonecedor, com espaço e maiúscula |
| despesa que não é compra | Salários, Comissão, Devolução ao cliente, Vale crédito usado, vazio |
| categoria única no cadastro | `categoriasDoSetor('fornecedores')` devolve só Mercadoria |
| setor da categoria | Salários → Funcionários, Mercadoria → Fornecedores, Aluguel → Estrutura |
| categoria fora do catálogo | Comissão e vazio caem em "Sem categoria" — documenta por que a comissão aparece lá |

Resultado: **78 testes passando** (eram 73), type-check limpo.
