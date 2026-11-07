# Relatório Pix do Telegram — 01/10/2026 a 01/11/2026

Fonte: tabela `comprovantes_pix` (Supabase, projeto `rbjwbfkhebaschiqda`), escrita pelo bot
de comprovantes do Telegram (`app/api/telegram/comprovante/route.ts`).
Gerado em 01/11/2026. Reproduzir: `node scripts/pix-total.mjs`. Cadastro das chaves: `lib/pix-chaves.ts`.

## Total do período

**R$ 258.996,55** em **1.904 comprovantes**.

Critério: cada Pix (ID de transação / E2E) contado **uma vez**, mesmo que tenha sido postado
mais de uma vez no grupo ou nos dois grupos.

## Chaves cadastradas (nome fantasia)

| Nome fantasia | Nome social / favorecido | Tipo | Chave Pix |
|---|---|---|---|
| H2O | STOR ONE LTDA | CNPJ | 67.262.680/0001-92 |
| Tecnocell Petrópolis | 38.216.415 JOAO VITOR MAXIMIANO FRANCA | CNPJ | 38.216.415/0001-70 |
| ADL | ARMAÇÃO LONGITUDE COMERCIO LTDA | Celular | 11959507410 |
| INOVA | ATRATIVA ACESSÓRIOS PARA CELULARES EIRELI | E-mail | atrativaacessorioss@gmail.com |
| ZL | FERNANDES DA SILVA REPRESENTAÇÃO COMERCIAL SJC LTDA — ou PLANORH PLANEJAMENTO E ORGANIZAÇÃO — ou FERREIRA E FERREIRA CONSULTORIA EMPRESARIAL EIRELI | CNPJ | 17.966.582/0001-68 |
| Isabela Ponciano | ISABELA PONCIANO CÂMARA | Celular | 24993117516 |
| PLANETA | PLAY CELL CELULARES | E-mail | planeta272026@outlook.com |
| — (sem cadastro) | IG FRANÇA COMÉRCIO E SERVIÇO LTDA | — | — |
| — (sem cadastro) | JOÃO VICTOR DO NASCIMENTO SALGUEIRO | — | — |

## Totais por chave

| Nome fantasia | Recebedor no comprovante | CNPJ | Comprovantes | Total (R$) |
|---|---|---|---|---|
| H2O | STOR ONE LTDA | 67.262.680/0001-92 | 965 | 121.640,24 |
| Tecnocell Petrópolis | JOÃO VITOR MAXIMIANO FRANÇA | 38.216.415/0001-70 | 568 | 74.338,29 |
| ADL | ARMAÇÃO LONGITUDE COMERCIO LTDA | 64.486.787/0001-26 | 191 | 26.919,15 |
| INOVA | ATRATIVA ACESSÓRIOS PARA CELULARES | 37.010.872/0001-40 | 70 | 15.145,40 |
| ZL | FERNANDES DA SILVA REPRES. SJC (+ PLANORH, + FERREIRA E FERREIRA) | 17.966.582/0001-68 | 68 | 13.904,00 |
| Isabela Ponciano | ISABELA PONCIANO CÂMARA | 54.870.178/0001-12 | 30 | 5.872,47 |
| — | IG FRANÇA COMÉRCIO E SERVIÇO LTDA | 39.682.023/0001-69 | 6 | 572,00 |
| — | JOÃO VICTOR DO NASCIMENTO SALGUEIRO | (não lido) | 1 | 350,00 |
| PLANETA | PLAY CELL CELULARES | 03.111.659/0001-03 | 5 | 255,00 |
| | **TOTAL** | | **1.904** | **258.996,55** |

Notas por chave:

- **ZL**: os 3 favorecidos do CNPJ 17.966.582/0001-68 são a mesma conta. Dentro dos R$ 13.904,00
  estão 2 comprovantes lidos como "PLANORH" (R$ 2.100,00 em 14/10 + R$ 1.550,00 em 20/10).
- **Isabela Ponciano**: não é venda — é a dívida da loja paga em parcelas. Os comprovantes de
  outubro foram pagos por clientes direto na conta dela (31 mensagens; 1 era reenvio, por isso 30 contam).
- **Tecnocell Petrópolis**: chave oficial da loja (CNPJ 38.216.415/0001-70, PagBank), usada pra
  pagar salário, aluguel e despesas. Recebeu R$ 74.338,29 no período (568 comprovantes).
  Os comprovantes dessa chave aparecem nos **dois** grupos do Telegram.
- **H2O**: inclui 3 comprovantes com nome mascarado no recibo ("STOR *** ****"), R$ 270,00,
  identificados pelo CNPJ truncado.
- **Tecnocell Petrópolis**: inclui 2 comprovantes mascarados ("38.216.415 ****..."), R$ 258,00.
- **INOVA**: inclui 1 comprovante mascarado, R$ 88,00.
- **JOÃO VICTOR DO NASCIMENTO SALGUEIRO** é outra pessoa — não confundir com o João Vitor da
  chave Tecnocell Petrópolis.

## Por grupo do Telegram

| Grupo (chat_id) | Comprovantes | Total (R$) |
|---|---|---|
| -5388974048 | 1.070 | 139.389,13 |
| -5518480222 | 834 | 119.607,42 |

