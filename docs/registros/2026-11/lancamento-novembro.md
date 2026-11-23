# Lançamento de novembro/2026 — fila de 1 em 1

> Objetivo único: **lançar no app tudo que entrou e saiu em novembro/2026**, sem
> exceção, e provar cada item antes de abrir o seguinte.
> Este arquivo é a memória da rodada: a fila, o item aberto e o que já fechou.
> Regra nova entra aqui só se o dono pedir.

## Regras duras (a trava)

1. **Um item por vez.** Só abre o próximo quando o atual estiver **lançado,
   conferido e mostrado**. Item "quase pronto" não conta como pronto.
2. **Achado fora do escopo não se resolve — vai para a fila "Depois".** Uma linha,
   o valor, e segue o item atual. Não abrir código, não criar migration, não rodar
   script novo, não investigar bug de app no meio do lançamento.
3. **Exceção única do item 2:** o achado que **impede** lançar o item atual
   (coluna que falta, lançamento que não grava, caixa travado). Aí resolve só o
   mínimo para destravar, registra em "Depois" e volta.
4. **Nada de valor inventado.** Sem o número do dono, o item fica aberto esperando
   — não estima, não rateia, não "aproxima".
5. **Nenhum número de dinheiro sem as quatro informações** (`AGENTS.md` §13):
   loja · período · o que está dentro · contado/esperado quando for caixa.
6. **Nada de produção além do lançamento:** sem commit, sem deploy, sem migration
   no meio da fila. Banco só recebe dado (linha de lançamento/movimento).

## Protocolo de cada item (sempre igual)

1. **Abrir:** eu digo qual item está aberto e o que falta de informação.
2. **Receber:** o dono manda a informação (texto, print, extrato, planilha).
3. **De/para na tela:** eu devolvo a linha exata — descrição · valor · loja ·
   categoria · forma · data de vencimento · pago/pendente · conta.
4. **Aprovação:** dono diz "ok" (ou corrige o campo errado).
5. **Lançar:** gravo no banco.
6. **Provar:** mostra o registro gravado (id, valor, status) e o efeito no total
   do mês.
7. **Fechar:** marca ✅ na fila e abre o próximo.

## Fila (ordem de execução)

| # | Item | Situação | Valor |
|---|---|---|---|
| 1 | Despesas fixas operacionais (aluguel das 2 lojas, energia, água, internet, contabilidade, DAS/Simples, segurança, software) | **ABERTO** | a levantar |
| 2 | Folha e encargos que faltarem (salários, vale-transporte, INSS, estágio, freelancer de balcão) | aguarda | a levantar |
| 3 | Retiradas de caixa sem lançamento em novembro (14, R$ 1.005,70 — motivos já escritos no caixa) | aguarda | 1.005,70 |
| 4 | Custo variável (motoboy, manutenção, limpeza, alimentação, combustível, gastos em São Paulo) | aguarda | a levantar |
| 5 | Entradas fora da venda: fiado recebido, reforço, aporte do sócio, PIX que não passou pelo caixa | aguarda | a levantar |
| 6 | Fechamento: resultado do mês (entrou − saiu) + caixa × contas x DRE batendo | aguarda | — |

## Extrato PagBank 01–21/11 — análise (só análise; o CSV fica no Downloads, não entra no repo)

Arquivo do dono: `Downloads/01-11-2026_21-11-2026.csv` (382 linhas). Ele é **fonte de
conferência**, não arquivo do app — nada dele é copiado para o repositório nem para o
banco; do extrato só saem números.

| | Quantidade | Valor |
|---|---|---|
| Saídas | 130 | R$ 60.387,51 |
| Entradas | 252 | R$ 44.274,18 |
| Saídas que casam com lançamento do app (valor + até 3 dias) | 70 | R$ 20.959,85 |
| **Saídas SEM lançamento no app** | **60** | **R$ 39.427,66** |

Por tipo de saída: Pix enviado 96 · R$ 40.882,11 · QR Code Pix 28 · R$ 7.185,91 ·
Aplicação em CDB 2 · R$ 11.890,00 · Recarga cartão pré-pago 1 · R$ 300,00 ·
Pagamento de conta 1 · R$ 96,69 · PagBank Saúde 1 · R$ 24,90 · Seguro 1 · R$ 7,90.

### As 60 saídas sem lançamento, agrupadas (na ordem em que vamos fechar)

**A. Conhecidas (já existem lançamento igual em mês anterior)**
- Aluguel Petrópolis — Edson Canedo — **2.600,00** em 03/11
- Energia — Enel Distribuicao Rio — **549,43** em 07/11
- Advogado — Monteverde & Miller — **810,50** em 05/11
- Impostos — Receita Federal — 84,15 + 48,63 + **522,32** em 19/11
- Combustível — Posto Barra — 79,19 (05/11) + 113,87 (11/11) + 220,41 (20/11)
- Alimentação — Dom Atacadista 1.281,00 (13/11) · Armazem Do Grao 50,65 (04/11) + 140,70 (14/11)
- Transporte/Gastos SP — Aguia Branca Transportes 345,18 (03/11) + 406,26 (17/11)
- Internet/telecom — Supercabo Tv de Paty **96,69** em 11/11 (pagamento de conta)
- Tarifas PagBank — Cef Matriz 10,80 + 70,36 + 18,70 + 259,36 + 51,87 + 89,76 ·
  PagBank Saúde 24,90 · mensalidade seguro 7,90
- Pix Marketplace **296,00** (10/11) · Recarga Cartão Pré-Pago Visa 0839 **300,00** (13/11)

**B. Pessoas (folha, adiantamento, sócio, dívida)**
- Indrique Da Silva Franca — **5.976,00** em 20/11 (sócio)
- Luiza Lopes Neves 1.499,78 + Leoni De Souza Azevedo 500,00 (02/11) — contas do sócio
- Isabela Ponciano Câmara — **461,88** em 02/11 (parcela 02/10)
- João Vitor Maximiano Franca — 107,00 + 230,00 + 504,50 + 638,50 + 560,00 = 2.040,00
- Rodrigo Carvalho 270,17 + 363,00 · Vitória Ranyelle 1,59 + 607,88 + 363,00 ·
  Leticia 135,08 + 363,00 · Isabella Beatriz 233,75 · Mariana 457,00 ·
  Maria Eduarda 457,00 · Brunna 457,00 · Lucas Da Silva Mello 670,00 ·
  Giovane Rego Da Silva 725,00 · Bruno Delgado De Mattos 295,00

