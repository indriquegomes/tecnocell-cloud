# Registro de Inconsistências — Fechamento OUT/2026

> **Modo atual: SÓ COLETAR.** Nada é lançado no app, nada é alterado no banco.
> O cruzamento só começa quando o dono autorizar. Correção, quando vier, é digitada pelo dono.

- Mês: **2026-10**
- Foto do app: `app.json` (gerado por `scripts/conferir-mes.mjs`, read-only)
- Referência (fornecedores, depósitos, caixas): `referencia.md`
- Arquivos recebidos do dono: `entrada/`

## Peças recebidas

| # | Peça | Origem / arquivo | Recebido em | Estado |
|---|---|---|---|---|
|---|---|---|---|---|---|---|---|
| 1 | Resumo de pagamento a fornecedores OUT/2026 (PDF, 4 pág.) | `entrada/01-resumo-pagamento-fornecedores-outubro.pdf` (+ `.md` e `.txt`) | 2026-10-25 | ✅ recebido, somado e cruzado |
| 1b | Planilha de caixa mensal completa (a pagar, compras, pagamentos, meta) | — | — | ⬜ pendente |
| 2 | Planilha do fornecedor (comprovantes) | — | — | ⬜ pendente |
| 3 | Contagem do dinheiro (caderno / envelopes / caixa do dia / Pagbank) | — | — | ⬜ pendente |
| 4 | Contagem física do estoque | — | — | ⬜ pendente |
| 5 | Saldos de hoje (Cora / TON / PagBank) | — | — | ⬜ pendente |
| 6 | Contas a pagar reais (INOVA, H2O, ADL, PLANETA, ZL…) | — | — | ⬜ pendente |
| 7 | Fiado pago fora do app | — | — | ⬜ pendente |
| 8 | Compras sem nota de entrada no app | — | — | ⬜ pendente |
| 9 | Vendas fora do PDV | — | — | ⬜ pendente |
| 10 | Perdas / avarias / retirada de sócio / empréstimo | — | — | ⬜ pendente |

Sem fonte declarada (não conferível nesta rodada): extrato PIX/Cora, extrato TON, extrato PagBank.

## Números do app (foto de 2026-10)

    Petrópolis   Teresópolis  
|---|---|---|---|---|---|---|---|
  Entrou na venda (pago)   R$ 48.092,97   R$ 17.354,50  
  Fiado cobrado   R$ 144.485,49   R$ 137.843,27  
  Compras (notas de entrada)   R$ 155.092,82   R$ 135.344,36  
  Despesas pagas   R$ 138.635,03   R$ 77.463,10  
  Dinheiro em mãos (teórico)   R$ 48.705,30   R$ 35.780,50  
  Estoque — custo / venda   R$ 273.784,14 / R$ 1.127.279,64   R$ 187.034,14 / R$ 602.131,97  

Fora das lojas: vendas do mês R$ 506.509,63 (corrigido, ver INC-20) · a pagar em aberto R$ 236.463,43 (76 notas) · fiado em aberto R$ 32.956,89 (373 notas) · 85 caixas (2 abertos).

## Inconsistências

Primeira rodada: peça 1 (fornecedores) cruzada com o app em 2026-10-25.
Segunda rodada (mesmo dia): dono explicou o modelo — ver **Modelo confirmado pelo dono** abaixo. As linhas INC-02 a INC-08 mudaram de "erro" para "objetos diferentes / falta lançar".

