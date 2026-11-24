# Futuras opções (não é pendência — é menu para decidir)

> Coisas que já foram pensadas, com o custo e o efeito medido, **esperando decisão do
> dono**. Nada aqui está em andamento. Pendência de verdade mora em
> `docs/passagem-de-turno.md`; isto aqui é fila de ideias já estudadas.

## 1. Regra do “teste” (comodato de peça) — decisão de dono, sem código

**O que é:** definir por escrito como a peça sai para teste — quem autoriza, qual prazo,
como é registrado e o que acontece se não voltar.

**Por que:** em novembro foram **755 cancelamentos de fiado (R$ 60.927,67)**, e **70% com
motivo “teste” (R$ 42.750,87)**. Está espalhado em todos os atendentes (Isabella 11.673 ·
Letícia 11.204 · Rodrigo 10.941 · Maria Eduarda 8.789 · Vitória 8.737 · Mariana 7.486 ·
Maria Julia 1.452) — é costume da loja, não erro de alguém. Hoje o teste vira **venda +
devolução** e infla os dois números todo mês.

**Esforço:** zero de código (texto + combinado com a equipe).
**Falta:** decisão do dono.

## 2. “Saída para teste” no estoque — não fatura

**O que é:** um tipo de saída que tira a peça do estoque **sem** virar venda, fiado,
devolução ou despesa: só controla que a peça está fora, com quem e até quando.

**Por que:** é a consequência técnica do item 1. Faz os R$ 42 mil/mês pararem de aparecer
como venda e devolução — o número de venda passa a ser venda de verdade.

**Esforço:** médio (operacao nova no estoque + tela + prazo/vencimento + alerta de peça
fora do prazo).
**Falta:** decisão do item 1 primeiro (a regra vem antes da ferramenta).

## 3. “Quebra de caixa” separada de “Perda”

**O que é:** subcategoria própria (ou categoria) para falta/sobra de dinheiro na gaveta.

**Por que:** hoje as duas caem em `Perda`. Em novembro: R$ 183,04 de **peça quebrada** e
R$ 105,80 de **falta na gaveta** somados no mesmo balde — não dá para ver “perdi
mercadoria” e “perdi dinheiro” separado.

**Esforço:** pequeno (uma entrada no catálogo `lib/financeiro-setores.ts`; a tela já
separa por categoria).

## 4. Conferente: baixa de estoque × despesa de perda

**O que é:** cruzamento mensal “peças baixadas como perda” × “despesas Perda do mês”. Hoje
casa (4 peças, custo R$ 183,05 × R$ 183,04 lançado); o conferente serve para pegar o dia em
que a baixa for feita sem a despesa (ou o contrário).

**Esforço:** pequeno (script só leitura, no padrão dos outros conferentes).

## 5. Lista de devoluções dentro do DRE

**O que é:** clicar em “(−) Devoluções” e abrir a relação das devoluções do período
(cliente, peça, valor, como voltou), exportável.

**Por que:** o dono pediu para não confiar em número solto. Hoje a tela já mostra a quebra
por motivo (fiado cancelado, vale-crédito, dinheiro/PIX, sem reembolso); a lista peça por
peça é o passo seguinte.

**Esforço:** pequeno/médio (consulta + tabela; a exportação já existe em outras abas).

## 6. Recebimentos antigos sem vínculo (backfill)

**O que é:** ligar cada recebimento de fiado antigo ao seu lançamento (`lancamento_id`).
Hoje: **34 dos 43** movimentos de 23/11 e 83 de 97 em 20–21/11 sem vínculo. Sem isso o
“Desfazer” do Financeiro não acha a linha (a regra nova já grava o vínculo, mas o passado
ficou solto).

**Esforço:** médio (script de casamento por motivo + valor + dia, com revisão caso a caso).
**Risco:** médio — precisa conferir antes de gravar.

## 7. Cartão “quanto sobrou para mim este mês”

**O que é:** um número grande no topo do DRE (ou no painel) respondendo só isso, com o
detalhe embaixo para quem quiser conferir.

**Por que:** o dono pediu simplicidade — o DRE hoje responde “por quê”, mas não responde
“quanto ficou para mim” em uma linha.

**Esforço:** pequeno.

## 8. Estorno de custo persistido por item (só se precisar)

**O que é:** gravar o estorno de custo de cada peça devolvida numa tabela, em vez de
calcular na hora (hoje: view `v_estorno_custo_devolucao`, aplicada em 23/11).

**Por que não fazer agora:** a fonte (`itens_devolucao` + `itens_venda.custo_unitario`) é
imutável — a view já dá o mesmo número sem segunda verdade para dessincronizar. Só vale se
aparecer a necessidade de histórico de “como o custo era na época”.

## Ordem sugerida

| # | Item | Quem decide | Quando |
|---|---|---|---|
| 1 | Regra do teste | dono + equipe | primeiro — é processo, custo zero |
| 2 | Saída para teste | dono (depende do 1) | depois do 1 |
| 3 | Quebra de caixa separada | dono | qualquer hora, barato |
| 4 | Conferente de perda | dono | no próximo fechamento |
| 5 | Lista no DRE | dono | quando quiser conferir peça por peça |
| 6 | Backfill de vínculo | dono | antes de usar “Desfazer” em recebimento antigo |
| 7 | Cartão “sobrou pra mim” | dono | junto com o 3 (uma passada de UI) |
| 8 | Custo persistido | só se precisar | — |
