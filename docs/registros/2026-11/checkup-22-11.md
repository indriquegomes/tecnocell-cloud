# Check-up TecnoCell — 22/11/2026 (rodada de fechamento do mês 11)

Alvo: **local** (`npm run dev` na mesma base de produção, só leitura) + banco de produção.
Foco do dono: dinheiro que sai para cliente (PIX por desistência, devolução, fiado).

## 🔴 Corrigido nesta rodada (com prova)

1. **Devolução com valor a devolver registrada como "sem reembolso"** — o RPC não criava
   lançamento nenhum e o dinheiro pago por PIX fora do app desaparecia do Financeiro.
   Prova: 39 estornos do WhatsApp (R$ 5.526,90) × só 7 lançamentos `Devolução —` (R$ 678,00).
   Conserto: trava no banco (`2026-11-22-devolucao-exige-forma-de-reembolso.sql`, aplicada
   pelo dono) + tela esconde "Sem reembolso" quando há valor + aviso vermelho.
2. **Dinheiro fora do Financeiro** — 34 lançamentos de devolução criados (R$ 4.692,90) e
   as retiradas de caixa de 03–05/11 ligadas aos seus destinos (10 de 14).

## 🟡 Médio

3. **Crédito de devolução + dinheiro pago** — 5 casos apontados pelo conferente
   (`scripts/conferir-devolucoes-sem-lancamento.mjs`); 2 já estornados (DENILSON 45,00 e
   LUIZ CARLOS SANTANA 67,00). Os outros 3 (LK CELL 61,00 · DAVID DOS SANTOS MORTES 141,00 ·
   DIOGO DOS SANTOS LIMA 45,00) precisam de decisão: se o crédito já foi usado, nada a fazer.
4. **Fiado cancelado + dinheiro pago** — 6 casos no conferente, sendo 1 comprovado
   (UELINGTON BARRETO MARTINS, 47,00 em 21/11). Os outros 5 são falso positivo do
   casamento por nome (TRICELL × CARIOCA CELL, TOP CELULARES × WM CELULARES).
5. **11 devoluções com valor a devolver e nenhuma saída lançada** (R$ 1.022,40):
   PEDRO HENRIQUE ANGELICA FERREIRA 217,00 · IMPERA SMART 195,00 · LARISSA PLAY TEC 141,00 ·
   VT CELL 100,00 · MISTER CELL 90,00 · CARLOS HENRIQUE 67,00 + 61,00 ·
   PEDRO HENRIQUE DOS SANTOS 52,50 · Arthur Dias Moura 55,00 · LOJA CAMPISTA 34,00 ·
   JD TERESÓPOLIS 9,90.

## 🟢 Pequeno / UX

6. Comentário de `actions.ts:447` diz "nem o master libera", mas o código libera com a
   senha de liberação — texto ou código precisam se alinhar.
7. Aviso de fiado e prévia do vale-crédito na tela de devolução: no disco, **sem deploy**.

## ✅ Verificado e OK

- `npx tsc --noEmit` = **0**.
- Smoke local (leitura), 17 telas: **todas 200 com título**. As duas únicas falhas da
  primeira rodada eram rota errada do meu script (`/painel/fechamento` → é
  `/painel/fechamento-mes`; `/painel/caixa` → é `/painel/pdv/operacao`).
- Caixa de 03–05/11 depois dos lançamentos: `conferencia-caixa.mjs` → Petrópolis
  diferença 0,00 · Teresópolis sobra de 5,00 (a mesma de 03/11, já registrada).
- Foto do mês (`conferir-mes.mjs 2026-11`): despesas Petrópolis R$ 144.490,97 (antes
  R$ 109.952,61) e Teresópolis R$ 114.645,21 (antes R$ 104.863,19) — a diferença é o
  dinheiro que estava fora do Financeiro e agora está lançado.
- Backup + DESFAZER de cada escrita em `docs/registros-banco/2026-11/`.

## O que NÃO foi feito (e por quê)

- **Suíte e2e** (`npx playwright test`): escreve em produção (cria venda/devolução de
  verdade) — segue vetada até as duas lojas fecharem o caixa.
- **Clique-a-clique no modal de devolução**: os controles de seleção do modal não são
  checkbox/botão nativos e o script não avançou para o passo "Confirmar". As travas de
  tela estão provadas por código + `tsc`, não por screenshot.
- **Deploy**: nada commitado nem publicado (trava do dono).