**C. Sem nome conhecido (só o dono diz)**
- Vitor Da Silva Costa 224,00 (06/11) · Romulo Oliveira De Castro 101,00 (07/11) ·
  Fernando Dos Santos Silva 90,00 (07/11) · Emily De Menezes Pittzer Fiuza 128,00 (10/11) ·
  Roni Goebel Da Silva 400,00 (13/11) · Claudia Valéria De Souza Almeida 425,00 (13/11) ·
  Anderson Xavier Da Rocha Henrique 21,00 (18/11) · Vitor Porto Figueira 210,00 (19/11) ·
  Luiz Diego Dos Santos Silva 77,00 (21/11) · Endrieli Da Silva Franca 83,00 (02/11)

**D. Não é despesa — conferir como dinheiro nosso**
- Aplicação em CDB 1.890,00 + 10.000,00 (03/11) e resgates 11.322,09 — é o
  dinheiro parado no CDB, não gasto. Não vira despesa; se o dono quiser, vira
  transferência para uma conta "CDB".

## Lista de devoluções/estornos a conferir (extrato, novembro)

Dez PIX sem nome conhecido. Cruzamento com cadastro, vendas e lançamentos do app
(só leitura, 22/11). **A conferência fina (bate com a compra? está abatendo certo?)
fica para depois — primeiro fecha o banco.**

| PIX | Cadastro no app | Compra/registro no app | Leitura |
|---|---|---|---|
| VITOR DA SILVA COSTA 224,00 · 06/11 | cliente | venda #11910 de 224,00 no **mesmo dia** | devolução da compra #11910 |
| ANDERSON XAVIER DA ROCHA HENRIQUE 21,00 · 18/11 | cliente | venda #13566 de 21,00 (16/11) + receber 21,00 pago | devolução da compra #13566 |
| FERNANDO DOS SANTOS SILVA 90,00 · 07/11 | cliente | venda #11406 de **91,00** (04/11), receber 91 pago | devolução parcial (90 de 91)? |
| ROMULO OLIVEIRA DE CASTRO 101,00 · 07/11 | **sem cadastro** | — | sem compra pra casar |
| EMILY DE MENEZES PITTZER FIUZA 128,00 · 10/11 | **sem cadastro** | — | sem compra pra casar |
| RONI GOEBEL DA SILVA 400,00 · 13/11 | **sem cadastro** | — | sem compra pra casar |
| CLAUDIA VALERIA DE SOUZA ALMEIDA 425,00 · 13/11 | **sem cadastro** | — | sem compra pra casar |
| VITOR PORTO FIGUEIRA 210,00 · 19/11 | **sem cadastro** | — | sem compra pra casar |
| LUIZ DIEGO DOS SANTOS SILVA 77,00 · 21/11 | **sem cadastro** | — | sem compra pra casar |
| ENDRIELI DA SILVA FRANCA 83,00 · 02/11 | **sem cadastro** | — | nome da família do sócio? |

Total: R$ 1.759,00. Já lançado: **Bruno Delgado de Mattos 295,00** (21/11) como
`Devolução — Bruno Delgado de Mattos (compra devolvida)`, marcado para conferir se o
abatimento da venda #14401 está correto.

**Régua do app para devolução:** a descrição tem que começar com `Devolução — `
(a RPC `registrar_devolucao` grava assim e `lib/saldos-contas.ts` reconhece pelo
prefixo). A devolução de verdade passa pela tela **Devoluções** — ela baixa estoque,
devolve vale-crédito e amarra a venda. Lançar só o lançamento no Financeiro **não**
abate a venda nem o estoque: é o que a conferência de depois vai apontar.

## Lista de reembolsos do WhatsApp (export `INDRiQUE Proncipal`, 22/11)

Export do WhatsApp com os pedidos de reembolso de novembro, em `Downloads`.
**39 pedidos com valor, total R$ 5.526,90** (dois valores estão com erro de digitação
no chat: "221:00" = 221,00 e "6;00" = 6,00 — por isso a soma bruta do arquivo sai
errada). Motivos: cliente desistiu 227 no app; no chat predominam "não tinha a peça",
"não serviu", "desistiu", "peça errada".

Comparação com o app:

| | Quantidade | Valor |
|---|---|---|
| Reembolsos pedidos no chat | 39 | R$ 5.526,90 |
| Devoluções registradas no app em novembro (`devolucoes`) | 1.045 | R$ 84.017,69 |
| … dessas, com crédito em **dinheiro** | 5 | R$ 581,00 |
| … dessas, com crédito em **PIX** | 6 | R$ 383,00 |
| **Lançamentos `Devolução — …` pagos em novembro** | **7** | **R$ 678,00** |

**O buraco:** o banco pagou ~R$ 5,4 mil de reembolso em novembro e o Financeiro só
tem R$ 678,00 lançado como devolução. As devoluções estão registradas (a tela
Devoluções fez o trabalho), mas **o dinheiro que saiu não virou lançamento** — o
saldo das contas fica inflado e o DRE do mês não vê essa despesa.

Casos que merecem olho:
- **ASTEIN INFORMÁTICA / Ana Alice de Araújo Marques** — pedido **56,00**, pago
  **87,00** (PIX de 10/11). Sobrou **31,00** com ela; no próprio chat está escrito
  "Esse da Ana Alice era 56 só" e "vou pedir a ela pra fazer o valor de volta".
- **FERNANDO DOS SANTOS SILVA** — pedido 91,00, pago 90,00 (07/11).
- **SUPERCELL 45,00** (cliente cancelou) — não aparece PIX de 45,00 no extrato;
  confirmar se saiu por dinheiro/outra conta.
- **Claudia Valéria 425,00** (13/11) — é o **aluguel do sítio da confraternização**
  (metade de 850,00; a outra metade saiu em outubro). Lançado como Confraternização.

## Cruzamento dos estornos do WhatsApp com o app (22/11, só leitura)

39 pedidos de estorno (01–21/11) · R$ 5.526,90 conferidos contra `devolucoes`,
`lancamentos` e `vendas`.

| Veredito | Pedidos | Valor |
|---|---|---|
| ✔ devolução registrada **e** saída de dinheiro lançada | 1 | R$ 295,00 |
| ⚠ devolução registrada como **sem reembolso**, mas o dinheiro saiu | 18 | R$ 1.627,00 |
| ⚠ devolução registrada como **crédito em conta**, mas o dinheiro saiu | 4 | R$ 539,00 |
| ✖ **nenhuma** devolução registrada (só o PIX no banco) | 15 | R$ 2.836,90 |
| ✖ só a venda existe, devolução não | 1 | R$ 229,00 |

