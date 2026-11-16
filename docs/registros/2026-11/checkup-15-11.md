# Check-up TecnoCell — 15/11/2026 (19h)

> Checklist do dia no trabalho recém-entregue: o rastro do PIX do dia no fechamento
> (`2bb6734`) e as saídas do checkup fora do repositório (`82b81ba`). Bateria inteira
> rodada: type-check, testes de lógica, 85 telas de produção e invariantes do banco.

**Alvo:** `tecnocell-cloud.vercel.app` (produção) para navegação · Supabase real
para dados (somente leitura).

## Resultado

| Item | Resultado |
|---|---|
| `tsc --noEmit` | 0 (limpo) |
| Testes de lógica | **206/206** (86 + 12 + 4 + 23 + 81), exit 0 em todos |
| Build / deploy | `main@82b81ba` no ar — o rastro do PIX foi junto |
| 85 telas de produção | OK — sem erro de console, sem HTTP 500 |
| CRUD real (categorias e depósitos) | criado · editado · excluído · **0 restos `__QA__`** |
| Invariantes (mês 11) | **49 OK / 0 falha** |

A única tela que "falhou" no smoke é `/painel/pedidos-app/imprimir` sem `?id=` — é a
página de impressão aberta sem parâmetro, falso positivo já conhecido.

Fora do mês 11, o script lista as pendências de outubro que o dono tirou do processo
(compra de mercadoria sobrando em "Vendas", 2 contas com pago acima do valor, 5 PIX
na chave IG FRANCA encerrada). Nada novo.

## O que conferi no rastro novo

- `caixas.pix_resolucao` existe e está vazia (0 linhas): nenhum fechamento de caixa
  aconteceu **depois** do deploy (15/11 15:03). O próximo fechamento grava o que
  resolveu — não há como forçar isso sem fechar um caixa de verdade.
- Os 3 abatimentos de PIX de cliente feitos **depois** do snapshot da planilha
  (13/11 10h) explicam a diferença observada entre app e planilha, ao centavo:

| Fornecedor | Planilha (13/11 10h) | Abatido depois | App agora |
|---|---|---|---|
| H2O | 29.144,32 | −115,00 (fecho 13/11 15:31) −1.087,00 (fecho 14/11 10:03) | 27.942,32 |
| ADL | 23.283,68 | −280,00 (fecho 13/11 17:24) | 23.003,68 |
| **Total** | **103.014,16** | **−1.482,00** | **101.532,16** |

Planilha está velha por 1.482,00 exatos; o app está certo. A planilha precisa dessa
atualização para voltar a bater — decisão do dono se ele quer que eu edite ou se ele
mesmo atualiza.

## Revisão independente da rodada d07b549 — CONCLUÍDA (2 revisores externos)

Dois pareceres independentes, **ambos: seguro para o financeiro**.

**Claude Code (CLI headless, somente leitura):**

| Arquivo | Parecer |
|---|---|
| `app/painel/contas/page.tsx` | sem mudança de cálculo (só `Promise.all`) |
| `lib/saldos-contas.ts` | sem mudança de cálculo (lotes de 300 em paralelo, mesmos filtros, `fetchAll`) |
| `lib/saude-financeiro.ts` | sem mudança de cálculo (produtos só p/ estoque negativo via `fetchAllIn`; mesmos ids) |
| `app/painel/fiados/page.tsx` | sem mudança de cálculo (lotes em paralelo, ids distintos por mapa) |
| `app/painel/fechamento-mes/page.tsx` | sem mudança de cálculo (avisos no `Promise.all`, mesmos filtros) |
| `app/api/telegram/comprovante/route.ts` | mudança **de propósito**: `slice(0,10)` UTC → `diaSP` (SP); AAAA-MM-DD preservado |

Achados baixos do Claude: (a) `saldos-contas.ts` engole erro de lote (`data ?? []`) —
silencioso pré-existente; (b) `lojasPromise` sem catch em `fiados/page.tsx`;
(c) `diaSP` devolve "Invalid Date" com entrada inválida (não ocorre na prática).

