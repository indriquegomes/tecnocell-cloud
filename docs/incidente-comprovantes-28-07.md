# Incidente Comprovantes Pix — 28/07/2026

Relatório de **todos os problemas e bugs** do dia com o bot de comprovantes. Caixa do
Teresópolis fechou (contagem real das meninas) em **R$ 6.497,20**. O sistema, depois de
tudo, chegou em **R$ 6.371,20** — faltam **R$ 126,00**. Abaixo: por que, e o que quebrou.

## Resumo do rombo (Teresópolis) — ✅ RESOLVIDO

- **Correto (caixa real):** R$ 6.497,20 · 36 comprovantes
- **Sistema agora:** R$ 6.497,20 · 36 comprovantes ✅ **bate exato**
- **O R$ 126 era:** R$ 50 (Weverson) + R$ 76 (Denilson) — **pagamentos reais** que meu
  dedup por (valor+nome) juntou errado como duplicados. O Vitor mandou o caixa por
  destinatário (ADL 2.267 · H'O 1.170 · PC 180 · CORA 2.880,20) e a comparação valor-a-valor
  apontou exatamente esses dois. Restaurados de "duplicado" → "extraido".
- ⚠️ Ressalva: o par do Weverson R$50 tinha E2E idêntico nos dois (normalmente = mesmo Pix);
  o caixa exigiu 2× R$50, então ou ele pagou 2× (2ª leitura pegou o mesmo E2E), ou o 2º R$50
  real é de outra pessoa cuja imagem se perdeu. Em todo caso o **total e a quebra por valor
  batem** com o caixa.

## Bugs / problemas — do mais grave ao menor

### 🔴 1. Chave Anthropic do Vercel SEM CRÉDITO → bot parou de ler calado
A chave do Vercel era de **outra conta**, e essa conta estava com crédito zerado
("credit balance too low"). Resultado: **produção não lia NADA** (foto nem PDF), e o erro
só aparecia no log — o comprovante ficava eternamente "não lido". Sua hipótese
("a chave do Vercel tá diferente") estava certa. → trocada pela chave da `.env.local`.

### 🔴 2. Espelho de apagados ZEROU o caixa (67 comprovantes reais)
O `/revisar` tinha um "espelho" que tirava da planilha o que fosse apagado no Telegram.
Mas o grupo tem **auto-delete** (147 de 313 mensagens sumiram sozinhas). O espelho leu
"msg não está no grupo" = "comprovante inválido" e marcou **67 comprovantes REAIS** como
apagados → zerou o caixa. Restaurei os 67 e **removi o espelho de vez** (deploy 32c097b).
**Regra: deletar mensagem ≠ pagamento inválido.**

### 🔴 3. Rebuild + reverts PERDERAM R$ 126 (o rombo de hoje)
Pra limpar a bagunça, reconstruí o Teresópolis lendo o grupo. Só que:
- O grupo já tinha **auto-deletado** vários originais.
- Eu tinha reenviado só 35 imagens (as que sobraram no banco naquele momento).
- Comprovante cuja imagem sumiu **e** não foi reenviada → o rebuild não acha → some.

O `fill-teres` também importou as imagens reenviadas **em dobro** (novos msg_ids) →
inflou pra R$ 8.507 → tive que reverter 36 linhas. Esse revert pode ter tirado junto algum
comprovante legítimo. Somando tudo: R$ 126 a menos que a contagem real.

### 🟡 4. `fetch` sem timeout congelava a função → "não lido"
Chamada travada pro Google/Telegram segurava a função até os 60s da Vercel e o comprovante
ficava sem ser lido. → `fetchT` com timeout de 12s em toda chamada externa.

### 🟡 5. Dedup por (valor + pagador) é agressivo demais
Junta **2 pagamentos reais iguais** do mesmo cliente no mesmo dia (comum no atacado) como
se fosse 1. Foi o que criou a dúvida Ravena R$100 e Denilson R$76. O dedup **confiável** é
só por **ID de transação** (E2E). Sem ID, não dá pra afirmar que é duplicado.

### 🟡 6. Deduplica ressuscitava status "apagado"
O agrupamento de duplicados reincluía comprovantes já marcados como apagados. → excluídos
do dedup.

### 🟡 7. `transacao_id` com espaço / char invisível furava o dedup
A IA lia o ID com lixo no meio → dois iguais não batiam. → `limpaId` (só letras/números).

### 🟡 8. Parser quebrava quando a IA "pensava" depois do JSON
→ `primeiroJson` pega o primeiro `{...}` balanceado.

### 🟡 9. Fotos sumiam no `/fechar`
Flood de reenvio + limite de 60s. → worker de reenvio **pausado**, se auto-chamando.

### 🟢 10. Imagem enviada como ARQUIVO falhava no `sendPhoto`
→ fallback `sendPhoto` → `sendDocument`.

### 🟢 11. msg90 saiu com dados de outro cliente (Luciano)
Contaminação dos meus próprios scripts manuais. → re-extraído do original.

### 🟢 12. Meu script de conferência lia coluna errada (`remetente`)
A coluna é `pagador`. O Supabase devolveu **erro silencioso** (data=null) e eu li "0 linhas".
→ sempre checar `.error` e usar o nome certo.

### 🟢 13. Ordem do PDF não é a real
Como os originais auto-deletaram e eu reenviei em bloco, a "ordem de lançamento" do PDF é a
**ordem do reenvio** (tudo 14:xx), não a hora original. Irrecuperável.

## Causas-raiz (o que de fato quebrou o dia)

1. **Auto-delete no grupo** quebra qualquer lógica que assume "msg no grupo = verdade"
   (espelho E rebuild). O grupo NÃO é fonte confiável — some mensagem sozinha.
2. **Chave do Vercel ≠ `.env.local`** (contas diferentes), sem alerta quando o crédito acaba.
3. **Erros silenciosos** (Supabase coluna errada, API sem crédito) — sempre checar o erro.
4. **Mexer no dinheiro em produção sem backup por operação** — meus scripts manuais
   (fill em dobro, reverts) contaminaram/perderam dado. Cada operação de escrita em
   comprovante precisa de backup imediato antes.
5. **Dedup só é confiável por ID de transação.** Valor+nome gera falso-duplicado.

## Como fica o caixa

- Duplicados provados (mesmo ID): Denilson R$2, Weverson R$50, Sidney R$179 — corretos.
- Duvidosos (um com ID, outro sem): Ravena R$100, Denilson R$76 — **não dá pra provar**.
- R$ 126 sumiram num comprovante cuja imagem não existe mais no grupo.

**Pra bater com o caixa real (R$ 6.497,20):** ou você identifica o comprovante que faltou
(quem pagou / valor), ou eu lanço uma linha de **ajuste de R$ 126,00** na planilha, marcada
como "ajuste — comprovante perdido no incidente de 28/07", pra fechar com a contagem real.

## Estado do bot: DESLIGADO (manual)
Webhooks removidos, worker parado. Ver `docs/bot-comprovantes.md` pra religar.