**Causa na tela (código, `app/painel/devolucoes/DevolucoesClient.tsx:419`):**
`tipo_credito: reembolso > 0.01 ? tipoCredito : 'cancelamento_fiado'` — se a
atendente **não digita o valor do reembolso**, a devolução é gravada como
"cancelamento de fiado" (ou "sem reembolso") e o RPC `registrar_devolucao` **só
cria o lançamento `Devolução — nome` quando o reembolso é maior que zero**.
Resultado: o cliente é pago por PIX no banco e o Financeiro não sabe — conta
inflada e despesa fora do DRE.

**Riscos medidos:**
- **4 casos com crédito em conta + dinheiro** (R$ 539,00): o cliente pode ter
  ficado com crédito **e** com o PIX — devolução paga duas vezes.
- 15 devoluções que só existem no WhatsApp: nada no app (nem estoque, nem crédito,
  nem saída de dinheiro). Ex.: Rodrigo Pereira 1.530,90 · HELP TESH 229,00 ·
  Emily 128,00 + 112,00 · Victor Afonso 100,00 · Loja Campista 120,00 ·
  Pedro Henrique Angelica Ferreira 221,00.
- **A venda não é cancelada** em nenhum caso — a devolução é tratada como
  devolução, que é o caminho certo; o furo é só a **forma do reembolso**.

**O que está certo no app:** a devolução baixa estoque pela movimentação, o fiado
devolvido é cancelado (651 registros `cancelamento_fiado`) e a tela recusa
reembolso acima do que a venda permite (RPC tem trava de excedente). O furo é
registrar a saída de dinheiro quando o pagamento acontece fora da tela.

## ✅ Estornos do WhatsApp lançados (22/11) e trava na tela

**Dado:** 34 lançamentos criados, categoria `Devolução ao cliente`, conta PagBank
Petrópolis, descrição `Devolução — <cliente> (estorno de compra)`, data = data da
devolução no app (ou a data do PIX, lida do extrato 01–21/11). Total **R$ 4.692,90**.
Backup e DESFAZER em `docs/registros-banco/2026-11/despesas-novembro-antes-2026-11-22T13-53-59-859Z.json`.

Resultado: lançamentos `Devolução — …` pagos em novembro foram de **7 · R$ 678,00**
para **41 · R$ 5.370,90**.

**Fora do plano, de propósito:**
| Cliente | Valor | Por quê |
|---|---|---|
| Igor Kreischer | 349,00 | já existe saída (`Estorno de crédito — devolução da venda #11282`) |
| SUPERCELL | 45,00 | devolução registrada como crédito em conta |
| Samira Amorim dos Reis | 4,00 | devolução registrada como crédito em conta |
| Larissa Playtec | 141,00 | tem crédito em conta **e** sem reembolso — risco de pagar 2x |
| Bruno Delgado de Mattos | 295,00 | já tinha lançamento |

**Código (não publicado):** `app/painel/devolucoes/DevolucoesClient.tsx` — quando a
devolução fica **sem valor de reembolso**, a tela agora avisa em vermelho que o app
**não vai lançar saída de dinheiro** e que, se o cliente recebeu por PIX/dinheiro, o
valor tem que ser preenchido. `npx tsc --noEmit` = 0. **Sem commit e sem deploy**
(trava do dono: só com a palavra-chave).



## ✅ Item 3 fechado (22/11) — retiradas de caixa de 03–05/11

O dono confirmou que **196, 87, 70 e 61 são correção** (pagamento duplicado, desconto que
virou dinheiro, quitação errada). Lançado com o de/para abaixo, **sem criar movimento novo
de caixa** (a saída já existia como retirada — os lançamentos foram ligados a ela):

| Lançamento | Valor | Dia | Categoria | Retirada ligada |
|---|---|---|---|---|
| Devolução — FABIANO DAS CHAGAS CHAVES | 350,00 | 03/11 | Devolução ao cliente | "venda fabiano" |
| Devolução — WM CELULARES | 62,00 | 03/11 | Devolução ao cliente | "venda wm" |
| Taxa — Jhonatan | 15,00 | 03/11 | despesas loja | "taxa jhonatan" |
| Motoboy — Felipe (loja errada) | 60,00 | 03/11 | motoboy | "felipe motoboy (erro loja)" |
| Quebra — PIX de 26,00 não localizado | 26,00 | 03/11 | Perda | "não localizei PIX de 26,00" |
| Quebra — falta de 76,00 na gaveta | 76,00 | 04/11 | Perda | "falta de 76,00" |
| Quebra — centavos (0,10 + 0,60 + 1 + 1) | 2,70 | 03–05/11 | Perda | "conexao", "quitado errado", "acerto cx" ×2 |

Total lançado: **R$ 591,70** · ligado às retiradas: **10 de 14** (R$ 591,70 dos R$ 1.005,70).

**Continuam sem destino, de propósito (R$ 414,00 = correção, não despesa):**
87,00 TOP CEL · 196,00 Carlos Henrique · 70,00 Thiago Salles · 61,00 Rodrigo Pereira.

**Caixa conferido depois do lançamento** (`scripts/conferencia-caixa.mjs 2026-11-03 2026-11-05`):
Petrópolis contado = esperado (diferença 0,00); Teresópolis sobra de R$ 5,00 no caixa de
03/11 (sobra já conhecida do registro de 07/11). Total: R$ 14.528,60 contado ×
R$ 14.523,60 esperado.

## Decisões fechadas (22/11, fim da rodada)

**1) Os 3 casos de vale-crédito — fechado: o crédito valeu, nada a lançar.**
VT CELL 100,00 · Arthur Dias Moura 55,00 · Larissa Playtec 141,00. Nos três o app tem
duas devoluções do mesmo valor no mesmo dia (uma `credito_conta`, outra `sem_reembolso`)
e o **crédito foi criado e consumido** (`creditos_clientes` com uso do mesmo valor). O
cliente recebeu em vale-crédito, então não há dinheiro a devolver. Os 3 lançamentos que
eu tinha criado foram removidos (backup `devolucao-duplicada-removida-*`).

**2) Os PIX "sem nome" — fechado: todos estão lançados, com o nome de fantasia do
cadastro.** ROMULO 101,00 = STAR MANUNTENÇÃO · VITOR PORTO 210,00 = SUPERCELL ·
LUIZ DIEGO 77,00 = Diego Santos · FERNANDO 90,00 = lançado como 91,00 (o chat pedia
91,00 e o PIX saiu 90,00 — **R$ 1,00 ficou com a loja**).

