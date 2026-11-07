# PIX de outubro — conferência fechada no extrato

**Status: resolvido.** O "buraco de R$ 183.972,11" não existe. Era erro de leitura meu:
eu comparei o PIX recebido do app com a conta errada e chamei a diferença de buraco.

Data da conferência: 02/11/2026. Fontes cruzadas: extrato PagBank
`30-09-2026_01-11-2026-pagbank.csv` (825 linhas) + `comprovantes_pix` do Telegram
(1.910 comprovantes únicos por ID E2E) + app (`pagamentos_venda` e fiado).

## O modelo, como o dono explicou (02/11, 10:13)

O cliente paga o PIX e a balconista manda ele pagar **direto na chave do fornecedor**
(ADL, ZL, H2O, PLANETA — conforme o quanto se deve a cada um). Esse dinheiro nunca
entra na conta da loja. O dinheiro que **entra** no PagBank é o que paga o
funcionamento: salários, contabilidade, tributos.

## Prova no extrato do PagBank

Saídas de outubro (104 PIX enviados + 31 QR Code) — destinatários:

Erick, Giovane, Nikollas, Lucas Da Silva Mello, Maria Eduarda Kappler, Mariana Vila
Real, Isaac Bento, Isabela Ponciano, Royal Contabilidade, Cef Matriz, Receita
Federal, Monteverde & Miller Advogados, Estilo & Cosméticos.

**Zero fornecedores de mercadoria no extrato** (STOR ONE, Armação Longitude,
Fernandes/Planorh, Atrativa, Play Cell: nenhuma saída). O PagBank não paga fornecedor —
confirma o modelo do dono.

| Extrato PagBank (30/09 a 31/10) | Nº | Valor |
|---|---|---|
| Pix recebido (de cliente) | 609 | 82.279,06 |
| Devolução Pix recebida | 3 | 3.465,09 |
| Vendas (cartão da maquininha) | 56 | 4.481,53 |
| Rendimento da conta | 8 | 15,22 |
| Resgate de CDB | 1 | 2.000,04 |
| **Entradas** | | **92.240,94** |
| Pix enviado | 104 | −73.769,44 |
| QR Code Pix enviado | 31 | −9.532,55 |
| Pagamento de conta | 3 | −2.108,57 |
| Aplicação em CDB | 1 | −2.000,00 |
| Cartão pré-pago, Valor Reservado, saúde, débito | 6 | −1.293,10 |
| **Saídas** | | **−88.703,66** |
| **Resultado do período** | | **+3.536,28** |

## O caminho do PIX do cliente (comprovantes do Telegram)

1.910 comprovantes únicos · **R$ 259.294,05** (1.958 recebidos; 48 duplicados pelo mesmo ID E2E).

| Destino do PIX do cliente | Comprov. | Valor |
|---|---|---|
| **Direto ao fornecedor** — H2O / STOR ONE | | 121.812,74 |
| **Direto ao fornecedor** — ADL / Armação Longitude | | 26.919,15 |
| **Direto ao fornecedor** — ZL / Fernandes + Planorh | | 14.038,00 |
| **Direto ao fornecedor** — INOVA / Atrativa | | 15.145,40 |
| **Direto ao fornecedor** — PLANETA / Play Cell | | 255,00 |
| *subtotal direto ao fornecedor* | | **178.170,29** |
| Para o nosso CNPJ — caiu no PagBank | | 74.338,29 |
| Isabela Ponciano (ex-funcionária) | | 5.872,47 |
| Sem cadastro (IG França 572,00 + J. V. Salgueiro 350,00) | | 922,00 |
| **Total** | | **259.303,05** |

## A conta fecha

```
PIX recebido de cliente no app .............. 260.379,70
  caiu na conta (extrato PagBank) ...........  82.279,06
  foi direto ao fornecedor (Telegram) ....... 178.170,29
                                              ──────────
  soma ..................................... 260.449,35
  diferença ................................     −69,65   (0,03%)
```

Os R$ 69,65 são comprovantes com nome mascarado no Telegram (``STOR *** ****``).
Contando pelo outro lado (1.904 comprovantes da primeira conferência) a diferença
sobe para R$ 236,85 — as duas leituras estão dentro da mesma margem de arredondamento.
**Em nenhuma leitura aparece buraco de R$ 183.972,11.**

## Correção do que eu tinha escrito

| O que eu escrevi | O que é verdade |
|---|---|
| "PagBank é canal acessório, a maior parte do PIX nem passa por ele" | Ao contrário: o PagBank é a conta que **recebe** o PIX do cliente (82.279,06) e o usa para a folha. O que não passa por ele é o PIX que o cliente manda **direto ao fornecedor** (178.170,29). |
| "R$ 76.407,59 é o PIX recebido no PagBank" | O extrato tem **82.279,06** de Pix recebido (609 lançamentos). O 76.407,59 foi um recorte meu, não o total. |
| "PIX enviado ao CNPJ próprio R$ 74.338,29" | Está invertido: são **clientes pagando o nosso CNPJ**. O pagador de cada comprovante é uma pessoa física; o destinatário é o CNPJ 38.216.415. Esse é justamente o dinheiro que cai no PagBank. |
| "pass-through: entrou 260.379,70 e saiu 258.996,55, sobrou 1.383,15" | Comparei o dinheiro do cliente com ele mesmo. A conta não mexe 260 mil: mexe 92.240,94 de entrada e 88.703,66 de saída. |

