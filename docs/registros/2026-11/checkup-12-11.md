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

### 1. Nada quebrado: os PIX do dia fecharam — mas o app não deixa isso provável

**O achado que eu ia reportar não existe.** Tentei três versões — 1.863,10, depois
234,40 — e as três estavam erradas. O dono desconfiou ("até onde sei todos os PIX
fecharam corretos") e estava certo.

**Como se prova, agora que achei o caminho:** rodar a **função do próprio app** para a
janela real de cada caixa e comparar com o histórico de abatimentos.

```bash
# resolverPixDoDia(lib/pix-do-dia.ts) para cada loja, com o aberto_em do caixa
node --import ./test/alias.mjs <script>   # precisa de .env.local
```

| Loja / janela | Resolvido pelo app | Abatido | |
|---|---|---|---|
| Petrópolis · 08:03→18:21 (ADL) | 4.039,40 | 3.599,00 (noite) + 440,40 (manhã) | **fecha** |
| Teresópolis · 07:59→18:42 (H2O) | 3.344,80 | 3.344,80 (2.613,80 + 731,00) | **fecha** |
| Teresópolis · 07:59→18:42 (ZL) | 903,30 | 903,30 | **fecha** |

O que sobra fora dessas contas é **53,60** da ADL recebidos às 18:33, **depois** do
fechamento — vão para o próximo, como deve ser.

**Onde eu errei (e por que vale registrar):**

1. Contei **comprovante** como pagamento. O mesmo PIX chega ao grupo duas vezes (foto e
   PDF) e o app deduplica — 65 comprovantes são 43 PIX. Isso inflou tudo em ~8 vezes.
2. Tentei reconstruir a resolução por fora (janela do caixa, depois a regra
   anti-duplicata). Nenhuma das duas era o caminho: a única fonte é a função do app.
3. O fechamento da manhã (08:02) abateu 440,40 da ADL — PIX do dia anterior. Sem esse
   pedaço, a conta da noite nunca fecharia.

**A melhoria que sobra (não é bug):** o app **não registra** o que ele resolveu no
momento do fechamento. Como o fechamento é uma resolução instantânea e os comprovantes
continuam chegando, auditar depois exige reconstruir — foi por isso que eu errei três
vezes e o dono precisou me corrigir. Proposta: gravar no fechamento, por fornecedor, o
valor resolvido, a quantidade de comprovantes e a janela usada. Aí "os PIX fecharam"
vira prova, não reconstrução.

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

## ✅ Correção de 13/11 (madrugada) — o achado 1 não existia

Registro honesto: o relatório chegou a apontar **1.863,10** e depois **234,40** de PIX
da ADL sem baixa. O dono contestou ("até onde sei todos os PIX fecharam corretos") e
estava certo. As três tentativas de explicação caíram:

1. "janela do caixa" — errado;
2. "regra anti-duplicata jogando pagamento fora" — errado: os repetidos têm o MESMO
   `transacao_id`, é o mesmo PIX reenviado;
3. a conta certa só saiu rodando a **função do próprio app** (`resolverPixDoDia`).

**Resultado conferido:** ADL 4.039,40 resolvidos = 3.599,00 (fechamento da noite) +
440,40 (fechamento da manhã) · H2O 3.344,80 = 3.344,80 · ZL 903,30 = 903,30. Fora da
conta só os **53,60** da ADL que chegaram 18:33, depois do fechamento — vão para o
próximo.

**Lição:** para auditar PIX do dia, rodar `resolverPixDoDia` com o `aberto_em` do caixa.
Contar comprovante não é contar pagamento.
