# Check-up TecnoCell — 12/11/2026 (madrugada)

> Auditoria do trabalho do dia, rodada **sem o dono**: 14 commits (`9fa825d`…`ed9c2d1`),
> produção conferida de verdade (Playwright logado, só leitura), invariantes do banco e
> conferência dos números que o dia prometeu.

**Alvo:** produção (`tecnocell-cloud.vercel.app`) para navegação · Supabase real para
dados (leitura) · banco local de testes só no `__QA__` do ponto.
**Telas visitadas:** 85 (todas as de `/painel` sem parâmetro dinâmico).

## 🔴 CRÍTICO

Nenhum. Nenhuma tela quebrada, nenhum erro de console, nenhum HTTP 500, nenhuma
exceção de JS nas 85 telas.

## 🟡 MÉDIO

### 1. ADL: diferença de 234,40 a 288,00 — e duas hipóteses minhas que caíram

**O número que eu ia reportar estava errado.** Primeiro eu disse 1.863,10. Depois
culpei a janela do caixa. Depois culpei a regra anti-duplicata. **As três estavam
erradas** — e a correção importa porque ele ia agir em cima do número inflado.

O que acontece de verdade:

- Hoje chegaram **65 comprovantes** da chave da ADL somando **5.462,10** — mas muitos
  são **o mesmo PIX reenviado ao grupo** (foto e PDF, ou encaminhado). Agrupando pelo
  `transacao_id`, são **48 PIX únicos = 3.887,00**.
- Abatido na nota 99: **3.599,00**.
- Diferença real: **288,00** no dia inteiro, ou **234,40** dentro da janela do caixa
  (08:03→18:21). Os 53,60 que chegaram às 18:33 ficam para o próximo fechamento.

**A regra anti-duplicata está CORRETA.** Testei comprovante por comprovante: os
"repetidos" têm o **mesmo `transacao_id`** — é o mesmo PIX, não dois pagamentos. Se o
app contasse todos, abateria dívida duas vezes pelo mesmo dinheiro.

**O que sobra de hipótese:** a regra só não consegue distinguir quando o comprovante
**não traz id de transação**. Hoje foram **5 comprovantes sem id, 449,00** — e dois
pares deles parecem o mesmo arquivo reenviado (Vitor Hugo Gomes da Silva 63,00 às
10:33 e 14:50; Jose Carlos Guimaraes de Barros 120,00 às 08:29 e 14:50). Se a regra
descartou um de cada par, são 183,00 — o que aproxima, mas não fecha os 234,40.

**Próximo passo (10 minutos, com o dono):** abrir **PDV → Operação → "PIX do dia"** e
conferir na tela a resolução comprovante por comprovante. Ela mostra o que o app casou
e o que deixou de fora; é a única fonte que fecha isso sem suposição.

**Conclusão para o fechamento:** não é buraco de 1.863,10. É diferença pequena
(234,40–288,00) sem causa provada. Nada urgente.

### 2. A tela mais lenta do sistema é a que eu criei hoje

`/painel/relatorios/descontos` abriu em **6,6s** (a mais lenta das 85; a segunda,
`/painel/estoque/reposicao`, em 5,4s).

**Causa medida:** a consulta em si roda em **15ms** no banco (`explain analyze`). O
tempo é **ida e volta**: a tela fatiava os itens por venda em lotes de 200 (5 idas ao
banco) e cada ida custa 120–180ms.

**Corrigido hoje (código, sem mudança de número):** os itens com desconto por peça são
raros — **974 linhas na tabela inteira** contra 77 mil itens — então virou **uma
consulta só**, filtrando o mês em memória.

**Medido depois do deploy:** 6,6s → **1,6s** (3,1s na primeira visita, servidor frio).
Mesma faixa das outras telas de leitura (1,2–1,5s).

## 🟢 PEQUENO

- `/painel/pedidos-app/imprimir` sem `<h1>/<h2>`: é página de impressão sem `?id=` —
  falso positivo, o próprio guia avisa.
- Três pendências históricas de outubro continuam no `qa-invariantes` (compra de
  mercadoria em "Vendas", 2 linhas com `valor_pago` acima do valor, 5 PIX na chave da
  IG FRANCA). Fora do processo por decisão do dono ("outubro já foi pago").

## ✅ Verificado e OK

**Deploy:** as três telas novas respondem em produção com título e dados —
`/painel/rh/conferencia`, `/painel/fiados/descontos`, `/painel/relatorios/descontos`.
Deploy READY.

**Código:** `tsc` = 0 · **206 testes** de lógica (12 + 86 + 4 + 23 + 81) · build
completo com as rotas novas.

**Banco (mês 11):** 46 invariantes OK, 0 falha. Ponto: sequência validada 10/10 e as 5
batidas de teste apagadas (limpeza confirmada).

**Desconto no fiado:** 46 lançamentos de "Desconto concedido" em novembro, **1.310,21**,
nenhum com conta bancária, nenhum em movimento de caixa, sem duplicata.

**Dívida de fornecedor:** nenhuma nota pendente com `valor_pago` (régua única), nome do
fornecedor igual ao cadastro em **100%** das linhas.

**A dívida caiu de 111.442,26 para 103.595,16 durante o dia — e isso está certo.** A
loja operou depois do retrato da planilha: foram **7.847,10** abatidos pelos
fechamentos das 18h (ADL 3.599,00 · H2O 3.344,80 · ZL 903,30), todos por PIX de
cliente. A planilha do dono precisa do mesmo ajuste; o app está à frente dela.

| Fornecedor | Planilha (14h) | App agora | Abatido hoje |
|---|---|---|---|
| ADL | 27.463,68 | 23.864,68 | 3.599,00 |
| H2O | 32.489,12 | 29.144,32 | 3.344,80 |
| PLANETA CELL | 12.555,96 | 12.555,96 | — |
| ZL | 3.689,80 | 2.786,50 | 903,30 |
| INOVA | 35.243,70 | 35.243,70 | — |
| **Total** | **111.442,26** | **103.595,16** | **7.847,10** |

## 🧹 Cleanup

Nada de teste ficou no banco: as 5 batidas do teste de ponto foram apagadas na mesma
execução (confirmado: `limpeza: 5 batida(s) de teste apagada(s)`). Nenhum registro
`__QA__` criado hoje.

## Fase 3 (CRUD) — não rodada de propósito

Criar/editar/apagar cadastro em produção de madrugada, sem ninguém olhando, é risco
sem ganho: a receita manda limpar no `finally`, mas um erro no meio deixa lixo em dado
real. O caminho de escrita coberto hoje foi o do ponto (com `__QA__` e limpeza) e o do
desconto (aplicado pela função real, em dado real, conferido linha por linha).
**As outras duas contas, conferidas pelo mesmo critério (PIX único):**
- **ZL:** 3 comprovantes = 903,30 únicos, e 903,30 abatidos na nota 113 — exato.
- **H2O:** 35 comprovantes = 3.267,80 únicos, contra 3.344,80 abatidos (2.613,80 na nota
  118 + 731,00 na 111) — os 77,00 de folga são PIX de dia anterior dentro da janela.