**3) Estoque das devoluções — vira contagem física, sem escrita automática.**
14 devoluções com dinheiro devolvido e **nenhum registro na tela Devoluções**
(R$ 3.096,90): Lucar Gabriel Dias 229,00 · Victor Afonso 100,00 · Raphael Vaz 195,00 ·
Pedro Henrique Angelica Ferreira 221,00 · Alvaro Garcia 10,00 · Emily 128,00 + 112,00 ·
Teremaqcell 87,00 + 15,00 · FINAL 65,00 · HELP TESH 229,00 · Diego Santos 141,00 ·
**RODRIGO PEREIRA 1.530,90** · Loja Campista 34,00. Se a peça voltou de verdade, ela não
entrou no estoque — precisa de contagem. Lançar devolução retroativa pela tela mexeria
no kardex de um mês em fechamento, então não fiz.

## Investigação das 14 retiradas de caixa (03–05/11, R$ 1.005,70)

Cruzado no app (movimentos do caixa × devoluções × vendas × lançamentos):

| Retirada | Motivo escrito no caixa | O que o app mostra | Proposta |
|---|---|---|---|
| 350,00 · PIX · 03/11 | "venda fabiano" | **devolução de FABIANO DAS CHAGAS CHAVES 350,00 em 03/11, forma `sem_reembolso`** | devolução ao cliente (o app registrou a devolução e não lançou o dinheiro) |
| 62,00 · PIX · 03/11 | "venda wm" | **devolução WM CELULARES 62,00 em 03/11, `sem_reembolso`** | devolução ao cliente |
| 196,00 · PIX · 03/11 | "pagou no cartão e quitaram no pix" | venda #11158 CARLOS HENRIQUE 196,00 paga; **sem devolução** | conferir: pagamento duplicado? |
| 61,00 · PIX · 05/11 | "rodrigo pereira (erro duda)" | venda #11167 RODRIGO PEREIRA 61,00; **sem devolução dele** | conferir: devolução dele? |
| 70,00 · Dinheiro · 03/11 | "quitei o cliente errado" | venda #11021 THIAGO SALLES 70,00; devoluções de 70 de outros clientes | correção de quitação |
| 87,00 · Dinheiro · 03/11 | "TOP CEL quitado como dinheiro, mas era desconto" | nenhuma devolução de 87 da TOP CEL no dia | correção (desconto), não despesa |
| 15,00 · Dinheiro · 03/11 | "taxa jhonatan" | nada com esse nome/valor além de vendas de 15 | despesa (taxa) |
| 60,00 · Dinheiro · 03/11 | "felipe motoboy (erro loja)" | venda #10905 AD CELL 60,00; sem devolução de 60 | despesa (motoboy) |
| 76,00 · Dinheiro · 04/11 | "falta de 76,00 em caixa físico" | devoluções de 76 de outros clientes no dia | **perda** (quebra) |
| 26,00 · PIX · 03/11 | "não localizei PIX de 26,00" | devoluções de 26 no dia (outros clientes) | **perda** (quebra) |
| 0,10 · 0,60 · 1,00 · 1,00 | "conexão", "quitado errado", "acerto de caixa" | nada | perda de centavos |

Total: 350 + 62 + 196 + 61 + 70 + 87 + 15 + 60 + 76 + 26 + 2,70 = **R$ 1.005,70** ✔

**O que a investigação confirma:** duas retiradas (350,00 e 62,00) são **devoluções de
compra pagas em dinheiro da gaveta** que o app registrou como `sem_reembolso` — a mesma
falha dos 34 estornos corrigidos hoje. As outras são correção de pagamento, quebra de
caixa, taxa e motoboy.

| # | Resposta | Efeito |
|---|---|---|
| 1 | Aluguel Petrópolis **não é parcela** — é aluguel mensal por tempo indefinido | corrigir a descrição `(3/4)`; é a linha de novembro |
| 4 | Receita Federal → **Impostos**, não importa qual | categoria `Impostos` |
| 7 | Águia Branca → **sempre passagem de ônibus para São Paulo** | categoria `Gastos em São Paulo`, subcategoria `Passagem` |
| 8 | Supercabo 96,69 → **gasto particular do Indrique** | categoria `Retirada do sócio` |
| 9 | Cef Matriz → **não sabe** | segue aberto |
| 10 | PagBank Saúde/seguro → **cancelou agora** | lançar as duas de novembro e não repetir |
| 11 | Pix Marketplace 296,00 → **compra para a loja no Mercado Livre** | categoria `despesas loja` |
| 12 | Recarga cartão pré-pago 300,00 → **uso interno da loja, material em geral** | categoria `despesas loja` |
| 13 | Indrique 5.976,00 → **pró-labore do Indrique Gomes França** | categoria `Retirada do sócio` (mesma régua do pró-labore de outubro) |
| 15 | Isabela 461,88 → **não sabe**; o combinado dela seria 5.000,00/mês | segue aberto |
| 16 | João Vítor 2.040,00 → **pode ser várias coisas** | abrir PIX por PIX |
| 17 · 18 | **precisa separar** para ver o que é | abrir pessoa por pessoa |
| 19 | CDB → **dinheiro do mês passado reservado para pagar metas e comissão** | não é despesa |

## Item 1 — aluguel Petrópolis × extrato (✅ LANÇADO 22/11)

Linha pendente no app: `aluguel loja petropolis (3/4)` · R$ 2.600,00 · venc. 30/11 ·
conta "PIX" (inativa). Extrato: PIX de 2.600,00 para Edson Canedo em 03/11.

Feito: **baixa** com data 03/11 · forma PIX · conta PagBank Petrópolis · descrição
`Aluguel loja Petrópolis — novembro/2026` (id `d174cebe-3904-4c3c-892f-8cb87666a2bd`).
O dono confirmou que é aluguel mensal, não prestação.
Ferramenta: `scripts/baixar-lancamento-novembro.mjs`.

Continua aberto: **aluguel de Teresópolis** em novembro — o extrato do PagBank não
tem nenhum PIX para lá; precisa saber de onde sai.

## Lançamentos feitos nesta rodada (22/11)

| Item | Descrição | Valor | Dia | Categoria | Prova |
|---|---|---|---|---|---|
| 1 | Aluguel loja Petrópolis — novembro/2026 | 2.600,00 | pago 03/11 | Aluguel | `d174cebe…` (baixa de linha que já existia) |
| 2 | Energia/Luz — Enel Distribuicao Rio — novembro/2026 | 549,43 | pago 07/11 | Energia/Luz | `1dc25316-cd4a-4d5c-a88e-da812a76d5d4` |
| 3 | Honorários advogado — Monteverde & Miller — **outubro/2026** | 810,50 | pago 05/11 | **Jurídico** | `1e233c2e-401f-4e81-b706-9f2f0baf438d` |
| 4 | Contabilidade — Royal Contabilidade — novembro/2026 | 1.530,00 | venc. 30/11 **pendente** | Contabilidade | `4224c967-e74f-44f5-bc88-31427fa004e4` |
| 5 | Honorários advogado — Monteverde & Miller — **novembro/2026** | 810,50 | venc. 30/11 **pendente** | Jurídico | `85c48463-2c13-466d-adfa-2569bb494b11` |

