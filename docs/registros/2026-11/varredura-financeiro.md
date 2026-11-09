# Varredura do Financeiro — novembro/2026

Registro do que foi apurado no período 01 a 09/11/2026, para conferência item por item
e para futuras análises. Somente leitura e levantamento; nenhuma conclusão deste
documento autoriza mudança.

Fonte de todos os números: banco de produção (Supabase), lido em 08 e 09/11/2026.
Contas: Petrópolis `e41aa9ea-820d-44d2-a04a-2e4efc8b0946`,
Teresópolis `81791d01-dc4a-485c-bbb8-f2b4cda6731c`.

## 1. Dinheiro em espécie (01 a 07/11)

Script oficial `scripts/conferencia-caixa.mjs` (fórmula do Fechamento de Caixa).

| Loja | Caixas | Entrou (sem troco) | Contado | Diferença |
|---|---|---|---|---|
| Petrópolis | 9 | 9.271,70 | 11.068,00 | falta 3,70 |
| Teresópolis | 9 | 9.854,10 | 11.659,10 | sobra 5,00 |
| Total | 18 | 19.125,80 | 22.727,10 | sobra 1,30 |

Diferenças localizadas, ainda sem explicação:

| Loja | Caixa | Deveria ter | Contado | Diferença |
|---|---|---|---|---|
| Petrópolis | 06/11 08:02 | 1.426,70 | 1.423,00 | falta 3,70 |
| Teresópolis | 03/11 08:01 | 1.727,10 | 1.732,10 | sobra 5,00 |

Os outros 16 caixas batem centavo a centavo.

## 2. Contas a pagar

| Loja | Pagas (01–09/11) | Pendentes | Pendente vencido |
|---|---|---|---|
| Petrópolis | 36 · 26.097,25 | 48 · 75.969,22 | 272,52 |
| Teresópolis | 53 · 26.053,73 | 29 · 50.932,58 | 4.212,48 |
| Total | 89 · 52.150,98 | 77 · 126.901,80 | 4.485,00 |

O "vencido" de 4.485,00 mistura naturezas diferentes:

| Valor | Quem | Natureza |
|---|---|---|
| 4.014,48 | ADL | trocas pendentes (peças enviadas, não devolvidas) |
| 349,00 | Igor Kreischer | estorno de crédito ao cliente (venda #11282) |
| 192,00 | WF Cell | "desconto WF Cell", categoria Vendas |
| 175,00 | Evanir de Souza | motoboy, vencido em 01/10 |
| 78,90 | H2O | ajuste de conferência |
| 6,00 | sem nome | "DESPESA" solta |
| 4,00 | Samira Amorim dos Reis | estorno de crédito ao cliente (venda #11072) |
| −293,60 | ZL Cell | crédito a favor da loja |
| −37,82 | H2O | abatimento a favor |
| −2,96 | Planeta Cell | crédito a favor |

## 3. Pagamentos sem conta — o banco infla

Lançamento a pagar pago com `conta_id` nulo não desconta de conta nenhuma. A única
exceção no código é reembolso de devolução (lançamento "Devolução — …").

Total em novembro (sem vales, sem devoluções): **25.214,52**

| Loja | Categoria | Lançamentos | Valor |
|---|---|---|---|
| Petrópolis | Fornecedor / Mercadoria | 3 | 10.547,90 |
| Petrópolis | Salários | 5 | 3.560,62 |
| Teresópolis | Fornecedor / Mercadoria | 2 | 7.783,00 |
| Teresópolis | Salários | 3 | 2.163,00 |
| Teresópolis | Vendas | 1 | 1.160,00 |

## 4. Salários — semana de 07/11

Oito pessoas, todas pagas, total 5.723,62:

| Pessoa | Valor |
|---|---|
| Erick Alves de Mattos | 950,00 |
| Lucas da Silva Mello | 798,00 |
| Giovane Rego da Silva | 765,00 |
| Nikollas Bernardo Leocadio | 720,00 |
| Brunna Furtado Gonçalves | 656,00 |
| Maria Eduarda Kappler da Silva | 623,08 |
| Mariana Vila Real Castelli | 611,54 |
| Isaac Bento Morelli | 600,00 |

A duplicata da semana de 07/11 (duas linhas de 611,54 para Mariana Vila Real
Castelli) foi apagada em 09/11 — ficou uma linha só, com forma PIX. Backup em
`docs/registros-banco/backup-salarios-lembretes-2026-11-09T01-21-14-890Z.json`.

Estornos de crédito: 2 pagos sem forma (150,00, antes de novembro) e 2 pendentes
(353,00 — Igor Kreischer 349,00 e Samira Amorim dos Reis 4,00).

## 5. PIX

| Referência | Valor |
|---|---|
| PIX que entrou no PagBank em 06/11 (registro do app) | 9.638,22 |
| Comprovantes do Telegram no mesmo dia | 9.641,22 |
| Diferença no grupo de Teresópolis | 3,00 (um comprovante sem recebimento) |

Decomposição de 06/11: Petrópolis 4.892,62 (vendas 1.583,10 + fiado 3.309,52) e
Teresópolis 4.745,60 (vendas 978,00 + fiado 3.767,60).

## 6. Retiradas de caixa sem lançamento (01–07/11)

14 retiradas, 1.005,70, todas com motivo escrito e nenhuma ligada a lançamento.

| Loja | Qtd | Valor | Motivos registrados |
|---|---|---|---|
| Petrópolis | 9 | 746,10 | taxa jhonatan, felipe motoboy, conexao, venda fabiano, venda wm, pagou no cartão e quitaram no pix, ACERTO CX (2), rodrigo pereira |
| Teresópolis | 5 | 259,60 | TOP CEL quitado como dinheiro, PIX de 26,00 não localizado, quitei o cliente errado, quitado errado, falta de 76,00 em caixa físico |

O fechamento aceita essas retiradas (ele desconta da gaveta); o buraco é no
Financeiro, que não tem a despesa correspondente.

## 7. Saldos das contas (08/11)

| Conta | Saldo |
|---|---|
| PagBank | 30.635,25 |
| Cofre PagBank | 9.813,00 |
| Cofre Petrópolis | 29.213,00 |
| Cofre Teresópolis | 15.866,50 |
| Caixa Petrópolis | 5.270,20 |
| Caixa Teresópolis | 7.887,80 |
| TON Teresópolis | 63,00 |
| Total | 98.748,75 |

## 8. Mudanças de código feitas e ainda NÃO publicadas

Nada foi commitado nem enviado ao site. Está no repositório local.

| Tema | Arquivo |
|---|---|
| Lembrete de pagamento é do master, fica pendente até marcar, sem ✕ | `lib/lembretes.ts`, `app/painel/layout.tsx`, `components/BarraAvisos.tsx` |
| Valor digitado na hora quando o lembrete não tem valor fixo | `components/BarraAvisos.tsx`, `app/painel/lembretes/actions.ts` |
| Salário não duplica: reaproveita o lançamento da mesma semana | `app/painel/lembretes/actions.ts` |
| Devolução: PIX liberado para venda em dinheiro de outro dia | `app/painel/devolucoes/actions.ts`, `DevolucoesClient.tsx` |
| Estorno pago em PIX passa a descontar do banco | `lib/conta-da-forma.ts` (novo), `app/painel/vales-credito/actions.ts` |

Testes: 73 de 73 em `test/logica.test.ts` (6 novos sobre o lembrete de pagamento).
Type-check sem erro.

## 9. Correções já aplicadas no banco

| Item | O que foi feito |
|---|---|
| Conta TON Teresópolis | ativada |
| Rotas de PIX/TON em Petrópolis | removidas (a rota do PIX mandava o PIX para conta inativa) |
| Forma "Outros" | desativada e reativada a pedido do dono; segue sem conta de destino |
| Semana 07/11 dos salários | lançada por pessoa, forma PIX, data corrigida para 07/11 |
| Lembretes de Giovane Rego da Silva e Lucas da Silva Mello | sem valor fixo (o valor varia por semana) |

## 10. Contagem física informada pelo dono (09/11/2026)

Valores ditos por ele, para conferência posterior. Ainda não analisados.

| Item | Valor |
|---|---|
| Dinheiro físico no cofre — Teresópolis | 2.553,00 |
| Dinheiro físico no cofre — Petrópolis | 1.168,00 |
| Saldo do PagBank | 59,23 |

Observação dele: já foram retirados valores para vários pagamentos.

### Estrutura combinada da conferência (só mês 11)

1. **Saídas** — o que foi pago
2. **Entradas** — o que entrou
3. **Resultado** — se o que foi pago e o que entrou fecha a conta

## 11. Pontos em aberto

1. Explicar as diferenças de caixa de 3,70 (Petrópolis 06/11) e 5,00 (Teresópolis 03/11).
2. Decidir o que fazer com os 25.214,52 de pagamentos sem conta.
3. Estornos pendentes de 353,00: cliente já recebeu ou não.
4. Comprovante de 3,00 no grupo de Teresópolis sem recebimento.
5. Calibrar o PagBank contra o extrato real.