## O que isso significa para o app

O resultado de outubro **não muda** (venda, devolução, CMV e despesa são fatos).
O que muda é a fotografia do dinheiro: R$ 178.170,29 de venda em PIX nunca pode
aparecer como dinheiro em conta. Ver as três correções propostas em
`pix-cravado.md` → seção "Correções propostas no app" (abaixo).

## Correções propostas no app

1. **Forma de pagamento "Pix direto ao fornecedor"** — **descartada** (dono, 02/11):
   escolha a mais no PDV durante o dia dá erro de balcão. Substituída pelo bloco do
   fechamento de caixa, que lê o destino do próprio comprovante.
2. **"Quem pagou" no lançamento de fornecedor** — resolvido sem digitação: a baixa
   grava `forma_pagamento = "PIX do cliente ao fornecedor"` e `conta_id = null`, então
   nenhum saldo de conta ou gaveta se mexe.
3. **Relatório "PIX do mês — onde caiu"** — virou o bloco **"PIX do dia — quem
   recebeu"** dentro do Fechamento de Caixa (ver abaixo).

## Construído em 02/11/2026 — bloco "PIX do dia — quem recebeu"

**Onde:** Fechamento de Caixa → etapa "resumo" (antes de contar a gaveta), em
`app/painel/pdv/operacao`.

**Como funciona:** o app não fala com o Telegram. O bot já grava cada comprovante em
`comprovantes_pix` com valor, pagador e destinatário. O bloco lê os comprovantes desde
a abertura do caixa daquela loja, agrupa por recebedor e mostra:

- fornecedor — total do dia, nº de comprovantes e a dívida em aberto no app, com botão
  **Dar baixa** (valor sugerido = menor entre o PIX do dia e a dívida);
- recebedor que é a conta da loja — linha "Caiu na nossa conta (banco)";
- recebedor sem cadastro — "não identificado", sem botão;
- comparação **PIX lançado no caixa × comprovantes lidos**, com o aviso da diferença.

**Arquivos:** `lib/pix-destinos.ts` (agrupamento e casamento, puro), `page.tsx`
(leitura e resolução do grupo do Telegram por loja), `OperacaoClient.tsx`
(`PixDoDiaCard` / `BaixaPixForm`), `actions.ts` (`baixarPixDoFornecedor`).

**Conferência com dado real (31/10, último caixa fechado):**

| Loja | Comprovantes lidos | PIX lançado no caixa | Diferença |
|---|---|---|---|
| Petrópolis | 8.797,20 (65 comprovantes) | 8.874,20 | −77,00 |
| Teresópolis | 5.989,10 (30 comprovantes) | 5.979,10 | +10,00 |

Ferramenta de conferência (somente leitura): `scripts/checa-pix-destinos.ts`.

**Teste que roda:** `node --import ./test/alias.mjs test/pix-destinos.test.ts` (22 casos,
incluindo os de erro humano no balcão).

## Erro humano tratado (02/11/2026)

Cada caso abaixo já aconteceu na loja. A regra é: sai da conta, aparece num aviso,
nunca soma duas vezes.

| O que a atendente faz | O que o app faz |
|---|---|
| Manda o mesmo comprovante duas vezes | Conta uma vez. Pega pelo ID da transação e, quando o print não tem ID, por pagador + valor + dia + recebedor (mesma regra do bot) |
| Manda o comprovante no grupo da OUTRA loja | Não soma em nenhuma das duas e avisa nas duas — quem decide de qual loja é são as meninas |
| Manda foto que não é comprovante | Ignora e conta na linha "foto que não era comprovante" |
| Print ilegível / ainda não lido | Fora do total, com aviso para conferir na mão |
| Comprovante sem o nome de quem recebeu | Fora do total, com o valor no aviso |
| Apaga a mensagem do grupo | Continua valendo (o grupo apaga sozinho). Aviso lembra: se foi CANCELADO, desconte antes de baixar |

**Quanto isso valia em outubro/2026:** os comprovantes somavam 264.374,75 crus. Com o
tratamento, o válido é **259.321,05** — estavam inflados em **5.053,70** (47 comprovantes
repetidos). O app registra 260.379,70 de PIX recebido no mês, ou seja, agora fecha com
**0,4%** de diferença.

**Cancelamento de PIX** é o único caso que o app não consegue saber sozinho: o bot não
marca PIX cancelado. Fica o aviso dos apagados e a orientação de descontar na mão. Se
acontecer com frequência, o caminho é o bot passar a ler o "PIX devolvido" no comprovante.

**Teste manual para o dono, antes de usar no balcão:**

1. Abra o caixa de uma loja e mande 3 comprovantes de PIX no grupo do Telegram: um
   para o nosso CNPJ, um para um fornecedor que o app conhece, um com valor ilegível.
2. Mande o MESMO comprovante de novo e um no grupo da outra loja.
3. Clique em **Fechar Caixa** e confira o bloco: o repetido não soma duas vezes, o do
   outro grupo aparece no aviso, o ilegível entra na contagem sem valor.
4. Clique em **Dar baixa** com o valor sugerido. Confira no Financeiro: a dívida caiu,
   o lançamento ficou com a forma "PIX do cliente ao fornecedor" e **nenhuma** conta
   nem gaveta mudou de saldo.
5. Feche o caixa normalmente.

