# Regra — desconto na segunda peça (tela quebrada dentro da garantia)

> Regra que o dono tem na operação (dito em 23/11/2026). Ainda **não** é regra automática
> do app. Decisão de virar automática exige análise de impacto e autorização do dono.

## A regra (como o dono definiu)

**Quando se aplica:** o cliente precisa mostrar que a tela que ele comprou **dentro da
garantia** está avariada — ele quebrou.

**Como funciona:**

1. Peça **top 20**: é a lista das **20 peças mais vendidas**, mantida em uma tabela. Os
   preços dessas peças já são **bem abaixo do normal** — por isso **não recebem desconto
   nenhum**.
2. No restante: o dono (Indrique Gomes França) e **Mariana Vila Real Castelli** dão um
   desconto que **não fuja do lucro**.
3. **Garantia: 3 meses.** Fora disso, não entra.
4. **O desconto varia por peça** — não é 40% fixo.
5. **Uma única vez:** o desconto na segunda peça é dado **uma vez só** por cliente/peça.
   Antes eles marcavam a peça com um **carimbo** para controlar; **o carimbo se perdeu** —
   hoje não existe controle de quem já usou o benefício.

## Como o app faz hoje (o que existe e o que não existe)

- **Não existe** regra automática de desconto na segunda peça. O app não conhece esse
  benefício.
- Hoje a operação é feita **na mão**: desconto manual no PDV, decidido pelo dono e pela
  Mariana. Desconto manual só funciona para quem tem a permissão `venda_desconto`.
- Peça com defeito que o fornecedor troca → **Troca com fornecedor** (módulo Trocas,
  status `aberta` → `enviada`).
- Peça que o fornecedor não troca (avaria) → **Perda de troca** — o custo vira prejuízo
  (categoria própria).
- Cliente devolve peça e recebe dinheiro/PIX/crédito → **Devoluções**.
- O app **não registra o motivo** "segunda peça após quebra" nem controla "uma vez só".

## O que falta para virar regra automática no app

1. ~~Top 20 marcado pelo nome no produto~~ → **feito em 23/11**: campo próprio
   `produtos.promocao_top20` (migration `2026-11-23-produtos-promocao-top20.sql`, colar no
   SQL Editor), checkbox "Promoção TOP 20" no formulário do produto e selo "TOP 20" na
   lista. Os 48 produtos que já tinham a marcação no nome foram ligados pela própria
   migration. **Pendente**: aplicar o SQL e o deploy (trava da palavra-chave).
2. Como controlar o "uma vez só": sem o carimbo, o app teria de registrar a quebra/benefício
   no cadastro do cliente ou na venda (tela + cliente + data). É a peça que substitui o
   carimbo perdido.
3. ~~Aviso no PDV quando o operador der desconto em peça TOP 20~~ → **feito em 23/11**:
   selo TOP 20 na busca e no carrinho do PDV; aviso vermelho quando o item TOP 20 recebe
   desconto, quando a venda com peça TOP 20 leva desconto geral e na tela "Confira a
   venda". Avisa, não bloqueia — a trava é a conferência de quem fecha.

## Peças prontas para usar hoje

- Desconto manual no PDV (com permissão).
- Troca com fornecedor para registrar a peça e a garantia.
- Perda de troca para a peça avariada que o fornecedor não troca.
