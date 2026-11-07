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

**Revisto em 06/11 — o "erro 1" não existia.** Os comprovantes do grupo de Teresópolis conferem com
recebimentos de fiado de Teresópolis, não com vendas de Petrópolis:

| Comprovante (grupo Tere) | Registro no app | Bate? |
|---|---|---|
| 69,00 Nathalia Werneck (cliente "Felipa cell") | Fiado recebido — FELIPE CELL CAMELO, 69,00 | sim |
| 69,00 Oziel de Jesus Amaral ("oziel monte") | Fiado recebido — OZIEL MONTE, 69,00 | sim |
| 124,00 Elmo Telles Machado | Fiado recebido — ELMO TELLES MACHADO AMMCELL, 124,00 | sim |
| 59,00 Jaqueline da Silva Moraes | Fiado recebido — JAQUELINE DA SILVA MORAES, **55,00** (mesmo minuto, 15:12) | **diferença de 4,00** |

Só o comprovante da Jaqueline tem divergência, e ela é de Teresópolis: o comprovante é de 59,00 e o
recebimento foi registrado como 55,00 (nota A Receber — Fiado #10709, valor 55,00). Não é atribuição
de loja errada; é 4,00 a mais no comprovante do que no lançamento. Fora do dia-base de Petrópolis.

**Erro 2:** os 5.912,23 de PIX pagos direto ao fornecedor não descontam de conta nenhuma — o banco fica inflado.

## 4. Devoluções — 24 no dia, R$ 2.663,28

| Tipo de crédito | Devoluções | Valor |
|---|---|---|
| Cancelamento de fiado | 16 | 2.050,28 |
| Sem reembolso | 2 | 412,00 |
| Crédito na conta | 6 | 201,00 |

**Revisto em 06/11 — o "erro 3" também não procede.** A tela de devolução exige escolher um motivo
fechado e o campo de texto é **"Detalhe (opcional)"** — só é obrigatório quando o motivo é "Outro".
No dia, os 24 registros têm motivo escolhido e **nenhum** é "Outro":

| Motivo fechado | Devoluções | Valor |
|---|---|---|
| Pediu pra testar | 16 | 2.144,78 |
| Cliente dele desistiu do serviço | 7 | 503,50 |
| Peça errada / não serviu | 1 | 15,00 |
| Outro (exigiria texto) | 0 | — |

Nenhuma devolução ficou sem explicação de categoria. O texto livre vazio é o comportamento previsto
da tela, não falha de operação.

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
| 1 | ~~Comprovante postado no grupo errado (3 PIX)~~ | **não era erro** — os 3 são fiado de Teresópolis; sobra 1 comprovante de 59,00 contra 55,00 registrado (Teresópolis) | conferido em 06/11 |
| 2 | PIX pago direto ao fornecedor não desconta do banco | PagBank inflado em 5.912,23 só neste dia | a corrigir |
| 3 | ~~Devolução sem motivo escrito (24 de 24)~~ | **não era erro** — 24 de 24 com motivo fechado, nenhum "Outro"; o texto é opcional por regra da tela | conferido em 06/11 |
| 4 | Retirada de dinheiro sem destino (683,10) | dinheiro sem rastro | **corrigido** |
