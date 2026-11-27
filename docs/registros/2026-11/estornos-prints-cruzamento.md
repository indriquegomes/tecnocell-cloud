# Estornos PIX — cruzamento app × prints (escopo desta linha de trabalho)

> **Regra do dono (26/11/2026):** nesta linha de trabalho só se fala de **estorno de
> PIX que cruzou com o app e com os prints enviados**. Fornecedor, folha, saldo do
> PagBank e devolução sem comprovante **não entram nesta conversa**.

## Material de partida

- **Extrato PagBank** `01-11-2026_26-11-2026.csv` (420 movimentos) — pasta Downloads.
- **48 prints** (`WhatsApp Unknown 2026-11-26 at 10.12.24.zip`) — 38 são PIX enviado,
  34 legíveis, 36 com valor. Transcrição em `tmp-checkup/prints-lidos.json`
  (não versionado).

## Resultado do cruzamento

| Etapa | Número |
|---|---|
| Prints de PIX enviado com valor | 36 |
| **Casamento perfeito** (valor + data + **nome** casando) | **16 · R$ 3.249,90** |
| Casavam só por valor/data (desligados a pedido do dono) | 10 · R$ 939,00 |
| Print sem estorno no app | 7 · R$ 651,00 |

## O que foi gravado nos 16

1. **Prova** — `pix_saidas` com valor, dia, recebedor, **ID E2E** e `lancamento_id`
   (`scripts/ligar-prints.mjs`).
2. **Compra** — `extraido_raw.venda_id` / `venda_numero` para os 8 que têm venda única
   (`scripts/amarrar-venda.mjs`).
3. **Devolução** — `lancamentos.devolucao_id` ligado à devolução da venda nos 7 que
   tinham devolução de valor igual (`scripts/ligar-devolucao.mjs`).
4. **Reembolso verdadeiro** — 5 devoluções que diziam `sem_reembolso` viraram `pix`
   (`scripts/consertar-reembolso-devolucao.mjs`).
5. **SERGIO CELULARES R$ 15,00** — forma/conta/data e tipo da devolução corrigidos
   (`scripts/consertar-sergio-15.mjs`).

## A matemática que prova

Devoluções de novembro fecham ao centavo:

```
peças devolvidas = abatido de fiado + reembolso ao cliente
R$ 102.424,59    = R$ 66.534,50   + R$ 35.890,09     → diferença R$ 0,00
```

Chave da leitura: **PIX se compara com REEMBOLSO, não com o valor da peça**. Quando
a devolução abate fiado, não sai dinheiro e não existe PIX para casar (811 das 1.309
devoluções de novembro são "cancelou fiado" — todas com venda fiado de verdade).

## Pendências DENTRO deste escopo

| Caso | Valor | Por que ficou |
|---|---|---|
| IGOR KREISCHER · SAMIRA · ALVARO · RODRIGO PEREIRA | 349 / 4 / 10 / 1.530,90 | devolução **parcial** (peça de venda maior): falta o item devolvido |
| Uelington Barreto · Victor Afonso | 47 / 100 | duas vendas com o mesmo valor / nome fora do cadastro |
| Emily de Menezes (2º PIX) | 128 | a devolução da venda #11778 é de R$ 36,00 |
| 10 prints de valor único | 939,00 | desligados a pedido do dono ("só casamento perfeito") |
| 7 prints sem estorno | 651,00 | Fernando 90+1 (soma 91), ROMULO 101, ANA ALICE 87, Larissa 141, Piccoli 12, um de 219 sem nome |

## Ferramentas (todas só leitura, exceto onde diz `--aplicar`)

```
node --env-file=.env.local scripts/cruzar-prints-estornos.mjs "tmp-checkup\prints-lidos.json" 5
node --env-file=.env.local scripts/ligar-prints.mjs "tmp-checkup\prints-lidos.json" [--aplicar]
node --env-file=.env.local scripts/amarrar-venda.mjs [--aplicar]
node --env-file=.env.local scripts/ligar-devolucao.mjs [--aplicar]
node --env-file=.env.local scripts/consertar-reembolso-devolucao.mjs [--aplicar|--desfazer]
node --env-file=.env.local scripts/consertar-sergio-15.mjs [--aplicar|--desfazer]
```

Backups de tudo em `docs/registros-banco/2026-11/` (ligar-prints, ligar-devolucao,
reembolso-devolucao, conserto-sergio-15).

---

## Fechamento da rodada (26/11/2026, fim do dia)

### Casos FECHADOS (conta ↔ devolução ↔ comprovante)

