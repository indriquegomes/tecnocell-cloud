# Análise profunda da noite — outubro/2026 (somente leitura)

Rodada autônoma. Nada foi lançado, alterado ou apagado no banco.
Tudo aqui foi conferido no banco, nos arquivos do fechamento e no extrato PagBank.

---

## 1. O PIX recebido — o que era erro meu e o que continua em aberto

> ⚠️ **CORRIGIDO PELO DONO (26/10).** Duas premissas minhas estavam erradas:
> 1. **O PagBank não é conta da Isa.** Isa é **ex-funcionária, sem vínculo com esta conta** — ela só
>    tem uma dívida registrada no app, paga em **parcelas de R$ 5.000** (R$ 3.500 Petrópolis + R$ 1.500 Teresópolis).
> 2. **A Cora está desativada desde setembro** e não tem influência neste fechamento.

O número R$ 183.972,11 não veio de extrato nenhum de setembro: foi **conta minha** —

```
app: PIX de venda (R$ 48.898,77) + PIX de fiado recebido (R$ 211.480,93) = R$ 260.379,70
PagBank: Pix recebido no extrato ........................................ R$  76.407,59
diferença ................................................................ R$ 183.972,11
```

A explicação que eu dei depois ("PagBank não recebe PIX de cliente, quem recebe é a Cora")
**também está errada**, porque a Cora está desligada. O que fica:

- o app registra **R$ 260.379,70** de PIX recebido;
- o único extrato que temos (PagBank) mostra **R$ 76.407,59**;
- **não sabemos em qual conta o cliente paga PIX hoje** → essa parte não se confere com o material atual.

## 2. O fluxo de dinheiro da empresa — CORRIGIDO

> O desenho abaixo era a minha leitura anterior. **A parte que cita a Cora e a "conta da Isa" está
> errada** (ver correção no item 1). O que continua provado é só o casamento entre o PIX enviado ao
> CNPJ do João Vitor e as entradas do PagBank — dinheiro saindo da conta da empresa para o CNPJ e
> aparecendo no PagBank no mesmo dia.

```
Conta da empresa (NÃO é a Cora — desativada desde setembro)
 ├─ recebe PIX dos clientes (venda e fiado)
 ├─ paga fornecedor (H2O, ADL, ZL, INOVA, PLANETA…)
 └─ transfere para o CNPJ do João Vitor ........ R$ 74.338,29 em outubro
                     ↓
PagBank (conta da loja)
 ├─ recebe essa transferência (bate dia a dia — 7 dias no centavo)
 ├─ paga salário, VT, rescisão, imposto, contabilidade, aluguel
 └─ recebe o cartão da maquininha ............... R$ 4.393,54
                     ↓
Dinheiro vivo (gaveta/caderno/envelopes)
```

**Prova do casamento dia a dia** (PagBank "Pix recebido" × PIX enviado ao CNPJ João Vitor):

| Dia | PagBank recebeu | PIX enviado ao CNPJ | Diferença |
|---|---|---|---|
| 02/10 | R$ 882,60 | R$ 882,60 | 0,00 |
| 14/10 | R$ 5.674,00 | R$ 5.674,00 | 0,00 |
| 15/10 | R$ 2.270,70 | R$ 2.270,70 | 0,00 |
| 17/10 | R$ 818,50 | R$ 818,50 | 0,00 |
| 20/10 | R$ 311,00 | R$ 311,00 | 0,00 |
| 21/10 | R$ 190,00 | R$ 190,00 | 0,00 |
| 29/10 | R$ 6.350,70 | R$ 6.350,70 | 0,00 |
| **Total do mês** | **R$ 76.407,59** | **R$ 74.338,29** | **R$ 2.069,30** |

Os R$ 2.069,30 são PIX de cliente que caíram direto no PagBank. **Conclusão: os
R$ 74.338,29 são transferência interna (dinheiro que financia a folha), não despesa nova.**
Contar essa transferência **e** a folha de R$ 42.343,17 que o app já tem = contar duas vezes.

## 3. Caixa: praticamente sem quebra

Quebra por sessão = `fechamento − abertura − (venda em dinheiro na sessão + fiado recebido em
dinheiro + reforço − retirada − devolução em dinheiro)`, nas 85 sessões de outubro:

| | |
|---|---|
| Sessões com diferença acima de R$ 10 | **0** |
| Sessões com diferença acima de R$ 50 | **0** |
| Pior sessão do mês | **R$ 10,00** (15/10 Petrópolis) |
| Quebra acumulada do mês | **−R$ 13,60** |
| Sobra somada | R$ 7,05 |
| Falta somada | −R$ 20,65 |

O controle de gaveta do app é confiável. Não há dinheiro sumindo pelo caixa.

## 4. Fiado: fecha em 1,25%

