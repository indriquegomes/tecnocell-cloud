# Checklist dos trabalhos da semana — 13 a 19/11/2026

Rodada noturna de 19/11/2026 (feita sozinha, sem o dono). Cobre: o que foi
entregue na semana, os testes de erro e de ligação de tela, a varredura de telas
pesadas e o que ficou pendente.

## 1. Trabalhos da semana (o que foi entregue)

### 18 e 19/11 — nota de entrada por foto

- Importador "Compras → Importar por foto" (`147d615`): lê foto da nota (Gemini/
  DeepSeek), casa item com produto, monta nota pendente com total somado.
- Linha sem produto escolhido bloqueia o criar com aviso (`15c73ce`).
- Várias notas de uma vez, uma por foto (`1dba144`); fotos comprimidas no navegador
  para caber no envio (`4e87183`); leitura foto a foto para nota de várias páginas
  (`3c87009`); tela com ajuda e busca no lugar da lista de 8 mil produtos
  (`2905c04`); leitura não escolhe mais a peça errada (`425fca2`).
- Testado com 4 fotos reais da H2O: 56 itens lidos, 56 casados; nota de teste
  criada e apagada (Playwright).

### 18 e 19/11 — caixa

- Botão de retirada e aviso do fechamento orientam o caminho certo (`dc793f6`).
- Retirada passou a ser só de dinheiro e a trava olha a forma (`72a994d`).
- Despesa "quitada" em dinheiro cria a retirada ligada sozinha (mesma régua do
  botão "Pago") — `ae845f6`.
- Correção do exagero: a retirada na gaveta só acontece quando o lançamento NÃO
  tem conta; cofre/banco não duplicam e o caixa não é tocado (`5c1361d`).

### 18/11 — encomenda e cadastros

- "Chegou" da encomenda só avisa: não cria produto, não mexe no estoque (`3952d64`);
  custo opcional na chegada (`41b0387`).
- Cadastros: Arthur inativo com nome limpo (`e5d04ad`); lote 11–20 da limpeza
  (`2dd3ad0`); H2 fundido no H2O; "frontal poco 81" fundido (`69ebd25`).

### 17/11 — avisos e financeiro

- "Não vender" virou "Aviso interno" e nasceu "Aviso na nota" que sai no cupom
  (`a8699a6`, `70c772e`); PDV com aviso em letras garrafais (`d89e594`).
- Desconto no fiado consertado: despesa não some mais do resultado do mês
  (`2f9f70b`).
- Pagamento quitado abate a nota e "Desfazer" devolve o valor (`f3e6bc5`).
- Perda de troca grava o vínculo do fornecedor (`ed09d1a`); conciliação ADL × H2O
  com a planilha do dono (`97d3ad0`, `5e19f83`).

### 19/11 — bot do PIX e QA

- Deduplicação do bot estava cega (PostgREST cortava em 1000 e devolvia as mais
  antigas). Correção: toda leitura de `comprovantes_pix` paginada; dedup olha só
  os últimos 2 dias; aviso no grupo só para cópia das últimas 24h (`212c176`,
  `a417ae4`, `7ceb33a`).
- qa-ligacoes: régua da conta a pagar só em nota recebida; crédito a favor não é
  dívida negativa (`90f8a89`).
- Importador por foto: 4 testes de casamento novos.

## 2. Testes desta noite

- Type-check: **0 erros**.
- Testes de lógica: **238 passando, 0 falha** (8 arquivos).
- **5 testes de erro** (produção):
  1. 404 de rota pública responde 404 em português.
  2. Rota protegida desconhecida cai no login (não vaza tela).
  3. Login errado mostra mensagem e não entra.
  4. API inexistente responde 404.
  5. Webhook do bot sem segredo recusa com 401.
- **50 verificações de ligação de tela** (`qa-ligacoes.mjs`): mês 11 com **35 OK
  e 0 falha**; avisos para olhar: trocas com nome antigo (89 linhas), comprovante
  sem valor lido (6), mercadoria paga em PIX sem conta (10), fornecedor com dívida
  e lançamento sem `pessoa_id` (2).
- **Checkup das 86 telas em produção**: tudo 200. 2 "problemas": impressão de
  pedido sem `?id=` (falso positivo conhecido) e envio do Sentry falhando na tela
  Usuários (rede do ambiente bloqueando o ingest do Sentry — não é o app).

## 3. Telas pesadas (medido em produção, 19/11)

| Tela | Tempo | HTML |
|---|---|---|
| /painel/estoque/historico | 1,3 s | 1.097 KB |
| /painel/painel-vendedor | 3,9 s | 912 KB |
| /painel/financeiro | 2,5 s | 869 KB |
| /painel/produtos | 1,7 s | 685 KB |
| /painel/fiados | 2,9 s | 573 KB |
| /painel/relatorios | 0,6 s | 432 KB |
| /painel/estoque/reposicao | 6,0 s | 324 KB |

Não mexi nessas telas: cortar dados mostrados é mudança de comportamento e precisa
do dono. O que já foi feito antes (reposição paginada 100/página) continua valendo.
Recomendação para depois: página de movimentações com período padrão do mês e
filtro paginado; painel do vendedor renderizando ranking sem trazer todas as
vendas do mês para o HTML.

## 4. Limpeza feita

- Arquivos temporários da sessão removidos (`tmp-*.cjs`, `tmp-*.mjs`, CSV de
  leitura da planilha, pasta `tmp-checkup/` de screenshots).
- `docs/registros/2026-11/preview-nao-vender/` fica como está: é evidência
  intencionalmente não versionada.

## 5. Pendências que continuam com o dono

- Cadastros: TRICELL 16 DE MARÇO e TRICELL MR - MR CELL (só limpeza de nome);
  Luiz Gustavo (R$ 100), Marcio (R$ 924) — decidir dívida real × nota antiga.
- Lista do financeiro (decisões-pendentes.md): vale-crédito (investigado: regra
  "sempre despesa" já está no ar), motoboy R$ 175, 13 saídas do extrato, volta de
  volume das devoluções; comissões de outubro ajustadas em 20/11.
- Planilha CAIXA NOV: diferenças de ADL (375,00 = 280,00 de PIX de cliente abatido
  + 95,00 que saiu da planilha) e H2O (5.406,04 de notas de outubro que o app já
  fechou na conferência de 02/11) — planilha é do dono, não foi tocada.
- Sobra de R$ 25,20 no caixa de Petrópolis de 19/11: o sistema esperava
  1.630,30 (abertura 200 + vendas em dinheiro 127,70 + fiados recebidos em
  dinheiro 1.302,60) e não existe lançamento de 25,20 em lugar nenhum — falta
  identificar a origem física (venda/fiado recebido em dinheiro lançado como PIX,
  ou contagem).
