# Peça 2 — Imobilizado / controle diário de estoque (export do WhatsApp)

- Origem: `Downloads\WhatsApp Chat - Estoque Imobilizado - Controle Diário 📦📈.zip`
- Extraído em: `entrada/whatsapp-estoque/`
- Conteúdo: `_chat.txt` (794 linhas, 13/06/2023 → 23/10/2026) + 3 fotos + 1 figurinha.
- Grupo: "Estoque Imobilizado - Controle Diário", participantes `Isa - Escritorio PT` e `Estoque Geral`.

## O que tem lá

1. **IMOBILIZADO GERAL por filial, por categoria** — o estoque a custo conferido (quase semanal). Datas: 30/07, 31/07, 04/08, 05/08, 11/08, 12/08, 14/08, 18/08, 19/08, 21/08, 24/08, 25/08, **30/08 (finalização)**, 08/09, 10/09, 15/09, 24/09, 29/09, **30/09**, **08/10, 09/10, 14/10, 21/10, 23/10**.
2. **Trocas** (31/07): entraram Pet R$ 17.074,76 · Tere R$ 525,00. Pendentes em SP: Tere ADL 2.469,26 · ZL 490,00 · H²O 1.751,92; Pet ADL 2.901,48 · PC 360,00 · ZL 543,33 · H²O 3.072,03.
3. **Perdas** (31/07): Pet 1.676,28 · Tere 1.697,06 = 3.373,34 — "peças que vieram a mais do fornecedor, somando R$ 4.366,72" (fotos anexas).
4. Um pedido de ajuda (10/09) sobre como filtrar o imobilizado no TecnoCell.

Nada disso tem outubro de trocas/perdas — as listas de troca/perda do grupo param em 31/07.

## Imobilizado de OUTUBRO (o que interessa)

| Data | Petrópolis | Teresópolis | Total |
|---|---|---|---|
| 30/09 (fechamento do mês) | R$ 271.113,04 | R$ 185.000,40 | **R$ 456.113,44** |
| 08/10 | R$ 264.553,36 | R$ 181.267,49 | R$ 445.820,85 |
| 09/10 | R$ 258.348,02 | R$ 171.200,67 | R$ 429.548,69 |
| 14/10 | R$ 243.197,30 | R$ 160.971,84 | R$ 404.169,14 |
| 21/10 | R$ 277.119,76 | R$ 189.588,84 | R$ 466.708,60 |
| **23/10 (última)** | **R$ 268.540,09** | **R$ 182.297,11** | **R$ 450.837,20** |

## Cruzamento com o app (estoque a custo por categoria)

App agora (01/11), custo total: **Petrópolis R$ 273.167,10 · Teresópolis R$ 186.427,31** = R$ 459.594,41.

| Categoria | Pet 23/10 (papel) | Pet app | Dif | Tere 23/10 (papel) | Tere app | Dif |
|---|---|---|---|---|---|---|
| FRONTAL | 104.507,28 | 109.676,98 | **+5.169,70** | 70.275,97 | 74.487,81 | **+4.211,84** |
| COMPONENTE | 58.488,07 | 57.970,89 | −517,18 | 34.361,60 | 33.771,63 | −589,97 |
| ACESSÓRIOS | 48.993,97 | 46.929,25 | **−2.064,72** | 35.232,60 | 32.745,25 | **−2.487,35** |
| BATERIA | 21.891,56 | 23.785,88 | +1.894,32 | 18.003,06 | 21.533,53 | **+3.530,47** |
| PARTE TRASEIRA | 20.040,33 | 20.009,73 | −30,60 | 12.739,81 | 12.957,70 | +217,89 |
| FERRAMENTA | 10.384,51 | 10.224,80 | −159,71 | 6.931,24 | 6.213,53 | −717,71 |
| PELICULA | 1.648,70 | 1.861,68 | +212,98 | 1.596,33 | 1.579,56 | −16,77 |
| TOUCH | 1.300,63 | 1.311,85 | +11,22 | 1.603,32 | 1.603,32 | 0 |
| CAPA CASE | 322,94 | 318,94 | −4,00 | 392,59 | 374,39 | −18,20 |
| COMPONENTE\|VIDEOGAME | 486,75 | 486,75 | 0 | 820,37 | 820,37 | 0 |
| VIDEOGAME\|PARTE TRASEIRA | 206,83 | 206,83 | 0 | — | — | — |
| LCD | 193,50 | 193,50 | 0 | 85,00 | 85,00 | 0 |
| VIDEOGAME\|COMPONENTE | 46,08 | 46,08 | 0 | 180,48 | 180,48 | 0 |
| BATERIA\|VIDEOGAME | 28,94 | 28,94 | 0 | 28,94 | 28,94 | 0 |
| ALTO-FALANTES INT. | — | — | — | 45,80 | 45,80 | 0 |
| SEM CATEGORIA / (sem categoria) | — | 115,00 | +115,00 | — | — | — |
| **TOTAL** | **268.540,09** | **273.167,10** | **+4.627,01 (1,7%)** | **182.297,11** | **186.427,31** | **+4.130,20 (2,3%)** |

### Leitura

- Diferença total de **~2%** nas duas lojas — o estoque a custo do app é **usável**. Não é o monstro de "R$ 101 mil inflado" do levantamento antigo.
- O desvio tem **padrão**: app **mais alto em FRONTAL e BATERIA**, **mais baixo em ACESSÓRIOS**, nas duas lojas. Parece classificação de categoria diferente, não preço de custo errado.
- O app está 8 dias depois da última contagem do papel, então parte da diferença é movimento real do fim do mês (compras de 26–29/10).

## Estoque inicial de outubro — resolvido

O imobilizado de **30/09** já é o "estoque inicial de outubro" que faltava pra calcular o consumido do mês, **sem precisar fechar setembro**:

```
Estoque inicial (30/09) ....... R$ 456.113,44
+ mercadoria lançada (out) .... R$ 290.437,18
− estoque final (app, 01/11) .. R$ 459.594,41
= consumido de mercadoria ..... R$ 286.956,21
```

Referência: vendas do mês R$ 501.823,87 → mercadoria representa **57,2%** da venda.