| | |
|---|---|
| Baixado **com** valor de pagamento | R$ 329.003,46 (4.071 notas) |
| Dinheiro recebido no caixa (1.953 movimentos) | R$ 289.337,86 |
| Vale-crédito usado para quitar fiado | R$ 35.553,17 (683 usos) |
| **Soma (caixa + vale)** | **R$ 324.891,03** |
| **Diferença** | **R$ 4.112,43 (1,25%)** |
| Em aberto hoje | R$ 26.520,69 (300 notas, 128 sem cliente ligado) |

**Achado novo:** **783 notas baixadas em outubro com `valor_pago = 0` · R$ 59.690,86**, sem
nenhum movimento de caixa ligado. Investigado: em **659 dessas 765 vendas o pagamento da
própria venda já está como `pago`** — são notas de fiado que nasceram e foram fechadas na
mesma venda (sobra do fluxo, não dinheiro perdido). Só **106 notas (R$ 3.794,26)** têm venda
não quitada — essa é a parte a olhar.
Efeito colateral: qualquer relatório que conte "fiado quitado" pelo status fica com R$ 59,7
mil de lixo. O certo é somar `valor_pago`, não o status.

## 5. Vale-crédito: saudável

| | |
|---|---|
| Criado em outubro | R$ 51.092,42 |
| Usado em outubro | R$ 50.371,78 (fiado R$ 35.553,17 · venda R$ 14.818,61) |
| Saldo hoje | **R$ 7.620,62** |
| Clientes com saldo negativo | **0** |
| Créditos sem cliente | 6 |

## 6. Devoluções — corrigido (o "teste" não é treino)

`teste` é o `id` do motivo **"Pediu pra testar"**, a primeira opção de `lib/motivos.ts`.

| Motivo (nome na tela) | Registros | Valor | Unidades |
|---|---|---|---|
| Pediu pra testar | 1.198 | R$ 97.166,29 | 1.418 |
| Cliente dele desistiu | 438 | R$ 31.605,15 | 508 |
| Peça errada / não serviu | 209 | R$ 16.119,18 | 276 |
| Defeito alegado | 43 | R$ 4.448,00 | 44 |
| Outro | 10 | R$ 990,00 | 14 |
| **Total** | **1.898** | **R$ 150.328,62** | 2.260 |

Devolvido = **29,7%** do vendido. Nenhuma devolução passa do total da venda; nenhuma venda tem
devolução somada acima do total. Número de gestão, não erro.

## 7. Estoque e movimento

- Movimento do mês (unidades): entradas 12.686 · saídas 2.158 · uso interno 14 · perda 1.
- **1 linha negativa** de estoque (−8 unidades).
- 9 produtos com preço de venda **menor** que o custo.
- Estoque a custo × contagem física do grupo: 1,1% (30/09) e 3,0% (23/10).

## 8. Conferências que bateram

| Conferência | Resultado |
|---|---|
| Conferência PIX do dono (1.904 comprovantes · R$ 258.996,55) | reproduzida igual |
| PIX por fornecedor × papel | ADL +R$ 62 · ZL +R$ 283 · INOVA +R$ 39 · PLANETA R$ 0 |
| Notas de entrada × itens | 56 notas, valor = itens em **todas** |
| Duplicidade de nota | **0** |
| Venda sem linha de pagamento | **0** |
| Dinheiro em mãos | Pet R$ 32.163 (dif. 1,6%) · Tere R$ 27.000 (dif. 1,6%) |

## 9. As 56 notas de entrada: são compra de verdade (não são pagamento)

Testei a hipótese de a "nota de entrada" estar só copiando o pagamento: **0 de 56 notas** têm valor
igual a um PIX de fornecedor do mesmo dia. As notas têm itens, datas próprias e valores de NF.

Mas isso deixa uma contradição de **R$ 87.276,96** em dois fornecedores:

| Fornecedor | Notas do app (out) | "Comprado" no papel | Pago por PIX |
|---|---|---|---|
| H2O | R$ 178.475,73 (15 notas) | R$ 117.740,00 | R$ 121.640,24 |
| ADL | R$ 64.971,23 (10 notas) | R$ 38.430,00 | R$ 26.919,15 |

As maiores notas de H2O, uma a uma:

| Data | Nota | Valor |
|---|---|---|
| 01/10 | 53 | R$ 17.045,00 |
| 01/10 | 57 | R$ 17.658,00 |
| 15/10 | 72 | R$ 34.573,00 |
| 15/10 | 75 | R$ 31.309,00 |
| 29/10 | 97 | R$ 27.187,00 |
| 29/10 | 98 | R$ 18.808,00 |

**Como isso mexe no resultado do mês** (estoque inicial R$ 455.129,14 · final R$ 459.594,41):

| Cenário | Mercadoria comprada | Consumida no mês | % da venda (R$ 506.509,63) |
|---|---|---|---|
| **A — vale a nota do app** | R$ 290.437,18 | **R$ 285.971,91** | **56,5%** |
| **B — vale o papel + outros fornecedores** | R$ 200.999,36 | **R$ 196.534,09** | **38,8%** |

