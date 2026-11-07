# Plano — Relatório "Fechamento de Caixa"

> Pedido da Isa (29/07): um relatório de fechamento de caixa, podendo filtrar por período,
> vendedor, tipo de movimentação, tipo de pagamento e loja.
> Decisão do Vitor: fazer em **2 níveis** (histórico + detalhe). Este doc é o combinado.

## O que a Isa pediu
Uma tela nova em **Relatórios** pra ver os fechamentos de caixa e filtrar de 5 jeitos:
período · vendedor · tipo de movimentação · tipo de pagamento · loja.

## A dúvida que eu tinha (resolvida)
Eu não sabia se ela queria **(A) uma lista de cada movimento** ou **(B) uma lista dos caixas
fechados**. O Vitor decidiu: **os dois juntos**, em 2 níveis. Sem mais dúvida.

## Como vai ser — 2 níveis

### Nível 1 — Histórico dos fechamentos (a tela principal)
Cada **caixa fechado** é uma linha. Filtros: **período** (data do fechamento) e **loja**.
Colunas: Loja · Abriu · Fechou · Operador · Total de Vendas · Entrou (reforços) ·
Saiu (retiradas/devoluções) · Esperado · Contado · Diferença.
→ É o "histórico dos fechamentos que já teve" (ponto 1 do Vitor).

### Nível 2 — Detalhe de um caixa (clica numa linha)
Abre **tudo daquele caixa**: cada venda, reforço, retirada e devolução, com
data · vendedor · tipo de movimentação · forma de pagamento · valor.
Aqui ficam os filtros mais finos: **vendedor · tipo de movimentação · tipo de pagamento**.
→ É a "flexibilidade pra ver o fechamento de um jeito diferente" (ponto 2 do Vitor).

## Onde os 5 filtros da Isa moram
- **Período** e **Loja** → no Nível 1 (histórico).
- **Vendedor**, **Tipo de movimentação**, **Tipo de pagamento** → no Nível 2 (dentro do caixa).

## Por que é seguro e encaixa no sistema
- É uma **aba nova em Relatórios** (a tela que já existe) — não é do zero.
- Os dados **já existem**: caixas (abertura/fechamento/loja/operador), movimentos_caixa
  (reforço/retirada/devolução) e vendas (ligadas ao caixa por `caixa_id`, com vendedor e forma).
- É só **leitura** — não mexe em dinheiro. Risco baixo.
- Exporta em **CSV** como os outros relatórios.

## Detalhe combinado
"Por vendedor" só se aplica a **vendas** (reforço/retirada não têm vendedor). Ao filtrar por
vendedor no detalhe, mostra só as vendas daquele vendedor.

## Status
Plano aprovado em conceito. Falta o "pode montar" final do Vitor pra implementar.
