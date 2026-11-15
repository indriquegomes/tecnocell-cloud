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

## Nada novo quebrado

- Trocas da INOVA seguem `enviada` com 0 abatido (abatem só quando o fornecedor
  confirmar, pelo botão "abatida").
- Descontos de novembro: 46 lançamentos / 1.310,21, nenhum colado a caixa ou conta.
- Zero lançamento sem loja; nenhuma nota pendente com `valor_pago`.

## Continua pendente (fora deste checklist)

1. **ADL 440,40 — ENCERRADO, nada a reaplicar.** A conta de 12/11 fechou: o
   fechamento abateu 440,40 (435,20 na nota 115 + 5,20 na nota 114) e a noite
   abateu 3.599,00; junto dá 4.039,40 = exatamente o que o app resolveu na janela,
   e os 53,60 que chegaram 18:33 foram para a sessão seguinte. Prova no dado
   atual: dívida da ADL = 23.003,68 = planilha (23.283,68) − 280,00 (único
   abatimento pós-snapshot). O texto do commit `c2b3c20` ("440,40 sem baixa")
   repetia a versão errada do primeiro checkup — a correção `7f8d23e` já havia
   registrado que o achado não existia.
2. **56 fiados em aberto sem cadastro** — 4.595,00 (55 Petrópolis, 1 Teresópolis).
3. **Reposição — resolvido no mesmo dia (`9c17b00`).** Medição em produção
   (warm): a tela era 1,24 MB / 2,36s com 529 linhas, e 2,87 MB com
   `?tudo=1` (1.362 linhas). O gargalo era payload, não servidor (dc 1,7s).
   Corte: tabela paginada em 100 por página com o componente `Paginacao` do
   sistema. Depois: **0,33 MB nas duas visões (−73% e −88%), warm ~1,9s**.
   Verificado: página 1 mostra "1–100 de 529", página 2 "101–200", `tudo=1`
   "1–100 de 1.362", filtro de depósito preservado, contagem de linhas 100.
   As outras telas "pesadas" medidas hoje eram cold start do Vercel, não tela
   lenta: Contas 8,4s→1,3s, Promoções 5,4s→0,8s, Descontos 10s→0,95s (warm).
