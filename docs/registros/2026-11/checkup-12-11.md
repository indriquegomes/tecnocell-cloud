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

### 1. ADL: 1.863,10 de PIX de cliente de hoje não abateu a dívida

**Prova:** hoje entraram **65 comprovantes "MAIS BARATO" (chave da ADL) somando
5.462,10**, todos no mesmo grupo do Telegram. A nota 99 (Petrópolis) abateu
**3.599,00**. Diferença: **1.863,10** que saiu do cliente e não reduziu a dívida.

As outras duas contas fecham:
- **ZL:** 903,30 de PIX hoje (805,00 + 98,30) e 903,30 abatidos na nota 113 — exato.
- **H2O:** 3.344,80 abatidos (2.613,80 na nota 118 + 731,00 na 111) contra 3.267,80 de
  PIX de hoje — os 77,00 de folga são PIX de dia anterior dentro da janela do caixa.

**Causa provável:** a baixa automática (`baixarPixDoDiaAutomatico`, em
`app/painel/pdv/operacao/actions.ts`) só enxerga os comprovantes **entre a abertura e o
fechamento do caixa daquela loja**. PIX que chega fora dessa janela — ou que sobra de
uma sessão que fechou antes — não é revisitado por nenhum fechamento seguinte.

**Correção sugerida:** no fechamento, além da janela da sessão, varrer o que ficou sem
abatimento no dia (o `jaAbatido` já existe; falta somar o que não entrou em janela
nenhuma). Antes de mexer, conferir na tela "PIX do dia" do PDV quais comprovantes
ficaram de fora — é a mesma resolução, com nome e valor.

**Não corrigido nesta madrugada** porque mexe em caminho de dinheiro: precisa do dono.

### 2. A tela mais lenta do sistema é a que eu criei hoje

`/painel/relatorios/descontos` abriu em **6,6s** (a mais lenta das 85; a segunda,
`/painel/estoque/reposicao`, em 5,4s).

**Causa medida:** a consulta em si roda em **15ms** no banco (`explain analyze`). O
tempo é **ida e volta**: a tela fatiava os itens por venda em lotes de 200 (5 idas ao
banco) e cada ida custa 120–180ms.

**Corrigido hoje (código, sem mudança de número):** os itens com desconto por peça são
raros — **974 linhas na tabela inteira** contra 77 mil itens — então virou **uma
consulta só**, filtrando o mês em memória. Falta medir em produção no próximo check-up.

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