| ID | Camada | App diz | Realidade diz | Diferença | Hipótese | Pergunta | Status |
|---|---|---|---|---|---|---|---|
| INC-01 | ADL / soma do PDF | — | soma dos 7 itens = R$ 16.851,06 · total declarado R$ 16.809,06 | **R$ 42,00** | erro de soma no papel | dono respondeu que nenhum pagamento foi cancelado → sobra erro de soma no PDF | explicado (erro de soma do papel, R$ 42) |
| INC-02 | Notas de entrada × comprado do papel — H²O | R$ 178.475,73 (Pet+Tere) | R$ 117.740,00 no papel | **R$ 60.735,73** | **não é erro de valor**: papel registra "comprado" do jeito dele, app registra mercadoria a custo | falta a lista de notas H²O de outubro para casar item a item | aberto |
| INC-03 | Notas de entrada × comprado do papel — ADL | R$ 62.920,91 | R$ 38.430,00 | R$ 24.490,91 | idem INC-02 | idem | aberto |
| INC-04 | Notas de entrada × comprado do papel — ZL / PLANETA | ZL R$ 11.690,00 · PLANETA R$ 2.610,00 | ZL R$ 13.423,00 · PLANETA R$ 1.350,00 | ZL −R$ 1.733,00 · PLANETA +R$ 1.260,00 | idem INC-02 (aqui o app fica MENOR que o papel em ZL) | idem | aberto |
| INC-05 | Trocas no app | TROCAS ADL R$ 2.050,32 + TROCA ZL R$ 1.355,00 | não aparecem no papel | R$ 3.405,32 | troca de compra é mercadoria, não dinheiro | troca abate dívida ou vira mercadoria? define onde entra | aberto |
| INC-06 | Pagamentos H²O out | R$ 94.825,32 | R$ 115.482,94 | **R$ 20.657,62** | **dono confirmou: dinheiro de fornecedor nunca foi lançado no app** | vira item da lista de lançamento | explicado — falta lançar |
| INC-07 | Pagamentos INOVA out | R$ 9.908,60 | R$ 15.106,40 | R$ 5.197,80 | idem INC-06 | idem | explicado — falta lançar |
| INC-08 | Dívida com fornecedores | R$ 181.176,43 pendente no app (H2O R$ 73.175,74 · INOVA R$ 64.763,50 · ADL R$ 25.896,85 · PLANETA R$ 11.107,94 · ZL R$ 6.232,40) | **VERDADE DO DONO (26/10): R$ 50.224,40** — ADL R$ 11.123,48 · PLANETA R$ 1.907,04 · H2O R$ 1.912,18 · ZL crédito −R$ 213,60 · INOVA R$ 35.495,30 | **R$ 130.952,03** | o app carrega pendências velhas sem baixa | baixar os R$ 130.952,03 com autorização do dono (script + backup) | aberto — aguardando autorização |
| INC-09 | ADL / dívida declarada | comprado − pago = R$ 11.572,85 | declarado R$ 10.914,48 (R$ 6.944,61 com troca) | R$ 658,37 / R$ 4.628,24 | saldo arrastado de antes de outubro | precisa dívida da ADL em 30/09 | aberto |
| INC-10 | H²O · ZL · PLANETA / dívida | comprado − pago: H²O R$ 2.257,06 · ZL crédito R$ 198,00 · PLANETA R$ 1.095,00 | H²O R$ 1.912,18 · ZL crédito R$ 213,60 · PLANETA R$ 1.907,04 | H²O R$ 344,88 · ZL R$ 15,60 · PLANETA R$ 812,04 | idem INC-09 | precisa dívida de cada um em 30/09 | aberto |
| INC-11 | Mercadoria a custo × dinheiro pago | notas de entrada 10/09→31/10: **R$ 426.704,18** (99 notas, 14 fornecedores) | pagamentos reais desde 10/09: só outubro recebido (R$ 171.322,49) | falta o lado de setembro | regra do dono: pago ≈ mercadoria lançada ± estoque que já existia | falta a planilha de fornecedores de SET (10→30/09) | aberto |

| INC-12 | Estoque por categoria × imobilizado do grupo (mesma data) | ver `entrada/03-cruzamento-imobilizado.md` | contagem do grupo de WhatsApp (24 medições) | **30/09: −R$ 3.012,78 Pet / −R$ 2.991,61 Tere (≈1,1%)** · 23/10: −R$ 7.529,73 Pet / +R$ 5.477,71 Tere (±3%) | estoque do app acompanha o papel dentro de 1–3%. Desvio por categoria (ACESSÓRIOS sempre menor no app, FRONTAL/BATERIA sempre maior) = classificação | dono **não soube responder** (25/10) → **parkado**: só analisar mais pra frente, não bloqueia o fechamento | parkado |
| INC-13 | Pico de 14/10 no cruzamento | app R$ 270.945 (Pet) e R$ 193.723 (Tere) | papel R$ 243.197 (Pet) e R$ 160.972 (Tere) | +R$ 27.748 / +R$ 32.752 | **dono: provável resíduo da migração SIGE→TecnoCell** | — | explicado (não usar como verdade) |
| INC-14 | Categorias BISCOITOS e CHOCOLATES | não existem no app | R$ 912,60 + R$ 71,70 (só Pet, 30/09) | R$ 984,30 | itens avulsos sem custo, erro herdado do app antigo | — | excluído por decisão do dono (25/10) |

| INC-15 | Dinheiro em espécie do mês | fluxo líquido de outubro: Pet **+R$ 48.726,30** · Tere **+R$ 36.320,50** (vendas em dinheiro + fiado recebido + reforços − retiradas − devoluções; **zero** despesa em dinheiro lançada) | contagem do dono (01/11): Pet **R$ 32.163** · Tere **R$ 27.000** · pagamentos em espécie informados: Pet 9.600 (13/10) + 6.200 (28/10) = R$ 15.800 · Tere 5.900 (13/10) + 4.000 (28/10) = R$ 9.900 | com abertura zero: Pet **−R$ 763,30** (app a mais) · Tere **+R$ 579,50** (contagem a mais) · total **R$ 183,80** — 1,6% do fluxo nas duas lojas | os 4 pagamentos em espécie (R$ 25.700) não estão no app; é exatamente a diferença entre o card "dinheiro em mãos" do app e a contagem | abertura de 01/10 (o que havia em mãos além dos R$ 2.804 / R$ 2.812,80 da gaveta) — só isso separa a conta de fechar no centavo | explicado |