Categoria **Jurídico** criada e incluída na lista de despesas fixas do Fluxo
(`configuracoes.planejamento` = Salários · Aluguel · Energia/Luz · Impostos ·
Contabilidade · Jurídico, margem 10). Backup e DESFAZER em `docs/registros-banco/2026-11/`.

**Correção de rota no caminho:** o formulário do app grava `data_pagamento = hoje`.
Nas linhas backdated (extrato de 05 e 07/11) isso punha a saída no dia 22/11.
As duas foram corrigidas para o dia real do extrato; o script de lançamento agora
usa o dia informado (`data_pagamento = dia`), não `new Date()`.

### Segunda leva (mesma rodada, aprovada pelo dono)

| O que | Valor | Dia | Categoria | Linhas |
|---|---|---|---|---|
| Impostos — Receita Federal (3 guias) | 655,10 | 19/11 | Impostos | `bba16a58…` |
| Combustível — Posto Barra | 79,19 + 113,87 + 220,41 | 05, 11, 20/11 | Combustível | `afe63c67…` `bf0a40f7…` `33e764c1…` |
| Alimentação — Armazém do Grão | 50,65 + 140,70 | 04, 14/11 | Alimentação | `264176ef…` `bcaf5f82…` |
| Confraternização — Dom Atacadista | 1.281,00 | 13/11 | Confraternização | `92ac8c2d…` |
| Passagens São Paulo — Águia Branca | 345,18 + 406,26 | 03, 17/11 | Gastos em São Paulo | `9093bd8b…` `b5bda9a3…` |
| Gasto particular do sócio — Supercabo | 96,69 | 11/11 | Retirada do sócio | `8f20d458…` |
| Compra para a loja — Mercado Livre | 296,00 | 10/11 | despesas loja | `3080d556…` |
| Recarga de cartão pré-pago (material da loja) | 300,00 | 13/11 | despesas loja · sem conta | `dbfe7087…` |
| Pró-labore — Indrique Gomes França | 5.976,00 | 20/11 | Retirada do sócio | `f9f923ff…` |
| Contas do sócio — Luiza Lopes Neves · Leoni De Souza Azevedo | 1.499,78 + 500,00 | 02/11 | Retirada do sócio | `cbdfef0c…` `259ea06a…` |
| Complemento da parcela 01/10 da Isabela | 461,88 | 02/11 | Outras despesas | `0c170134…` |
| Salário João Vítor — 5 adiantamentos | 107,00 + 230,00 + 504,50 + 638,50 + 560,00 | 02–18/11 | Salários | `150ac773…` `62dcfc36…` `1e618618…` `adc8931a…` `e7d35e45…` |
| Comissão 19/11 (6 pessoas) | 363·3 + 457·3 = 2.460,00 | 19/11 | Comissão | `591915c6…` `775de82d…` `0a8dd180…` `879c2b0e…` `ea0f1083…` `2bc6aec2…` |
| 13º salário — 1ª parcela (metade, resto em 15/12) | 135,08 · 233,75 · 270,17 · 607,88 · 1,59 | 15–16/11 | Salários | `43fb0c71…` `354f48d6…` `fe658b24…` `0b7a6093…` `1cdab68e…` |
| Motoboy — Lucas da Silva Mello · Giovane Rego da Silva | 670,00 + 725,00 | 21/11 | motoboy | `4182f8d0…` `9487961a…` |
| Devolução — Bruno Delgado de Mattos | 295,00 | 21/11 | Devolução ao cliente | `1da53a90…` |
| Confraternização — transporte — Roni Goebel da Silva | 400,00 | 13/11 | Confraternização | `4fa61213…` |
| Complemento das contas de Teresópolis — Endrieli Da Silva Franca | 83,00 | 02/11 | Outras despesas | `a67b80ad…` |
| Confraternização — aluguel do sítio (2ª de 2; a 1ª saiu em outubro) — Claudia Valéria de Souza Almeida | 425,00 | 13/11 | Confraternização | `e0a6b873…` |
| Tarifas PagBank (Saúde + seguro, cancelados) | 24,90 + 7,90 | 19, 20/11 | **Tarifas bancárias** | `ac078275…` `5d2d9d9c…` |
| FGTS — guias Caixa (CEF) | 99,86 (15/11) + 400,99 (19/11) | 15, 19/11 | Impostos | `1309c6da…` `1458df17…` |

**Salário de João Vítor:** a linha mensal de 30/11 encolheu de 2.150,00 para **110,00**
(`Salário novembro/2026 — complemento`, R$ 2.040,00 adiantados) — total do mês dele
volta a 2.150,00 exatos. O que passar de 2.150 vira Bônus (regra do dono).

**Extrato: o que ficou de fora de propósito**
- **Cef Matriz 500,85** (15 e 19/11) — o dono acha que é imposto do governo e vai
  buscar os comprovantes.
- **8 dos 10 PIX sem nome** (Romulo, Emily, Claudia, Vitor Porto, Luiz Diego,
  Fernando 90, Vitor Da Silva 224, Anderson 21) — parados a pedido, na lista de
  conferência.
- **CDB** (aplicação 11.890 / resgate 11.322,09) — dinheiro guardado para metas e
  comissão, não é despesa.



## Item 1 — despesas fixas: referência do banco (só leitura, 21/11)

Novembro hoje tem **1** despesa fixa lançada: aluguel Petrópolis R$ 2.600,00
(parcela "3/4", vence 30/11, **pendente**). Outubro, para referência:

| Categoria | Outubro | Novembro |
|---|---|---|
| Aluguel | 2 linhas · 5.238,00 | 1 linha · 2.600,00 pendente (só Petrópolis) |
| Contabilidade | 1.530,00 | 0 |
| Impostos (DAS/Simples) | 1.717,55 | 0 |
| Energia/Luz | 621,21 | 0 |
| Água · Internet · Segurança · Software | não lançado em outubro também | 0 |
| Retirada do sócio | 4.800,00 (3) | 0 |

### Régua de referência (como cada fixa foi lançada antes)

Fonte: `lancamentos` tipo `pagar`, jun–nov/2026. Serve para eu propor a linha
exata assim que o dono disser valor e dia.

