# Relatório Pix do Telegram — 01/10/2026 a 01/11/2026

Fonte: tabela `comprovantes_pix` (Supabase, projeto `rbjwbfkhebaschiqda`), escrita pelo bot
de comprovantes do Telegram (`app/api/telegram/comprovante/route.ts`).
Gerado em 01/11/2026. Reproduzir: `node pix-total.mjs`. Cadastro das chaves: `lib/pix-chaves.ts`.

## Total do período

**R$ 258.996,55** em **1.904 comprovantes**.

Critério: cada Pix (ID de transação / E2E) contado **uma vez**, mesmo que tenha sido postado
mais de uma vez no grupo ou nos dois grupos.

## Chaves cadastradas

| Apelido | Nome fantasia | Nome social / favorecido | Tipo | Chave Pix |
|---|---|---|---|---|
| H20 | Stor One | STOR ONE LTDA | CNPJ | 67.262.680/0001-92 |
| PIX LOJA | Pix da loja (Petrópolis) | 38.216.415 JOAO VITOR MAXIMIANO FRANCA | CNPJ | 38.216.415/0001-70 |
| ADL | Armação Longitude | ARMAÇÃO LONGITUDE COMERCIO LTDA | Celular | 11959507410 |
| INOVA | Atrativa Acessórios | ATRATIVA ACESSÓRIOS PARA CELULARES EIRELI | E-mail | atrativaacessorioss@gmail.com |
| ZL | ZL | FERNANDES DA SILVA REPRESENTAÇÃO COMERCIAL SJC LTDA — ou PLANORH PLANEJAMENTO E ORGANIZAÇÃO — ou FERREIRA E FERREIRA CONSULTORIA EMPRESARIAL EIRELI | CNPJ | 17.966.582/0001-68 |
| ISABELA | Isabela Ponciano (dívida da loja em parcelas) | ISABELA PONCIANO CÂMARA | Celular | 16355285776 |
| PLANETA | Play Cell | PLAY CELL CELULARES | E-mail | planeta272026@outlook.com |
| — | (sem cadastro) | IG FRANÇA COMÉRCIO E SERVIÇO LTDA | — | — |
| — | (sem cadastro) | JOÃO VICTOR DO NASCIMENTO SALGUEIRO | — | — |

## Totais por chave

| Apelido | Recebedor | CNPJ | Comprovantes | Total (R$) |
|---|---|---|---|---|
| H20 | STOR ONE LTDA | 67.262.680/0001-92 | 965 | 121.640,24 |
| PIX LOJA | JOÃO VITOR MAXIMIANO FRANÇA | 38.216.415/0001-70 | 568 | 74.338,29 |
| ADL | ARMAÇÃO LONGITUDE COMERCIO LTDA | 64.486.787/0001-26 | 191 | 26.919,15 |
| INOVA | ATRATIVA ACESSÓRIOS PARA CELULARES | 37.010.872/0001-40 | 70 | 15.145,40 |
| ZL | FERNANDES DA SILVA REPRES. SJC (+ PLANORH, + FERREIRA E FERREIRA) | 17.966.582/0001-68 | 68 | 13.904,00 |
| ISABELA | ISABELA PONCIANO CÂMARA | 54.870.178/0001-12 | 30 | 5.872,47 |
| — | IG FRANÇA COMÉRCIO E SERVIÇO LTDA | 39.682.023/0001-69 | 6 | 572,00 |
| — | JOÃO VICTOR DO NASCIMENTO SALGUEIRO | (não lido) | 1 | 350,00 |
| PLANETA | PLAY CELL CELULARES | 03.111.659/0001-03 | 5 | 255,00 |
| | **TOTAL** | | **1.904** | **258.996,55** |

Notas por chave:

- **ZL**: os 3 favorecidos do CNPJ 17.966.582/0001-68 são a mesma conta. Dentro dos R$ 13.904,00
  estão 2 comprovantes lidos como "PLANORH" (R$ 2.100,00 em 14/10 + R$ 1.550,00 em 20/10).
- **ISABELA**: não é venda — é a dívida da loja paga em parcelas. Os comprovantes de outubro
  foram pagos por clientes direto na conta dela (31 mensagens; 1 era reenvio, por isso 30 contam).
- **PIX LOJA**: chave oficial da loja (CNPJ 38.216.415/0001-70, PagBank), usada pra pagar
  salário, aluguel e despesas. Recebeu R$ 74.338,29 no período (568 comprovantes).
  Os comprovantes dessa chave aparecem nos **dois** grupos do Telegram.
- **H20**: inclui 3 comprovantes com nome mascarado no recibo ("STOR *** ****"), R$ 270,00,
  identificados pelo CNPJ truncado.
- **PIX LOJA**: inclui 2 comprovantes mascarados ("38.216.415 ****..."), R$ 258,00.
- **INOVA**: inclui 1 comprovante mascarado, R$ 88,00.
- **JOÃO VICTOR DO NASCIMENTO SALGUEIRO** é outra pessoa — não confundir com o João Vitor da
  conta PagBank.

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
5. Ligação apelido ↔ chave está em `lib/pix-chaves.ts` (só exibição, não altera cálculo).
