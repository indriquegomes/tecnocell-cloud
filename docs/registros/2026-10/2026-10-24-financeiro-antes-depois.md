# Financeiro — números de hoje x número novo (antes/depois)

Levantamento de 24/10/2026. Só leitura: nada foi gravado, alterado ou apagado.
Período congelado pelo dono: 01/09/2026 a 24/10/2026.

## 1. A prova de que duas telas discordam

Outubro/2026, mesmo rótulo "A Receber":

| Tela | O que ela responde | Número |
|---|---|---|
| Financeiro — cartão "A Receber (pendente)" | quanto falta entrar (saldo de hoje, 599 títulos) | R$ 52.404,58 |
| Relatório — aba Financeiro "A Receber" | quanto foi combinado (valor cheio, inclui pago) | R$ 318.509,02 |

"A Pagar":

| Tela | O que ela responde | Número |
|---|---|---|
| Financeiro — cartão "A Pagar (pendente)" | quanto falta sair (saldo de hoje, 61 títulos) | R$ 226.311,16 |
| Relatório — aba Financeiro "A Pagar" | quanto foi combinado | R$ 304.478,07 |

Relatório — aba Comparativo, "despesas" de outubro: **R$ 304.478,07** (valor combinado)
comparado com receita realizada de **R$ 403.922,30**. Compara receita que entrou com
despesa que só foi combinada.

## 2. As 6 contas únicas (nenhuma tela inventa conta)

1. **FALTA ENTRAR** — valor menos o já pago, só status pendente, filtro por vencimento.
2. **FALTA SAIR** — idem, tipo pagar.
3. **JÁ ENTROU** — o já pago, filtro por data de pagamento.
4. **JÁ SAIU** — idem, tipo pagar.
5. **COMBINADO** — falta + já (total do período).
6. **DINHEIRO NA GAVETA** — abertura + recebimentos + reforços − retiradas − devoluções,
   somente forma dinheiro.

Regra de borda que resolve 1.423 lançamentos sem tocar em nenhuma linha: quando o
lançamento está com status `pago` e `valor_pago` vazio/zero, a conta usa o valor cheio
como pago. Vale só no cálculo; o campo continua vazio como está gravado.

## 3. Números por tela (setembro e outubro)

| Conta | setembro | outubro |
|---|---|---|
| FALTA ENTRAR (vencimento) | R$ 6.656,19 | R$ 44.622,65 |
| JÁ ENTROU (vencimento) | R$ 289.130,41 | R$ 273.886,37 |
| FALTA SAIR (vencimento) | R$ 28.470,55 | R$ 155.320,61 |
| JÁ SAIU (vencimento) | R$ 269.828,48 | R$ 149.170,46 |
| JÁ SAIU (data de pagamento) | R$ 269.855,41 | R$ 146.484,07 |
| JÁ ENTROU (data de pagamento) | R$ 282.942,70 | R$ 286.316,06 |
| COMBINADO receber (bruto, sem cancelado) | R$ 295.786,60 | R$ 318.509,02 |
| COMBINADO pagar (bruto, sem cancelado) | R$ 300.925,96 | R$ 304.478,07 |
| Vendas concluídas | R$ 337.116,39 | R$ 403.922,30 |

## 4. Tela por tela

| Tela | Conta usada hoje | Muda? |
|---|---|---|
| Financeiro — cartão A Receber | FALTA ENTRAR | não muda o número |
| Financeiro — cartão A Pagar | FALTA SAIR | não muda o número |
| Financeiro — barra "Total no filtro (pago + pendente)" | valor cheio do filtro | só o nome vira COMBINADO |
| Financeiro — lista e busca avançada | lista linhas | não muda |
| Painel inicial — cartões A Receber / A Pagar | FALTA ENTRAR / SAIR | não muda |
| Fiados — total e vencido | FALTA ENTRAR | não muda |
| Relatório — aba Financeiro, A Receber | COMBINADO (rótulo dizia "A Receber") | vira FALTA ENTRAR + JÁ ENTROU |
| Relatório — aba Financeiro, A Pagar | COMBINADO | vira FALTA SAIR + JÁ SAIU |
| Relatório — aba Comparativo, despesas | COMBINADO pagar | vira JÁ SAIU (mês fechado) |
| Relatório — aba DRE, despesas | soma tudo sem filtro de status | vira JÁ SAIU por competência |
| Relatório — aba Inadimplência | FALTA ENTRAR | não muda |
| Relatório — aba Caixa / Fluxo | contagem do caixa | passa a usar DINHEIRO NA GAVETA |
| Caixa (PDV operação) — "vendido" | fechamento − abertura | muda (ver item 5) |
| Fechamento de mês | data de pagamento | já está certo, só rótulo |
| Contas, cliente, chat IA | FALTA ENTRAR | não muda |

Resultado: 4 números mudam de valor (A Receber do relatório, A Pagar do relatório,
despesas do comparativo/DRE e "vendido" do caixa). Os outros não mudam.

## 5. Caixa — o caso separado

| Mês | "Vendido" hoje (fechamento − abertura) | Correto (movimentos de dinheiro) | Diferença |
|---|---|---|---|
| outubro | R$ 64.976,00 | R$ 54.239,60 | R$ 10.736,40 |
| setembro | R$ 54.589,95 | R$ 47.946,61 | R$ 6.643,34 |

Consertar a conta do "vendido" **não** conserta a diferença: ela é dinheiro contado na
gaveta que não tem recebimento registrado. Consertar só impede que a diferença fique
escondida dentro do "vendido". A origem da diferença continua uma investigação aberta
(85 caixas, todas TecnoCell, nenhuma legada).

## 6. Decisão pendente do dono

O relatório de setembro mostra hoje R$ 295.786,60 como "A Receber". Com a conta nova
passa a mostrar FALTA ENTRAR R$ 6.656,19 + JÁ ENTROU R$ 289.130,41. O dado não muda;
muda a pergunta que a tela responde. Escolha:

- **A**: aplicar a conta nova em setembro também (o número exibido de setembro muda).
- **B**: manter setembro exatamente como está hoje e aplicar a conta nova só de outubro
  em diante.