**Antigravity (plataforma da Google; agentes Gemini — `agy` CLI):** parecer completo,
arquivo por arquivo: todos "sem mudança de cálculo", exceto o comprovante Pix
(mudança intencional de fuso); tabela de caça toda "inalterada" (`valor + taxa`
preservado, `status='pago'/'concluida'/'aberto'` idem, `fetchAll`/`fetchAllIn`
mantidos, sem `.contains` em JSONB, builders novos por lote). Veredito literal:
**"SEGURO PARA O FINANCEIRO."**

**Por que o Antigravity falhava antes:** não era a rede — o **sandbox do shell
cortava o TLS/streaming** do binário (prova: via schannel, até `www.google.com`
resetava com `SEC_E_NO_CREDENTIALS`; com acesso pleno, `www.google.com` = 200 e
`generativelanguage.googleapis.com` = 404 normal). Rodando `agy` direto com acesso
pleno, o parecer saiu completo.

## Nada novo quebrado

- Trocas da INOVA seguem `enviada` com 0 abatido (abatem só quando o fornecedor
  confirmar, pelo botão "abatida").
- Descontos de novembro: 46 lançamentos / 1.310,21, nenhum colado a caixa ou conta.
- Zero lançamento sem loja; nenhuma nota pendente com `valor_pago`.

## ✅ F9 homologado com venda real (produto, não teste unitário)

Venda real com fiado (venda #13501, R$ 2,30, cliente `__QA__`) → quitação pelo **F9
na tela** → banco conferido: lançamento `pago`, `valor_pago` 2,30, forma "Dinheiro",
histórico com 1 linha e movimento de caixa "Fiado recebido — __QA__CHECKUP_F9".
Reversão total: movimento e operação idempotente apagados, venda cancelada pela RPC
`cancelar_venda`, estoque de volta a 57, **0 resíduos** (lançamentos 0, movimentos 0,
cliente 0; as 4 vendas de teste canceladas foram removidas). Backup em
`docs/registros-banco/2026-11/backup-f9-homologacao-*.json`.

## Continua pendente (fora deste checklist)

1. **ADL 440,40 — ENCERRADO, nada a reaplicar.** A conta de 12/11 fechou: o
   fechamento abateu 440,40 (435,20 na nota 115 + 5,20 na nota 114) e a noite
   abateu 3.599,00; junto dá 4.039,40 = exatamente o que o app resolveu na janela,
   e os 53,60 que chegaram 18:33 foram para a sessão seguinte. Prova no dado
   atual: dívida da ADL = 23.003,68 = planilha (23.283,68) − 280,00 (único
   abatimento pós-snapshot). O texto do commit `c2b3c20` ("440,40 sem baixa")
   repetia a versão errada do primeiro checkup — a correção `7f8d23e` já havia
   registrado que o achado não existia.
2. **56 fiados sem `pessoa_id` — ENCERRADO, não é pendência.** Contei
   `pessoa_id is null` cru; a régua oficial (`scripts/conferir-fiado-por-cliente.mjs`)
   mostra que os 56/56 estão ligados ao cliente **pela venda** (`venda_id →
   venda.pessoa_id`, critério da tela Fiados) e que notas **sem dono
   identificável = 0 (R$ 0,00)**. O defeito de origem (fiado nascer sem
   `pessoa_id`) foi detectado e corrigido em **27/10** — migration
   `20261027200000_finalizar_venda_fiado_com_pessoa.sql`, commit `ebe9cc6`;
   as 56 são legado do import antigo (até 28/10). Falha de comunicação deste
   checkup: item "morto" voltou como pendência viva por eu não ter rodado a
   régua existente — não havia nada a vincular.
3. **Reposição — resolvido no mesmo dia (`9c17b00`).** Medição em produção
   (warm): a tela era 1,24 MB / 2,36s com 529 linhas, e 2,87 MB com
   `?tudo=1` (1.362 linhas). O gargalo era payload, não servidor (dc 1,7s).
   Corte: tabela paginada em 100 por página com o componente `Paginacao` do
   sistema. Depois: **0,33 MB nas duas visões (−73% e −88%), warm ~1,9s**.
   Verificado: página 1 mostra "1–100 de 529", página 2 "101–200", `tudo=1`
   "1–100 de 1.362", filtro de depósito preservado, contagem de linhas 100.
   As outras telas "pesadas" medidas hoje eram cold start do Vercel, não tela
   lenta: Contas 8,4s→1,3s, Promoções 5,4s→0,8s, Descontos 10s→0,95s (warm).