Qual grupo é Petrópolis e qual é Teresópolis **não está no banco** — vem das variáveis
`TELEGRAM_GRUPO_PETROPOLIS` / `TELEGRAM_GRUPO_TERESOPOLIS` (Vercel e `.env.local` da loja).

## O que ficou fora do total

| Motivo | Comprovantes | Valor (R$) |
|---|---|---|
| Mesmo Pix lançado 2x (mesmo E2E) | 18 casos / 18 linhas extras | 2.823,70 |
| Apagados do grupo no Telegram | 25 | 1.756,50 |
| Sem destinatário (IA não leu) | 2 | sem valor lido |

Detalhe dos 18 duplicados (a planilha do bot soma as duas vias; aqui não):

- 8 casos porque alguém usou `/corrigir` na foto reenviada — o comando devolve o status para
  "soma" e o dedup nunca mais marca aquele comprovante.
- 9 casos em que o dedup não pegou o reenvio (postado horas ou dias depois).
- 1 caso do mesmo Pix postado nos **dois** grupos (R$ 50,00, CAROLAINE, 08/10) — o bot só avisa.
- Maiores: R$ 1.000,00 (MATEUS OLIVEIRA SOUZA, 24/10), R$ 343,00 (IGOR CUNHA, 08/10),
  R$ 270,00 (MD COMÉRCIO, 17/10), R$ 226,00 (JOÃO VICTOR SALGUEIRO, 14/10).

## Ressalvas técnicas

1. O bot **não** guarda a chave Pix literal do comprovante; identifica a conta pelo **nome +
   CNPJ do favorecido** lidos da foto (`extraido_raw.destinatario_doc`).
2. Nome varia no OCR; o agrupamento é por CNPJ completo e, quando o CNPJ vem truncado, pela
   raiz do CNPJ (8 primeiros dígitos) ou pelo prefixo do CNPJ lido.
3. 71 comprovantes do período estão sem ID de transação — nesses não há checagem automática
   de duplicidade.
4. Data usada é `data_pix` (data do Pix no comprovante). Comprovante recebido em 01/10 com
   Pix datado de 30/09 ficou fora do período.
5. Ligação nome fantasia ↔ chave está em `lib/pix-chaves.ts` (só exibição, não altera cálculo).

## Ligação com o cadastro de fornecedores do app (tabela `pessoas`)

**Gravado em 01/11/2026** — só os campos `chave_pix`, `tipo_chave_pix`, `nome_fantasia` e
(no caso das duplicadas) `ativo`. Nada de nome, saldo, produto ou histórico foi alterado.

| Nome fantasia | Linha no cadastro (`pessoas.id`) | Nome no cadastro | Produtos | Chave gravada | Tipo |
|---|---|---|---|---|---|
| H2O | `698ca68bab433fc39fef7b75` | H2O FORNECEDOR | 323 | 67.262.680/0001-92 | CNPJ |
| ADL | `69d6bb5139449d9509f24978` | ADL FORNECEDOR | 141 | 11959507410 | Celular |
| ZL | `6537e9a5252e1067daf498a3` | ZL CELL FORNECEDOR | 55 | 17.966.582/0001-68 | CNPJ |
| PLANETA | `63e6375b0a7df67f3f2d1d29` | PLANETA CELL | 3 | planeta272026@outlook.com | E-mail |
| Tecnocell Petrópolis | `6446ebdd376cd5a237c93a82` | TECNOCELL PETROPOLIS | — | 38.216.415/0001-70 | CNPJ |
| INOVA | `63fcac1fb418e8b1b3a3471e` | INOVA MERCADORIAS | 0 | atrativaacessorioss@gmail.com | E-mail |
| Isabela Ponciano | `63e6a6c36e54ccf4776810cc` (é **cliente**) | Isabela Ponciano Camara | 0 | 24993117516 | Celular |
| João Vitor Maximiliano França | `63f91bcf490a14f6c2da70ab` (é **cliente**) | JOAO VITOR MAXIMILIANO FRANÇA | 0 | 16355285776 | CPF |

Decisões tomadas com o dono:

- **Isabela** não é fornecedor: é cliente. A chave foi gravada nela para dar correlação com os
  pagamentos da planilha. A chave dela é **24993117516**.
- O número **16355285776** é CPF **e** chave Pix do **João Vitor Maximiliano França** — gravado nele.
- **H2O**: existiam 3 linhas ("H2O FORNECEDOR" com 323 produtos e duas só "H2O", sem nada).
  A linha boa ficou ativa e as duas vazias foram **desativadas** (`ativo = false`), não apagadas.
  Verificado antes: nenhuma delas tinha produto, lançamento, nota, venda ou pedido ligado.
- **INOVA**: existia "INOVA MERCADORIAS" (fornecedor) e "inova" (vazia). A oficial é
  INOVA MERCADORIAS; a minúscula foi desativada, também sem nenhuma referência.
- **PLAY CELL** (vazia) e as linhas de **TROCA** ("TROCAS ADL", "TROCAS PLANETA CELL",
  "TROCA ZL CELL FORNECEDOR") não foram tocadas — troca de peça não é conta de pagamento.

