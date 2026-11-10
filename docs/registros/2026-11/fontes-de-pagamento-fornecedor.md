# Fonte de pagamento a fornecedor: o que cada uma cobre

> Levantado em 09/11/2026, depois de conferir o Telegram e o extrato. Serve para
> não repetir a procura na fonte errada.

## 1. Telegram (`comprovantes_pix`) — tem fornecedor, sim

O campo **`destinatario`** diz para quem o PIX foi. Quando o destinatário **não** é a
loja (STOR ONE / João Vítor / CNPJ 38.216.415), aquele comprovante é **dinheiro saindo
para fornecedor ou para funcionário**.

O `pagador` costuma ser o cliente: a loja usa o que o cliente pagou para quitar o
fornecedor, e o comprovante vai para o grupo.

Totais por destinatário (base inteira, 10/09 a 09/11/2026):

| Destinatário | Comprovantes | Valor |
|---|---|---|
| ARMACAO LONGITUDE COMERCIO LTDA (é a ADL) | 407 + 32 | 57.434,81 + 4.005,00 |
| FERNANDES DA SILVA REPRESENTACAO COMERCIAL SJC | 87 + 3 + 6 + 3 | 17.571,20 + 1.794,80 + 551,00 + 468,00 |
| ISABELA PONCIANO CAMARA (CNPJ 54.870.178) | 92 + 17 + 12 + 10 | 16.510,58 + 2.519,40 + 2.706,79 + 3.689,00 |
| ATRATIVA ACESSORIOS PARA CELULARES | 65 | 14.595,40 |
| IG FRANCA COMERCIO E SERVICO LTDA | 93 + 5 | 11.535,62 + 786,00 |
| PLAY CELL CELULARES | 34 + 2 | 4.328,90 + 552,00 |
| PLANORH PLANEJAMENTO | 2 + 1 | 3.650,00 + 900,00 |
| Funcionários (Lucas da Silva Mello, Giovane Rego da Silva, Maria Eduarda Kappler da Silva…) | poucos | salários pagos direto |

### Novembro é diferente

Em 01 a 09/11 o Telegram tem **só 8 comprovantes** com fornecedor no destinatário:

| Dia | Destinatário | Valor |
|---|---|---|
| 09/11 | ARMACAO LONGITUDE (ADL) — 7 PIX | 523,40 |
| 06/11 | nome mascarado da loja | 47,00 |

Os 7 PIX da ADL somam exatamente o pagamento de 523,40 lançado no app em 09/11 —
confere centavo a centavo.

**Nenhum** comprovante de H2O em novembro. Os pagamentos de H2O (5.887,20 · 668,00 ·
928,50 · 3.916,50) não passaram pelo grupo.

## 2. Extrato do banco (CSV em `Downloads`)

Arquivo `01-11-2026_09-11-2026.csv`: 136 linhas, mas as datas vão de **02/11 a 07/11**.
Não tem 08/11 nem 09/11.

O extrato é de uma conta que **paga salário e recebe PIX de cliente** (tem os 8 salários
de 07/11, CDB, Enel, advogado). Os pagamentos a fornecedor **não saem dessa conta**.

## 3. Conclusão para a conferência

| Fonte | Serve para fornecedor? |
|---|---|
| App (`lancamentos` categoria Mercadoria) | sim — é a lista completa do que foi pago |
| Telegram (destinatário = fornecedor) | sim, mas **só o que foi postado no grupo** — em novembro, praticamente nada |
| Notas de entrada | sim — mostra o que foi comprado e quanto ficou em aberto |
| Extrato do CSV | **não** — outra conta, e sem 08 e 09/11 |

Pagamento a fornecedor em novembro **só fecha** cruzando app + notas + a planilha do
dono. O Telegram confirma o que foi postado; a ausência dele não prova que o pagamento
não existiu.
