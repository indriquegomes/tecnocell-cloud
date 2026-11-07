# Caixa Petrópolis — 03/11/2026 (dia de referência)

Arquivo de análise. Base para conferir os outros dias e caixas.

## 1. Caixas do dia

| Abriu | Fechou | Abertura | Fechamento |
|---|---|---|---|
| 08:04 | 18:42 | 200.00 | 1501.00 |
| 18:46 | 18:49 | 200.00 | 200.00 |

Fechamento principal: **1501.00** = 200 de troco na gaveta + **1301.00** no envelope.

## 2. Cadeia do dinheiro (conferida)

| Etapa | Valor |
|---|---|
| Abertura (troco) | 200,00 |
| + Vendas em dinheiro | 74,00 |
| + Fiado recebido em dinheiro | 1.302,00 |
| − Retiradas em dinheiro | −75,00 |
| **= Deveria ter** | **1.501,00** |
| App esperava (RPC) | 1.501,00 → diferença 0,00 |
| Atendente contou | 1.501,00 |

**Cadeia da gaveta: correta.**

## 3. PIX que entraram na conta do PagBank (chave 38.216.415 — João Vítor)

| Valor | Pagador | Postado no grupo |
|---|---|---|
| 1123.00 | EDMAR MEDEIROS DA SILVA | Petrópolis |
| 635.00 | MARLENE AMANCIO TEIXEIRA FERREIRA | Petrópolis |
| 124.00 | 53.853.565 ELMO TELLES MACHADO | Teresópolis (errado) |
| 85.00 | Rodrigo de Freitas Abrahao | Petrópolis |
| 80.00 | Nathalia Werneck de Andrade | Teresópolis (errado) |
| 69.00 | OZIEL DE JESUS AMARAL | Teresópolis (errado) |
| 59.00 | Jaqueline da Silva Moraes | Teresópolis (errado) |
| 9.00 | Maria Júlia de Souza Ferreira Carvalho | Petrópolis |

**Total no banco: 2184.00** — confere exatamente com a lista do dono.

## 4. O que o app creditou no PagBank nesse dia

| Origem | Valor |
|---|---|
| Vendas PIX/cartão | 3451.70 |
| Fiado recebido em PIX | 5134.43 |
| **Total que o app creditou** | **8586.13** |
| Realmente entrou no banco | 2184.00 |
| **PIX direto ao fornecedor (não passou pelo banco)** | **6402.13** |

## 5. Achados

1. Cadeia da gaveta correta (bate no centavo).
2. **3 PIX de Petrópolis postados no grupo de Teresópolis** (Jaqueline 59,00 · Oziel 69,00 · Elmo 124,00).
3. **6402.13 de PIX não passaram pelo banco** e o app não desconta — raiz do PagBank inflado.
4. **Retiradas sem destino:** 15,00 (taxa jhonatan) + 60,00 (motoboy).

## 6. Arquivos

- `caixas.json`, `movimentos-caixa.json`, `pix-conta-pagbank.json`