Diferença de **R$ 89.437,82** na mercadoria consumida. **Isso muda o lucro do mês.**

**Teste que rodei nas notas** — 1.765 itens de nota de outubro, comparando o preço unitário da nota
com o cadastro do produto:

| Preço unitário da nota | Itens |
|---|---|
| Igual ao **custo** cadastrado (±5%) | **1.562** |
| Igual ao **preço de venda** (±5%) | **0** |
| Outro valor | 203 |
| Soma das notas × soma a custo cadastrado | R$ 290.437,18 × R$ 291.548,89 (0,4%) |

**As notas estão valorizadas a custo, corretamente** — não é preço de venda digitado no lugar do
custo. Isso aumenta a confiança no lado do app e joga a suspeita para o papel: a planilha
provavelmente **não contempla todas as compras do mês**.
A conferência com a NF/pedido continua valendo (2 notas) só para fechar a dúvida de vez.

Outros achados desta rodada:
- Total de notas no banco: 101 (fev R$ 29.510 · set R$ 136.267 · out R$ 290.437). Notas com número repetido: 2. Duplicidade de valor: R$ 553,00.
- **2 notas com valor R$ 0,00 e sem itens** (ADL nota 60 de 08/10 e nota 100 de 29/10) — as únicas `pendente`; todas as outras 54 (R$ 290.437,18) estão **`recebida`**.
- Fornecedores com nota e **sem PIX** no mês (pagos em espécie): Acessórios Fabio R$ 15.835,86 · Especiais SP R$ 9.997,00 · Amin Películas R$ 3.246,50 · GHR R$ 977,00 = **R$ 30.056,36** — bate com os R$ 25.700 em espécie informados (a diferença pode ser nota ainda em aberto).

### 9.1 A mercadoria da nota entrou no estoque? (trilha item a item)

| | |
|---|---|
| Itens de nota em outubro | 1.765 linhas · **7.409 unidades** |
| Movimentos de **entrada** no estoque em outubro | 937 · **12.686 unidades** |
| Produtos distintos nas notas | 657 |
| — com entrada de estoque registrada (qualquer mês) | 355 |
| — sem movimento de entrada, mas com estoque suficiente hoje | 196 (vieram do cadastro inicial) |
| — **sem entrada e sem estoque suficiente** | **106** |

Na nota 72 (a maior): 146 dos 168 itens têm movimento de entrada; 22 não têm.

**Leitura:** a trilha item a item é **parcial**, porque o pessoal também corrige estoque por
conferência (136 movimentos com observação "CORRIGIDO ATRAVES DA CONFERENCIA em N/N/N") em vez de
pela nota. Isso **não derruba** a compra: o teste agregado continua de pé —
`estoque inicial + compras − CMV = estoque final` fecha com a contagem física do grupo em 1,1% (30/09)
e 3,0% (23/10). Se houvesse R$ 88 mil de compra fantasma, o estoque estaria R$ 88 mil acima da contagem.
**Não está.** Por isso a nota do app continua sendo o lado mais confiável da história.

## 10. Cartão: bate, e a diferença é a taxa da maquininha

| | |
|---|---|
| PagBank "Vendas" (líquido, outubro) | R$ 4.393,54 |
| App, cartão (venda + fiado recebido em cartão) | R$ 5.665,78 |
| Diferença | R$ 1.272,24 |

Dia a dia os valores são quase iguais e **sempre ~1,5% menores no banco** (01/10: R$ 131,91 no banco ×
R$ 134,00 no app; 05/10: R$ 304,83 × R$ 307,00; 07/10: R$ 239,32 × R$ 242,90) — é a **taxa da
maquininha**. O app registra o valor cheio e não lança a taxa.
Parte do cartão sai pela **TON**, que não tem extrato aqui — por isso a diferença não fecha no centavo.

---


## Pendências que continuam na mão do dono

1. **H2O/ADL: as notas do app × o "comprado" do papel** — R$ 87.276,96. Conferir 2 notas grandes contra a NF do fornecedor. **É o item que mais mexe no lucro.**
2. **Natureza dos R$ 31.995,12** que sobraram da transferência ao CNPJ (não é folha lançada).
3. **Nomes dos fornecedores de dinheiro vivo** (R$ 25.700).
4. **Lançar R$ 33.811,02** de pagamento a fornecedor que o PIX mostra e o app não tem.
5. **As 106 notas** de fiado com R$ 3.794,26 baixadas sem pagamento e sem devolução.
6. **Limpar 2 notas de R$ 0,00** sem itens (ADL 60 e 100) · **1 linha de estoque negativa** · **9 produtos com preço abaixo do custo**.
7. **128 fiados sem cliente ligado** (R$ 10.092,24).
8. **Extrato da TON** (cartão) se quiser fechar o cartão no centavo.

## Fechamento

Digitar em **Fechar mês**: **Petrópolis R$ 32.163,00 · Teresópolis R$ 27.000,00**.
