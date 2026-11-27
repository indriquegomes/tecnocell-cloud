# Promoções e brindes de campanha

Duas coisas diferentes que a loja chama de "promoção":

| O que é | Onde mora | O que faz no PDV |
|---|---|---|
| **Desconto** (preço menor) | tela **Promoções** → tipo `valor_direto`, `progressivo`, `leve_x_pague_y`, `acima_x_pague_y` | entra como desconto na linha; o preço do cadastro não muda |
| **Brinde** (sai de graça) | tela **Promoções** → tipos `brinde_pelicula` e `brinde_total` | a linha entra a R$ 0,00, marcada como 🎁 BRINDE |
| **Queima de estoque** (preço abaixo do custo) | também é **desconto**: promoção `valor_direto` | desconto de promoção **não** passa pela trava de custo/piso |

## Por que desconto de promoção não trava a venda

A trava "não vende no custo ou abaixo" (`app/painel/pdv/actions.ts`, `produtoNoCusto`) olha o
**preço do item** (`preco_unitario - desconto_item`). O desconto da promoção chega como
**desconto da venda** (`p_desconto`), então o preço do item continua o de tabela e a venda
passa — inclusive por vendedor comum. O aviso vermelho "abaixo do custo" no carrinho também
compara só o desconto manual.

Consequência para relatório: a venda grava **preço cheio + desconto "PROMO…"**. O total está
certo; a margem por ITEM parece melhor do que foi. Para medir a campanha, usar o desconto do
período, não a margem por item.

## Brindes (o que a promoção de desconto não faz)

Brinde é **item a R$ 0,00 condicionado a outro item** (ou a um valor de compra). A aba
Promoções não cobre isso sozinha: existe uma regra no servidor.

### 1. Comprou tela, ganhou película do mesmo modelo

- Promoção tipo **`brinde_pelicula`** liga (e desliga) a regra pela janela de data.
- Com tela no carrinho, o PDV mostra as películas que servem para aquele modelo. O vendedor
  escolhe; a película entra a R$ 0,00 e **baixa estoque** como venda normal.
- O casamento é por **texto do nome**, porque `produtos.modelo` está vazio em quase todo o
  catálogo. A regra é `lib/brinde.ts` (`peliculaServeParaTela`) e vale igual no servidor.
- O que a regra faz: compara **grupos de modelo** separados por barra (a película
  `IPHONE 6G/6S/7/8/SE` serve no 7), exige o **número do modelo** em comum, exige uma palavra
  de família em comum (mata "IPAD PRO 11 × IPHONE 11 PRO") e exige a **mesma variante**
  (PRO/MAX/PLUS/ULTRA/MINI/LITE/SE/FE — "6S PLUS" não é "6S").
- Não gera brinde: tela que **já vem com película no nome** ("…+ PELICULA 3D"), e película
  **TRASEIRA** (não é película de tela).

### 2. Brinde único acima de um valor

- Promoção tipo **`brinde_total`** com `valor` = mínimo de compra; o **produto do brinde é o
  item cadastrado nessa promoção** (`itens_promocao`) — nada fixo no código.
- Quem concede é o `finalizarVenda`: confere o valor mínimo e reserva em
  `brindes_concedidos` **antes** de gravar a venda. A chave primária é a promoção, então é
  **um brinde em toda a campanha** e dois caixas simultâneos não conseguem conceder dois.
  Se a venda falhar, a reserva é devolvida.
- Para virar "um por dia", trocar a PK de `brindes_concedidos` por `(promocao_id, dia)`.

## O que o servidor NÃO confia no navegador

O painel do PDV só sugere. No F8, `classificarBrindes` recalcula tudo: linha de R$ 0,00 só é
brinde se a regra bater; o resto continua sujeito à trava de custo e ao piso de preço. Também
recusa brinde com quantidade maior que 1 na mesma linha.

## Arquivos

| Arquivo | Papel |
|---|---|
| `lib/brinde.ts` | regra pura (modelo, categorias, tipos) |
| `lib/brinde.test.ts` | testes de lógica (`node --import ./test/alias.mjs lib/brinde.test.ts`) |
| `app/painel/pdv/actions.ts` | `brindesDoCarrinho` (opções) e `classificarBrindes` (autorização no F8) |
| `app/painel/pdv/PDVClient.tsx` | painel 🎁 no carrinho e selo BRINDE na linha |
| `supabase/migrations/2026-11-27-black-brinde.sql` | `itens_venda.brinde` + `brindes_concedidos` |
| `scripts/criar-promocao-black-brindes.mjs` | cria/recria as promoções de brinde da campanha |