| INC-16 | PIX pago × papel de fornecedores (outubro) | comprovantes_pix (banco, verificado): R$ 177.863,79 para os 5 fornecedores | papel "pago": R$ 171.322,49 | **+R$ 6.541,30** (H2O +6.157,30 · ZL +283 · ADL +62 · INOVA +39 · PLANETA 0) | o papel de H2O não tem os pagamentos de 01/10 (R$ 6.600,30 em PIX); os outros dias se compensam | o PIX de 01/10 para H2O foi pagamento de dívida de setembro? | aberto |
| INC-17 | PIX total do mês e sua composição | R$ 258.996,55 · 1.904 comprovantes — **conferido no banco, igual ao relatório** | — | 0 | 68,7% fornecedor · 28,7% transferência para o CNPJ próprio (João Vitor) · 2,3% Isabela Ponciano · 0,4% sem cadastro | os R$ 74.338,29 para o CNPJ próprio entram como despesa do mês? | aberto |
| INC-18 | Pagamento em espécie (R$ 25.700) | app: **zero** despesa paga em dinheiro em outubro | Pet 9.600 (13/10) + 6.200 (28/10) · Tere 5.900 (13/10) + 4.000 (28/10) | R$ 25.700,00 | dinheiro vivo nunca lançado, igual ao resto do fornecedor | nomes dos fornecedores que recebem em espécie — dono vai passar | aberto |

| INC-19 | Devoluções de outubro | 1.898 registros · R$ 150.328,62; "teste" em 1.198 · R$ 97.166,29 | motivo `teste` = **"Pediu pra testar"** (primeira opção de `MOTIVOS_DEVOLUCAO`) — devolução normal de peça levada pra teste | — | eu li o id `teste` como "treino" — **erro meu, não do app** | nada a corrigir. Fica só o número de gestão: 30% da venda voltou como devolução | explicado (erro meu) |
| INC-20 | Vendas do mês (correção da minha conta) | 5.942 · R$ 506.509,63 (contagem exata) | meu primeiro levantamento dizia 5.900 · R$ 501.823,87 | R$ 4.685,76 | minha paginação incompleta, corrigida em 3 rodadas | — | corrigido (meu erro) |
| INC-21 | Despesas sem forma de pagamento | 305 lançamentos · R$ 19.018,52 | — | — | forma não preenchida no lançamento | quais são dinheiro/PIX/cartão | aberto |
| INC-22 | Cadastro H2O duplicado | "H2O FORNECEDOR", "H2O" e "H2" como fichas diferentes | PIX tem um único CNPJ (STOR ONE) | — | duplicidade de cadastro | unificar as fichas (depois de autorização) | aberto |