| Despesa | Último lançamento | Descrição/categoria usada | Fornecedor | Forma |
|---|---|---|---|---|
| Aluguel Petrópolis | 30/10 pago · 2.600,00 (2/4) | `aluguel loja petropolis (n/4)` · Aluguel | Edson Canedo | PIX |
| Aluguel + luz + net Teresópolis | 31/10 pago · 2.638,00 (out/2026) | `Aluguel + luz + net — Teresópolis — mês/ano` · Aluguel | — | PIX |
| Aluguel/despesas Tere (mês anterior) | 30/09 pago · 2.446,81 | `ALUGUEL E DESPESAS LOJA TERE` · Outras despesas | ALUGUEL LOJA | PIX |
| Internet Teresópolis | 30/09 pago · 130,00 | `INTERNET NIO` · Outras despesas | NIO FIBRA | PIX |
| Energia Petrópolis | 08/10 pago · 621,21 | `Energia/Luz — Enel …` · Energia/Luz | Enel Distribuicao Rio | — |
| Contabilidade | 13/10 pago · 1.530,00 | `Contabilidade — Royal …` · Contabilidade | Royal Contabilidade | — |
| Advogado | 30/09 pago · 892,09 | `Honorários advogado` · Contabilidade | Monteverde & Miller | PIX |
| FGTS/imposto | 30/10 pago · 1.717,55 | `FGTS rescisório — Nome (competência …)` · Impostos | pessoa | PIX |
| Pró-labore | 31/10 pago · 4.000,00 | `Pró-labore mês/ano — Indrique Gomes França` · Retirada do sócio | Indrique Gomes França | PIX |
| Recarga celulares | 30/09 pago · 100,00 | `RECARGA CELULARES PELA NUBANK DA ISA` · Outras despesas | RECARGA | PIX |
| Sistema/software do app | 31/10 pago · 1.000,00 | `Freelance — João Vítor — app TecnoCell` · Freelancer | João Vítor Maximiano França | PIX |

Perguntas abertas do item 1 (uma resposta por linha): valor · saiu em que dia ·
loja · forma · pago ou pendente. Nada é lançado sem isso.

## Como eu lanço (ferramenta pronta, DRY)

`scripts/lancar-despesas-novembro.mjs` — ensaio por padrão, só grava com `--gravar`
depois do "ok" do dono. Faz o mesmo que o formulário do Financeiro
(`criarLancamento`), que é o caminho que não cria buraco no caixa:

1. valor > 0;
2. pago sem conta → conta pela forma (`lib/conta-da-forma.ts`): dinheiro = gaveta,
   PIX/cartão = conta da forma, sem destino = banco ativo da loja;
3. pago em **dinheiro** sem conta → grava a **retirada no caixa aberto** da loja
   (`lib/caixa.ts`), senão o fechamento acusa "saíram R$ X do caixa sem destino";
4. confere a gaveta antes (RPC `calcular_valor_esperado`) e avisa se a saída passa
   do que tem;
5. não duplica: pula descrição + vencimento que já existem;
6. com `--gravar`: backup JSON + `DESFAZER-*.sql` em `docs/registros-banco/2026-11/`.

Testado em ensaio (uma despesa PIX → conta da loja; uma em dinheiro → retirada na
gaveta de Teresópolis). Plano de teste apagado.

## Item 3 — as 14 retiradas sem destino (card pronto, aguarda "ok")

Dinheiro que saiu da gaveta e não tem despesa no Financeiro. Total
**1.005,70** (03 a 05/11). Classificação proposta por mim, **não lançada**:

| Dia | Valor | Forma | Motivo escrito no caixa | Proposta |
|---|---|---|---|---|
| 03/11 | 15,00 | Dinheiro | taxa jhonatan | despesa "Taxa — Jhonatan" |
| 03/11 | 60,00 | Dinheiro | felipe motoboy (erro loja) | despesa motoboy (Felipe) |
| 03/11 | 87,00 | Dinheiro | TOP CEL quitado como dinheiro mas era desconto | **correção** — devolver à gaveta (reforço) ou lançar desconto |
| 03/11 | 0,10 | PIX | conexao | quebra/ajuste de 10 centavos |
| 03/11 | 350,00 | PIX | venda fabiano | saída de venda — precisa achar a venda |
| 03/11 | 62,00 | PIX | venda wm | saída de venda — precisa achar a venda |
| 03/11 | 196,00 | PIX | pagou no cartão e quitaram no pix | saída de venda — precisa achar a venda |
| 03/11 | 26,00 | PIX | PIX de 26,00 não localizado | quebra de caixa / perda |
| 03/11 | 70,00 | Dinheiro | quitei o cliente errado | **correção** — estorno de quitação |
| 04/11 | 0,60 | PIX | quitado errado (Rodrigo) | correção de 60 centavos |
| 04/11 | 76,00 | Dinheiro | falta de 76,00 em caixa físico | quebra de caixa / perda |
| 04/11 | 1,00 | Dinheiro | acerto cx | ajuste de R$ 1,00 |
| 05/11 | 61,00 | PIX | Rodrigo Pereira (erro da Duda) | ver se é venda ou estorno |
| 05/11 | 1,00 | PIX | acerto cx | ajuste de R$ 1,00 |

Decisão que só o dono toma: quais dessas são **despesa de verdade** (motoboy,
taxa), quais são **correção** (dinheiro voltou ou venda foi quitada errado) e
quais são **quebra de caixa**. Sem essa resposta nada é lançado.

### Evidência achada no banco (21/11, só leitura)

Procurei a venda do dia, na mesma loja, com o mesmo valor da retirada:

| Retirada | Evidência | Leitura |
|---|---|---|
| 350,00 "venda fabiano" | venda #11089 e #11150, FABIANO DAS CHAGAS CHAVES, 350,00 | é a venda do Fabiano |
| 62,00 "venda wm" | venda #11148, WM CELULARES, 62,00 | é a venda da WM |
| 196,00 "pagou no cartão e quitaram no pix" | venda #11158, CARLOS HENRIQUE MARQUES FIUZA, 196,00 | é a venda do Carlos Henrique |
| 61,00 "Rodrigo Pereira" | vendas #11167 e #11511, RODRIGO PEREIRA, 61,00 | é a venda do Rodrigo Pereira |
| 70,00 "quitei o cliente errado" | venda #11021, THIAGO SALLES FERNANDES, 70,00 | quitação do Thiago Salles |
| 87,00 "TOP CEL quitado como dinheiro" | **nenhuma** venda de 87,00 da TOP CELULARES no dia | falta identificar |
| 15,00 "taxa jhonatan" | várias vendas de 15,00 — não dá para nomear | falta identificar |
| 60,00 "felipe motoboy" | vendas de 60,00 existem, mas o motivo é motoboy | parece despesa, não venda |
| 76,00 "falta de 76,00 em caixa físico" | o próprio motivo diz que é falta | quebra de caixa |
| 26,00 "não consegui localizar PIX" | o próprio motivo diz | quebra de caixa |
| 0,10 · 0,60 · 1,00 · 1,00 | "conexao", "quitado errado", "acerto cx" | ajuste de centavos |

