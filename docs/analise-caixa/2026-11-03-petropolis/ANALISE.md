# Análise completa — Petrópolis 03/11/2026

Dia de referência. Todos os números vieram do banco (leitura), nada foi alterado.

## 1. Vendas do dia

**195 vendas · R$ 19.996,31** · canceladas 0 · sem caixa 0 · uso interno 0

| Forma | Vendas | Valor | % |
|---|---|---|---|
| Crédito Loja (Fiado) | 161 | 16.313,93 | 81% |
| PIX | 28 | 2.961,80 | 15% |
| Débito PagBank | 3 | 360,90 | 2% |
| Vale Crédito | 5 | 139,40 | 1% |
| Crédito PagBank | 1 | 129,00 | 1% |
| Dinheiro | 1 | 74,00 | 0,4% |

## 2. Cadeia do dinheiro (gaveta) — CORRETA

| Etapa | Valor |
|---|---|
| Abertura (troco) | 200,00 |
| + Vendas em dinheiro | 74,00 |
| + Fiado recebido em dinheiro | 1.302,00 |
| − Retiradas em dinheiro | −75,00 |
| **= Deveria ter** | **1.501,00** |
| App esperava (RPC) | 1.501,00 (diferença 0,00) |
| Atendente contou | 1.501,00 |

Envelope: 1.301,00 · troco na gaveta: 200,00.

## 3. PIX — o problema grande

| Origem | Valor |
|---|---|
| Vendas PIX | 2.961,80 |
| Fiado recebido em PIX | 5.134,43 |
| **Total que o app creditou no banco** | **8.096,23** |
| **Realmente entrou no PagBank** | **2.184,00** |
| **PIX que foi direto ao fornecedor** | **5.912,23** |

Os 8 PIX que entraram na conta (chave 38.216.415, João Vítor): 1.123 Edmar · 635 Marlene · 124 Elmo · 85 Rodrigo · 80 Nathalia · 69 Oziel · 59 Jaqueline · 9 Maria Júlia = **2.184,00** — confere com a lista do dono.

**Erro 1:** 3 desses comprovantes (Jaqueline 59, Oziel 69, Elmo 124) foram postados no grupo de **Teresópolis**, não no de Petrópolis.

**Erro 2:** os 5.912,23 de PIX pagos direto ao fornecedor não descontam de conta nenhuma — o banco fica inflado.

## 4. Devoluções — 24 no dia, R$ 2.663,28

| Tipo de crédito | Devoluções | Valor |
|---|---|---|
| Cancelamento de fiado | 16 | 2.050,28 |
| Sem reembolso | 2 | 412,00 |
| Crédito na conta | 6 | 201,00 |

**Erro 3:** **24 de 24 sem motivo escrito** (só o motivo fechado preenchido). O texto livre ficou vazio em todas.

## 5. Créditos de cliente no dia

| Tipo | Movimentos | Valor |
|---|---|---|
| Crédito criado | 6 | 178,00 |
| Uso de crédito | 7 | 221,40 |
| Estorno | 1 | 4,00 |

## 6. Dinheiro que saiu sem destino — R$ 683,10

Seis retiradas sem lançamento: 15,00 (taxa jhonatan) · 60,00 (motoboy) · 0,10 (conexao) · 350,00 (venda fabiano) · 62,00 (venda wm) · 196,00 (pagou no cartão e quitaram no PIX).

**Já corrigido:** o app agora recusa fechar o caixa com esse tipo de saída (commit `6267e2b`).

## 7. Fiado no dia

Gerado: **19.385,03** (194 lançamentos) · Recebido: **9.988,91** (110 lançamentos).

## 8. Estoque

Saídas 35 (59 un) · Entradas 33 (60 un) · Trocas 2 (2 un) · **estoque negativo: 0** ✓

## Resumo dos erros encontrados neste dia

| # | Erro | Impacto | Status |
|---|---|---|---|
| 1 | Comprovante postado no grupo errado (3 PIX) | atribuição errada de loja | a corrigir |
| 2 | PIX pago direto ao fornecedor não desconta do banco | PagBank inflado em 5.912,23 só neste dia | a corrigir |
| 3 | Devolução sem motivo escrito (24 de 24) | perde o "por quê" | a corrigir |
| 4 | Retirada de dinheiro sem destino (683,10) | dinheiro sem rastro | **corrigido** |