| INC-23 | PIX recebido × extrato | app registra R$ 260.379,70 de PIX recebido | extrato PagBank: **82.279,06** de Pix recebido (609 lançamentos); Telegram: **178.170,29** foram direto ao fornecedor | **zero** | o PIX do cliente vai para dois lugares: a conta (82.279,06, que paga folha) ou direto na chave do fornecedor (178.170,29, que abate dívida). Soma 260.449,35 × 260.379,70 do app = **R$ 69,65** (0,03%) | nada a corrigir no banco. Ver `pix-cravado.md` | **fechado** (falso negativo meu) |
| INC-24 | R$ 74.338,29 "para o CNPJ próprio" | direção estava invertida: são **clientes pagando o nosso CNPJ** (pagador = pessoa física, destinatário = 38.216.415) | é o mesmo dinheiro que aparece como Pix recebido no extrato PagBank | — | eu li como saída da empresa para o CNPJ | não somar com a folha de R$ 42.343,17 | **fechado** (explicado) |
| INC-32 | Dívida da Isa (ex-funcionária) | app tem 10 parcelas de R$ 5.000 (R$ 3.500 Pet + R$ 1.500 Tere), venc. mensal 01/10/26 → 10/10/27; parcela 01 paga 28/10; parcela 10 adiantada 30/09; parcela 09 de R$ 320 | PIX para ela em outubro R$ 5.872,47 | — | eu tinha dito que faltavam R$ 872,47 da parcela — **errado**: a parcela é de R$ 5.000 e está lançada; o resto do PIX é outra coisa | confirmar o que é o excedente de R$ 872,47 (não é a parcela) | corrigido (erro meu) |
| INC-25 | Fiado baixado com valor_pago = 0 | 783 notas · R$ 59.690,86 sem movimento de caixa | em 659 delas a venda já está paga; 106 (R$ 3.794,26) não estão | — | sobra do fluxo de venda que nasceu fiado e foi quitada na hora | olhar as 106; relatório de fiado deve somar valor_pago, não status | aberto |
| INC-26 | Quebra de caixa por sessão | 85 sessões, quebra acumulada **−R$ 13,60**, pior sessão R$ 10,00 | — | — | nenhuma | nada — caixa aprovado | fechado (sem erro) |
| INC-27 | Notas de entrada × "comprado" do papel | notas reais e **valorizadas a custo** (1.562 de 1.765 itens batem com o custo do cadastro; **0** batem com preço de venda; soma R$ 290.437,18 × R$ 291.548,89 a custo) · H2O R$ 178.475,73 · ADL R$ 64.971,23 | papel: H2O R$ 117.740,00 · ADL R$ 38.430,00 | **R$ 87.276,96** | com o teste de preço, a suspeita virou: **o papel não contempla todas as compras** | conferir 2 notas grandes (15/10 nº 72 R$ 34.573,00 · 29/10 nº 97 R$ 27.187,00). Muda a mercadoria consumida entre R$ 196.534,09 e R$ 285.971,91 | aberto (viés: app provavelmente certo) |
| INC-28 | Cartão: banco × app | PagBank "Vendas" R$ 4.393,54 (líquido) | app cartão R$ 5.665,78 (bruto) | R$ 1.272,24 (~1,5% = taxa) | app registra bruto, banco credita líquido; parte do cartão sai pela TON | extrato TON, se quiser fechar no centavo | aberto |
| INC-29 | Notas de valor zero | ADL nota 60 (08/10) e nota 100 (29/10), R$ 0,00 e sem itens (únicas `pendente`) | — | — | nota criada e não preenchida | apagar (precisa autorização) | aberto |
| INC-31 | Trilha da mercadoria (nota → estoque) | 1.765 itens de nota (7.409 un) · 937 movimentos de entrada em outubro (12.686 un) · 355 de 657 produtos com entrada registrada · 106 sem entrada e sem estoque suficiente | — | — | estoque também é corrigido por conferência (136 movimentos "CORRIGIDO ATRAVES DA CONFERENCIA") | nada a corrigir; a contagem física (1,1% e 3,0%) sustenta a compra no agregado | explicado |
| INC-33 | Lançamento de pagamento dos 4 fornecedores fora da lista | **feito em 26/10**: 19 lançamentos · R$ 30.056,36 (pagos, Dinheiro, Fornecedor/Mercadoria, descrição `CONF FECHAMENTO OUT/2026 — nota de entrada nº N`) | notas de origem R$ 30.056,36 | 0 | pagamento em dinheiro vivo desses fornecedores não estava no financeiro | nada pendente; backup e SQL de desfazer em `backups/`. Troca Acessórios ficou fora por decisão do dono | feito |

## Modelo confirmado pelo dono (2026-10-25)

Só três coisas no app são verdade hoje:

1. **Funcionários** — revisados e conferidos.
2. **Vendas** — lançadas no dia a dia desde **10/09/2026**.
3. **Produtos / mercadoria com valor de custo** — lançados desde setembro.

O que **não** existe no app e não deve ser lido como erro:

- **Dinheiro pago a fornecedor**: nunca foi lançado. Vale como verdade só **daqui pra frente**.
- Portanto o "Saiu no mês / compras" do app é **custo de mercadoria**, não dinheiro pago. Comparar um com o outro é comparar coisas diferentes.

Regra de reconciliação que o dono definiu:

> Pagamentos reais aos fornecedores (desde 10/09) devem casar com o **custo dos itens lançados** nesse tempo, **considerando o estoque que já existia**.

Equação a fechar:

```
Mercadoria lançada (custo, 10/09→31/10)   R$ 426.704,18
  = Pagamentos reais no período
  + (Dívida em 31/10 − Dívida em 10/09)
  ± Ajuste de estoque (itens que já existiam / perdas)
```

Falta: planilha de fornecedores de setembro, dívida real em 10/09 e a contagem física do estoque.

Status possíveis: `aberto` · `explicado` · `corrigido` · `aceito` (com motivo escrito).

## Regras do registro

1. Todo valor com **data + loja + origem** (qual arquivo/planilha).
2. `estimativa` é marcado como estimativa — nunca vira lançamento sem confirmação.
3. Nome que não casa com o cadastro do app é divergência, não é ignorado.
4. Planilha de fornecedor e planilha de caixa mensal cobrem o mesmo dinheiro por ângulos diferentes — cruzar as duas antes de somar com o app.
5. Diferença acima de R$ 10 por camada sem causa = mês não fecha.