Pergunta enxuta do item 3: as 4 primeiras são "dinheiro da venda que saiu da
gaveta" (então é correção, não despesa)? A 87,00 da TOP CELULARES e a 15,00 da
taxa são o quê? As duas quebras (76,00 + 26,00) entram como perda?

## Item 2 — folha e encargos (medido 21/11, só leitura)

Folha semanal de novembro está lançada nas 5 semanas: 07/11 R$ 5.723,62 · 14/11
R$ 4.160,62 · 16/11 R$ 5.899,62 · 21/11 R$ 4.160,62 (pendente) · 28/11
R$ 4.160,62 (pendente). Semanal: Erick Alves de Mattos, Brunna Furtado Gonçalves,
Nikollas Bernardo Leocadio, Mariana Vila Real Castelli, Maria Eduarda Kappler da
Silva (Petrópolis) e Isaac Bento Morelli (Teresópolis), mais Lucas da Silva Mello
e Giovane Rego da Silva (Teresópolis) nas semanas 07 e 16.

Mensais de 30/11 (pendentes): Leticia de Oliveira Amaro 1.621 · Rodrigo Carvalho
de Rezende Junior 1.621 · Vitória Ranyelle de Paiva Silva 1.621 · Isabella Beatriz
Ferreira de Assumpcao 1.870 (bruto) · João Vítor Maximiano França 2.150 ·
bolsa estágio Maria Julia de Souza Ferreira Carvalho 700. Vale transporte de
dezembro vencendo 30/11: 295 + 295 + 270 + 270 + 270.

**Duas dúvidas abertas do item 2 (só o dono responde):**

1. **Comissão 0,5% de outubro** — 6 linhas pendentes, R$ 1.852,80, escritas
   "ajustar em 20/11". O dia passou: valor é esse ou manda o ajustado?
2. **Lucas da Silva Mello e Giovane Rego da Silva** não têm linha nas semanas
   14/11 e 21/11 (as duas de 6 linhas). Foi folga/desligamento, ou falta lançar?

## Item 4 — custo variável: outubro × novembro (card pronto, aguarda valor)

O que saiu em outubro e não tem nada lançado em novembro:

| Categoria | Outubro | Novembro |
|---|---|---|
| Freelancer | 1.146,00 (3) | 0 |
| Manutenção | 590,00 (2) | 0 |
| Alimentação | 500,32 (3) | 0 |
| Combustível | 160,03 | 0 |
| Gastos em São Paulo | 878,68 (2) | 0 |
| Limpeza | 49,00 | 0 |
| Saúde (exame ocupacional) | 40,00 | 0 |
| Vendas (descontos/ajustes de loja) | 862,20 (9) | 0 |
| Serviços | 443,98 (4) | 70,00 (motoboy, pago) |
| motoboy | 90,00 | 417,50 (pago) |

O de/para continua o mesmo: valor · dia · loja · forma · pago/pendente. O que não
teve em novembro o dono diz "não teve" e o item fecha.

## Item 6 — número do dia 21/11 (para o fechamento)

Foto de partida gerada com a ferramenta que já existe (`scripts/conferir-mes.mjs
2026-11`, só leitura, grava `docs/fechamento/2026-11/app.json`). É o "antes": cada
item lançado tem que mover esses números.

| | Petrópolis | Teresópolis |
|---|---|---|
| Entradas (pagamentos "pago" das vendas) | 34.815,39 | 7.993,40 |
| Fiado cobrado | 82.484,28 | 95.568,09 |
| Compras (notas de entrada) | 132.272,81 | 110.068,89 |
| Despesas pagas no mês | 109.952,61 | 104.863,19 |
| Dinheiro em mãos | 5.045,63 | 9.582,40 |

A pagar em aberto no app: R$ 226.638,41 (81 notas) · fiado em aberto
R$ 44.242,22 (523 notas) · 50 caixas no mês.

**Convenção conferida (não é defeito de novembro):** a maior parte das linhas de
`pagamentos_venda` nasce `pendente` — setembro 3.277 de 3.987, outubro 4.958 de
5.942, novembro 3.098 de 3.747. Mesmo padrão em mês já fechado e auditado, então
a "entrada" do mês não é só essa coluna. Fica anotado em "Depois"; não se mexe.

Além dos números de referência por vencimento:

| Entrou / saiu no mês | Valor |
|---|---|
| Vendas concluídas 01–21/11 | R$ 317.328,05 (3.665 vendas) |
| A pagar com vencimento em novembro (tudo) | R$ 414.291,98 (799 linhas) |
| A pagar com vencimento em novembro fora de mercadoria/vale-crédito | R$ 55.880,50 (78 linhas) |

Serve só de referência: muda a cada item lançado.

### Onde o dinheiro deveria estar (app, 21/11) — e o tamanho do buraco

Movimento de novembro por conta, pela régua do app (`lib/saldos-contas.ts`), só leitura:

| Conta | App diz | Comparação | Buraco |
|---|---|---|---|
| PagBank Petrópolis | 48.799,69 | dono informou **59,23** em 09/11 | ~+48.740 no app |
| Cofre Petrópolis | 12.063,19 | dono informou **1.168,00** em 09/11 | ~+10.895 no app |
| Cofre Teresópolis | 2.646,30 | dono informou **2.553,00** em 09/11 | ~+93 (perto) |
| Caixa Petrópolis | 19.983,30 | a gaveta é fundo de troco | precisa olhar |
| Caixa Teresópolis | 20.248,30 | a gaveta é fundo de troco | precisa olhar |

Leitura: a diferença grande está em **banco e cofre de Petrópolis** — dinheiro que
saiu de lá e não virou despesa no app. É exatamente o que o item 1 fecha. O jeito
curto de nomear cada saída é o **extrato do PagBank de novembro** (print ou
arquivo serve).

## Item 5 — o que ENTROU (medido 01–21/11, só leitura)

| Fonte | Número |
|---|---|
| Vendas concluídas | 3.665 · R$ 317.328,05 |
| A Receber quitado | 2.832 linhas · R$ 234.401,75 (PIX 136.169,73 · sem forma 42.860,02 · dinheiro 40.609,50 · vale-crédito 13.108,00) |
| Movimentos de caixa recebimento | PIX 132.095,33 · dinheiro 43.334,14 · outros pequenos |
| Reforços | PIX 1.333,49 · dinheiro 733,60 |
| Comprovantes PIX do Telegram | 1.260 · R$ 173.875,71 (extraídos 1.219 · data divergente 9 · apagados 26 · ilegíveis 2 · não-comprovante 4) |