| Cliente | Valor | O que foi feito |
|---|---|---|
| SERGIO CELULARES (venda #15473) | 15,00 | forma `pix` + conta PagBank + data 26/11 00:33 · devolução `pix` |
| IGOR KREISCHER (venda #11282) | 349,00 | conta ligada à devolução 9ca0bf9e · devolução `pix` |
| SAMIRA AMORIM DOS REIS (venda #11072) | 4,00 | conta ligada à devolução f26258dc · devolução `pix` |
| LUCAR GABRIEL DIAS (venda #11435) | 229,00 | devolução 96cec82a `pix` (conta já era PIX/PagBank) |
| SUPERCELL / VITOR PORTO FIGUEIRA (venda #14058) | 210,00 | conta ligada a 4c1db22a · devolução `pix` |
| LARISSA PLAY TEC (venda #14217) | 141,00 | conta era do "Diego Santos" → virou LARISSA PLAY TEC, data 19/11, ligada a d5c25934 |
| LOJA CAMPISTA (venda #12869) | 120,00 | conta ligada a 18387c4c · devolução `pix` |
| STAR MANUTENÇÃO (venda #11726) | 101,00 | conta ligada a 157b1bb3 · devolução `pix` |
| AMILTON TEREMAQCELL (vendas #12481 e #13822) | 87,00 e 15,00 | contas ligadas às devoluções · `pix` |
| KLEBER CLAYTON DA COSTA MESQUITA (venda #11788) | 82,00 | conta ligada a 1cbcd646 · devolução `pix` |
| CARIOCA CELL VÁRZEA (venda #11629) | 76,00 | conta ligada a eb66643b · devolução `pix` |
| DIGITAL TEC/DIGITAL MACHINES (venda #13097) | 70,00 | conta ligada a 9be19254 · devolução `pix` |
| ARTHUR DIAS · Vitor da Silva Costa · ANDERSON XAVIER · Diego Santos · Bruno Delgado · UELINGTON · MARCOS VINICIUS | 57 · 224 · 21 · 77 · 295 · 47 · 51 | conta ↔ devolução ↔ venda ligadas; reembolso verdadeiro |

### Nomes de comprovante registrados (`pessoa_chaves_pix`, tipo "Nome no comprovante")

LARISSA PLAY TEC ← Larissa da Rocha Carvalho · DIEGO SANTOS ← Luiz Diego Dos Santos
Silva · LOJA CAMPISTA ← Vanderleia Mateus Cardoso · AMILTON TEREMAQCELL ← AMILTON
CORDEIRO COSTA · CARIOCA CELL VÁRZEA ← Maria Eduarda da Silva Kern · DIGITAL TEC ←
Luiz Otávio da Silva · SUPERCELL ← VITOR PORTO FIGUEIRA · SERGIO CELULARES ←
Luciana Lucio Trece · João Vitor Miranda de Oliveira ← Leonardo Miranda de Oliveira ·
ALVARO GARCIA ← ALVARO DAMASCENO GARCIA.

### O que ficou PARA AMANHÃ

1. **EMILY DE MENEZES PITTZER FIUZA** — cadastrada como cliente hoje. As contas de
   R$ 112,00 e R$ 128,00 (10/11, pagas em PIX) estão no cadastro dela **sem
   devolução**: precisa saber de qual compra foi cada reembolso. A ligação anterior
   com as devoluções do CARLOS foi **desfeita** (o dono disse que o Carlos não está
   na lista de estornos dele).
2. **vitor Miranda R$ 37,00** — conta PIX de 09/11 sem devolução; as devoluções dele
   em novembro são de R$ 100 e R$ 55. PIX foi para Leonardo Miranda de Oliveira.
3. **Prints enviados que não têm conta nem devolução no app** — Fernando dos Santos
   Silva 90+1 (soma 91), ROMULO OLIVEIRA DE CASTRO 101, ANA ALICE DE ARAUJO MARQUES
   87, José Antonio Rodrigues Piccoli 12 e um de 219 sem nome (R$ 651,00). Os
   comprovantes estão na pasta dos 48 prints; o que falta é o registro no app.
4. **ALVARO GARCIA R$ 10,00** — é crédito residual reembolsado em PIX: o saldo de
   crédito dele continua R$ 10,00 (falta o estorno). O dono disse "já foi resolvido",
   mas no banco o saldo segue aberto.

### RESOLVIDO por decisão do dono (não é pendência)

- **RODRIGO PEREIRA R$ 1.530,90** — achado: 4 devoluções (280 + 250 + 250 + 750 =
  1.530,00) pagas num único PIX de 1.530,90, com os 4 créditos estornados. A
  diferença de R$ 0,90 foi considerada irrelevante pelo dono. **Fechado.**

### Ferramentas criadas nesta rodada

```
scripts/fechar-caso.mjs            (fecha um caso em um comando: conta ↔ devolução ↔ cliente ↔ nome no comprovante)
scripts/desfazer-carlos-emily.mjs  (restaura pelo backup; o --desfazer anterior lia o valor atual e não desfazia)
scripts/ligar-pessoa.mjs           (liga lançamento ao cadastro com nomeContido, regra estrita)
scripts/ligar-prints.mjs / amarrar-venda.mjs / ligar-devolucao.mjs / consertar-*.mjs
```


## Checklist e consertos — fechamento do dia (27/11/2026)

Conferência pedida pelo dono ("roda um checklist do que fizemos hoje e repara
erros e pontas soltas"). O que foi achado e corrigido:

### Erros de código (corrigidos e no ar)

1. **O robô não lia o nome registrado no cadastro.** O print traz o dono da conta
   que recebeu ("Larissa da Rocha Carvalho") e o Financeiro conhece o cliente
   ("LARISSA PLAY TEC"). As 13 chaves gravadas em `pessoa_chaves_pix` não eram
   consultadas: o robô só casava pelo cartão da devolução. Agora a rota e o
   simulador consultam `favorecido` e resolvem o nome do cadastro.
   *Provado:* simulador com "Larissa da Rocha Carvalho" R$ 141,00 → `baixar` em
   LARISSA PLAY TEC.
2. **Trava de duplicado não pegava o próprio robô.** Ela procurava
   `status = 'conciliado'` (status da importação), mas o robô grava `'casado'` —
   o mesmo print enviado duas vezes entrava duas vezes. Agora qualquer linha já
   ligada (`lancamento_id` preenchido) com o mesmo ID de transação é repetição.
3. **Estorno de crédito nascia órfão.** A conta aberta pelo "Cancelar crédito"
   era inserida sem `devolucao_id` e sem `pessoa_id` — o conferente acusava
   "conta sem devolução ligada" e o robô não achava a linha pela pessoa.
   Migration `2026-11-27-estorno-credito-liga-devolucao.sql` (colar no SQL
   Editor) + `scripts/ligar-estorno-credito.mjs` para as 11 contas antigas.
4. **`ligar-pessoa.mjs` ligava cadastro errado.** A régua "um nome dentro do
   outro" grudava `FINAL` em `CONSUMIDOR FINAL NÃO IDENTIFICADO` e `JACKSON
   VIANA` em `JACKSON VIANA SILVA`. Passou a exigir nome idêntico (normalizado);
   parcial só com 2+ palavras e único; e recusa quando a devolução ligada é de
   outro nome. 45 contas ligadas ao cadastro.

### Sujeira removida

- `tmp-checkup/prints` (48 JPEGs, 6,4 MB) e `tmp-checkup/mid10.jpg` — fora do
  repositório (a pasta já está no `.gitignore`).

### Estado do conferente (`conferir-estornos.mjs`, extrato 01–26/11)

| | antes | depois |
|---|---|---|
| CASOU cheio | 17 · R$ 1.995,00 | **19 · R$ 2.055,00** |
| CASOU incompleto | 20 · R$ 3.549,90 | **18 · R$ 3.489,90** |
| NÃO CASOU | 93 · R$ 43.294,62 | 93 (é PIX que não é estorno: fornecedor, folha, dono) |

### O que continua aberto (decisão do dono)

- **Contas de estorno sem devolução nenhuma no app:** EMILY 112 e 128, HELP TESH
  229, RODRIGO PEREIRA 1.530,90. Pela regra do dono (estorno exige venda
  cancelada), sem devolução registrada essas saídas são outra coisa — despesa ou
  acerto — e não "Devolução".
- **ANGELICA: conta de R$ 221,00 × devolução de R$ 217,00** (diferença de R$ 4).
- **Sem cadastro que case:** "Victor Afonso" R$ 100, "SUPERCELL" R$ 210,
  "Raphael Vaz de freitas" R$ 195, "FINAL" R$ 65.
- **Ambíguas da rodada de lote (não ligadas de propósito):** WM CELULARES R$ 62,
  CARLOS HENRIQUE R$ 67.
- **Vigia diário (`/api/pix-saida/vigia`) nunca foi visto rodando em produção** —
  o `CRON_SECRET` não está aqui. Falta conferir no log da Vercel num dia útil.
