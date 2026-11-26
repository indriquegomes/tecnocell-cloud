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