Pergunta do item 5: existe entrada que **não** é venda nem fiado —
aporte do sócio, empréstimo, repasse da outra loja, venda de bem? Se existir,
entra aqui; se não existir, item 5 fecha como "nada a lançar".

## Depois (fora do escopo — não mexer agora)

- Retiradas de caixa sem destino no histórico antigo (65 anteriores a 06/11) —
  já registrado como aviso, não bloqueia.
- "PAGAMENTO DE MERCADORIA" sem categoria (13 linhas, R$ 8.797,10 em novembro) —
  é convenção do app, conferir depois do fechamento.
- "Vale crédito usado" (470 em novembro) — regra conhecida, não é despesa
  a lançar.
- `pagamentos_venda` nasce quase toda `pendente` (~83% em set/out/nov). Convenção
  do app, mês fechado repete o padrão — não é pendência de novembro.
- **Tentar descobrir a despesa faltante pelos comprovantes do bot não fecha.** Em
  novembro foram 1.261 comprovantes: 188 são conta própria (R$ 26.392,97) e o resto
  se divide em 20 destinatários, dominado por STOR ONE LTDA (673 PIX, R$ 93.270,54 —
  é pagamento de mercadoria da H2O). Casar PIX com lançamento por valor/data gera
  muito falso negativo (vale-crédito, desconto, devolução). Esse caminho precisa da
  planilha do fornecedor, não do palpite. Registrado para quando abrir.

## Log

- 21/11 — rodada aberta. Raio-x de novembro feito (só leitura). Item 1 aberto.
- 21/11 — régua de referência das fixas levantada (jun–nov). Item 1 esperando
  valor/dia de cada fixa. Nada lançado ainda.
- 21/11 — item 3 mapeado (14 retiradas, 1.005,70, com proposta de classificação)
  e item 5 medido (vendas 317.328,05 · A Receber 234.401,75 · PIX do bot
  173.875,71). Nada lançado: os dois esperam decisão do dono.
- 21/11 — item 2 medido: folha das 5 semanas lançada; abertas a comissão 0,5%
  de outubro (1.852,80) e as 2 semanas de Lucas da Silva Mello/Giovane Rego da
  Silva.
- 21/11 — item 6 ganhou a foto de partida (`conferir-mes.mjs`, saída em
  `docs/fechamento/2026-11/app.json`); conferida a convenção `pendente` das
  vendas (mesmo padrão de setembro/outubro).
- 21/11 — ferramenta de lançamento criada (`scripts/lancar-despesas-novembro.mjs`,
  ensaio por padrão, backup + DESFAZER) e testada em ensaio: PIX resolve conta da
  loja, dinheiro resolve retirada na gaveta. Nada gravado.
- 21/11 — contas por conta medido (só leitura): PagBank no app 48.799,69 contra
  59,23 ditos pelo dono em 09/11; cofre Petrópolis 12.063,19 contra 1.168,00. O
  buraco é saída de banco/cofre sem despesa lançada.
- 21/11 — tentada a rota "descobrir a despesa pelos comprovantes do bot": NÃO
  fecha (ver "Depois"). Parado de propósito, sem gastar mais tempo nela.
- 21/11 — item 3 ganhou evidência: 5 das 14 retiradas casaram com venda do dia
  (Fabiano 350, WM 62, Carlos Henrique 196, Rodrigo Pereira 61, Thiago Salles 70);
  faltam identificar a de 87,00 (TOP CEL) e a de 15,00 (taxa).
- 21/11 — item 4 ganhou o card out×nov (freelancer, manutenção, alimentação,
  combustível, SP, limpeza, saúde, vendas, serviços).
- 21/11 — extrato PagBank (Downloads) analisado: 130 saídas, R$ 60.387,51; 70 casam
  com o app (R$ 20.959,85) e **60 não têm lançamento (R$ 39.427,66)**, agrupadas em
  A (conhecidas), B (pessoas), C (sem nome), D (CDB não é despesa). Item 1 abriu
  pela linha do aluguel Petrópolis (2.600,00 de 03/11, já existente e pendente no app).
- 23/11 — as três contas pessoais que estavam em `Retirada do sócio` viraram
  `Particular` (1.499,78 Luiza Lopes Neves · 500,00 Leoni De Souza Azevedo · 96,69
  Supercabo TV = **R$ 2.096,47**), por `scripts/passar-particular.mjs --gravar`, com
  backup e DESFAZER em `docs/registros-banco/2026-11/`. É rótulo: nenhum valor, data,
  forma ou conta mudou e a despesa do mês continua igual. `Retirada do sócio` de
  novembro ficou R$ 0,00 e a aba `/painel/particular` passou a mostrar
  pró-labore 5.976,00 − contas 2.096,47 = **sobra R$ 3.879,53**.
- 23/11 — a aba Particular mostrava vencimento um dia antes (conta de 02/11 aparecia
  como 01/11): `data_vencimento` é `timestamptz` e data pura entra como meia-noite UTC,
  que em São Paulo é 21h do dia anterior; o `formatDate` tratava como instante. Corrigido
  na raiz (`lib/utils.ts`), com 5 testes novos, no ar em `868b4cb`. Conferido na tela:
  02/11 · 02/11 · 11/11 · 20/11.
- 23/11 — Banco Original R$ 10.000, DPVAT/licenciamento HPG-8E31 R$ 299,24 e acordo
  135/2026 **não existem** em `lancamentos` nem em `movimentos_caixa` (varredura por
  descrição e motivo); nota fiscal de troca é documento do fornecedor, sem valor a
  lançar. Os quatro saíram da lista de pendências.
- 23/11 — a devolução de 12/11 da estagiária Maria Julia de Souza Ferreira Carvalho
  (venda #12938, TAG RASTREADORA A'GOLD TCD-06F, R$ 65,00, PIX pago em 11/11) foi
  registrada `sem_reembolso` **com o item em `ok`** — status de "peça boa, volta a
  vender". A peça estava **quebrada** (ela quebrou sem querer) e por isso voltou ao
  estoque da loja: 3 unidades, uma imprestável. Corrigido com
  `scripts/baixar-tag-quebrada.mjs --gravar`: baixa de 1 unidade como **perda**
  (operação do próprio estoque, entra no livro-razão) e item da devolução em `avaria`.
  Estoque da loja: 3 → 2. Backup e DESFAZER em `docs/registros-banco/2026-11/`.
  Dinheiro: os R$ 65,00 seguem pagos na venda e não houve saída no caixa em 12/11 —
  nenhum lançamento criado. A tela de devolução não oferece "peça quebrada", só
  `OK · Venda` e `Troca · Saída`; é o furo que deixou a peça voltar para vender.
