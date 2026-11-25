# Passagem de turno — TecnoCell

> **Este é o único arquivo de passagem de turno.** Quem começa uma sessão lê este
> arquivo primeiro; quem termina reescreve a seção "Nesta rodada" e mantém o
> histórico (não apague linha: o que fechou vira histórico).
>
> Regras do projeto: `AGENTS.md`. Como o sistema funciona: `docs/mapa/`.

**Última atualização:** 24/11/2026 — fim do dia (quadro Resultado/Tenho/Devo na tela de Fechamento do Mês, régua única do DRE em `lib/dre.ts`).

## ESTADO ATUAL — leia isto antes de qualquer outra coisa

**Onde a gente está:** o mês **ainda está aberto** (fecha em **30/11**) e falta a contagem de
estoque. Os números abaixo são **parciais até 23/11** — não são o fechamento. O resultado
parcial é de **−R$ 50.405**, e no ritmo de venda atual (R$ 19.973/dia em 18 dias abertos,
margem 21,7%) o mês deve fechar em **torno de −R$ 25 mil**. A alavanca nos dias que restam
não é vender mais, é **devolver menos**: cada R$ 1 de devolução evitada vira R$ 1 no
resultado (o custo da peça já está contado).

### Os números de novembro (as duas lojas, lojas fechadas)

| | Petrópolis | Teresópolis |
|---|---|---|
| Venda bruta | R$ 202.722,08 | R$ 178.026,67 |
| (−) Devoluções (sai da receita) | − R$ 47.739,62 | − R$ 44.630,57 |
| Receita líquida | R$ 154.982,46 | R$ 133.396,10 |
| Custo das peças (bruto) | − R$ 146.625,31 | − R$ 126.124,73 |
| (+) Custo devolvido (peça voltou) | R$ 25.303,06 | R$ 21.560,10 |
| Custo líquido | − R$ 121.322,25 | − R$ 104.564,63 |
| Lucro bruto | R$ 33.660,21 | R$ 28.831,47 |
| (−) Despesas | − R$ 76.593,53 | − R$ 36.610,02 |
| **Resultado** | **− R$ 42.933,32** | **− R$ 7.778,55** |

Conferência do dono (pedida por ele, fechada em 23/11): **entrada de pagamentos × saída de
itens** → R$ 380.675,02 × R$ 380.748,75 = diferença de **R$ 73,73 (0,02%)**. A venda fecha.
Rode com `scripts/conferir-conta-do-dono.mjs 2026-11` (também imprime o balanço:
prateleira R$ 490.112 a custo · fiado a receber R$ 41.191 · deve fornecedor R$ 144.624 ·
outras contas R$ 97.635 · vale-crédito a honrar R$ 5.297).

### O que foi corrigido hoje (e está no ar)

1. **DRE da devolução** — receita só cai quando o dinheiro/crédito voltou; custo só volta
   quando a peça voltou ao estoque; custo travado na venda. A conta aparece aberta na tela
   (bruta → devolução → líquida) com a quebra **por motivo** (fiado cancelado, vale-crédito,
   dinheiro/PIX, sem reembolso). Commits `2f4507b`, `a49de14`, `1f3bb28`, `81444ab`.
2. **Vale-crédito dobrado** (36 em vez de 18) — paginação sem ordem; `fetchAll` deduplica.
3. **Estorno fora da tela** inflava o vale do PDV — consertado + `buscarSaldoCredito`
   resolve a loja pelo crédito.
4. **Hora do pagamento** gravada como data (pagamento de segunda aparecia no domingo) —
   migrations aplicadas + 2.552 horas recuperadas.
5. **Desfazer recebimento do PDV** funcionando (mesmo dia + caixa aberto + vínculo).
6. **Botão “Avaria · não vende”** na devolução.
7. **Peça quebrada**: baixa como perda lança despesa “Perda: produto” automaticamente.
8. **Conferência por mês**: nenhum conferente traz mais conta de mês fechado.
9. **Quadro na tela de Fechamento do Mês** (24/11; pele Mosaic + grade uniforme em 25/11) —
   grade de caixas do MESMO tamanho, em fileiras iguais: fileira 1 com os 4 KPIs (Resultado,
   Entrou, Saiu, Em mãos); fileira 2 com gráfico Entradas × saídas por semana, Resultado (DRE
   aberto + link), **Agir agora** e **Hoje**; fileira 3 com Tenho, Devo, Descontos e Comparação;
   fileira 4 com Fechar o mês e Resumo (2 caixas iguais). Nenhum texto solto fora de caixa.
   Indicadores (sobra de caixa, livre para retirar, consignado, perdas, trocas, estoque
   consumido) ficam em "Ver detalhes". Mesma régua do DRE de Relatórios (`lib/dre.ts` — a fórmula
   mora em um lugar só; testes em `test/logica.test.ts`). Conferido ao centavo contra a tela de
   Relatórios (Petrópolis: resultado idêntico nos dois lugares). Referência do dono: Cruip
   **Mosaic**, com a estrutura de atalhos do Omie; o dono pediu grade uniforme (sem caixa
   comprida ao lado de caixa pequena e sem texto solto).
10. **Painel financeiro (módulo novo, 25/11)** — protótipo aprovado pelo dono implementado em
   `/painel/painel-financeiro`, com as 3 telas (Início · Metas · Nova movimentação) nos tokens
   dele (fundo creme #F7F3EA, tinta #1F1B3A, verde-menta/coral/azul/amarelo, cartão com contorno
   e sombra sólida). Início lê saldo das contas (fonte única `lib/saldos-contas`), Entrou/Saiu
   do período escolhido (mesma régua do Fechamento), contas a vencer (lançamentos pendentes) e
   últimas movimentações. **Pagar/Receber reutiliza o `marcarPago` do Financeiro** (travas de
   caixa/nota/mês fechado) e volta para o painel via `_voltar`. **Nova movimentação** grava
   lançamento pago com travas (valor, mês fechado, conta pela forma). **Metas de poupança** são
   tabelas novas (`metas_poupanca`, `aportes_poupanca`) — migração
   `2026-11-25-painel-financeiro-metas-poupanca.sql`, **aplicada em 25/11**; mais a coluna
   `escopo` (`2026-11-25-metas-poupanca-escopo.sql`, também aplicada). Guardar desconta do
   "Tenho agora" (reserva) e registra aporte.
11. **Aba Particular vira painel divertido (25/11)** — `/painel/particular` em tela cheia, com
   a estrutura do protótipo divertido aprovado e **cores na paleta do app** (Tenho agora azul
   #1B6CA8 · Entrou emerald · Saiu rose · Sobrou sky · Dica em laranja #F47920). Início (Não
   esqueça! com **Paguei!** sem tocar no caixa da loja, barras, O que aconteceu), **Meus potinhos**
   (potes pessoais, `escopo='pessoal'`, sem formulário de criação a pedido do dono) e **Anotar
   dinheiro**. O painel financeiro adulto saiu do menu (código fica). Potes iniciais entram pela
   migração `2026-11-25-potes-pessoais-iniciais.sql` (Meta do mês 55.000 · Reserva 20.000 ·
   Equipamentos 10.000, guardado zero) — **aplicar no SQL Editor**; sem ela, Meus potinhos fica vazio.
12. **Monitoramento de erros no ar (25/11, autorizado pelo dono)** — `AlertaErros` (aviso discreto
   no canto do master), `MonitorErros` no layout raiz, rotas `/api/erros[/novos]` e
   `/api/vigia/erros` (cron de 10 min no `vercel.json`), lista em Saúde do sistema e testes
   (`test/erros.test.ts`, `test/vigia-erros.test.ts`, 15 passando). Foi trabalho de outro agente;
   entrou no commit só com a autorização do dono porque os arquivos estavam fora do repositório e
   o build da Vercel quebrava ("Module not found: @/components/AlertaErros").

### O que falta — SÓ ISTO

1. **Fechar novembro** (Fechamento do Mês) — ação do dono. Os números acima são os que vão
   congelar.
2. **Comparar a dívida do fornecedor** (R$ 144.623,57) com o extrato do fornecedor
   (H2O/ADL/INOVA de novembro) — é a única ponta que a conta do app não prova sozinha.
3. **Contas particulares**: lançar as do mês na aba `/painel/particular` (as 3 antigas já
   foram migradas, R$ 2.096,47).
4. **Aba Particular / potes**: recurso REMOVIDO do app em 25/11 (a pedido do dono) — as tabelas
   `metas_poupanca`/`aportes_poupanca` continuam no banco, invisíveis. Não há migração a colar.

5. **Devolução paga fora do app (estorno do WhatsApp)** — tipo novo "Fora do app (WhatsApp)" em
   Devoluções (commits `4a6eb59` e `95b5f31`): grava a saída como PAGA, não mexe em gaveta nem em
   conta e não pede senha. Testado de ponta a ponta no site com Playwright e venda `__QA__` 999990
   (`e2e/devolucao-fora-do-app.spec.ts` cria e usa a venda por `scripts/qa-fora-do-app.mjs`).
   Os 4 estornos que estavam pendentes no Financeiro (R$ 315,00: MICHEL GARCIA 45, Marcos Vinicius
   Ferreira da Conceição 51, FG ASSISTENCIA 142 e 77) foram marcados como pagos com
   `scripts/consertar-estornos-fora-do-app.mjs` (backup + DESFAZER em `docs/registros-banco/2026-11/`).
   **Falta colar no SQL Editor** duas migrações: `2026-11-25-estorno-credito-sem-conta.sql` (o
   "Cancelar crédito" ganha a resposta "só cancelar (não devo nada)": cancela o vale sem abrir conta
   a pagar) e `2026-11-25-pago-tem-valor-pago.sql` (trigger: linha paga sempre tem `valor_pago` —
   hoje o reembolso de devolução grava 0 e a tela soma R$ 0,00).

6. **Cancelar vale sem devolver dinheiro** — em Créditos de Clientes o "Cancelar" agora pergunta as
   três coisas: "ainda vou devolver" (abre conta a pagar), "já devolvi em dinheiro/PIX" (quita e
   registra gaveta/conta) e "só cancelar (não devo nada)" — este último cancela o crédito sem
   criar conta nenhuma (crédito errado, cliente desistiu do vale, ou reembolso já pago fora do app).
   Antes esse caso era impossível: a trava de 22/11 recusava e o vale ficava preso no saldo.
   Testado no site (Playwright `e2e/vale-cancelar-sem-dinheiro.spec.ts` + `scripts/qa-vale-cancelar.mjs`):
   crédito de R$ 25 cancelado, saldo zerado, **zero lançamentos** criados. As duas migrations
   (estorno sem conta e trigger do valor_pago) foram aplicadas em 25/11 e conferidas no banco.
5. **Bot do WhatsApp (25/11)**: foi **recomeçado do zero no modo mínimo** —
   `bot-whatsapp/pix.mjs` responde **só** "qual o PIX" (chave lida de
   `contas.chave_pix` da conta bancária da loja; hoje PagBank Petrópolis,
   `67.262.680/0001-92 · STOR ONE LTDA`) e fica em silêncio em qualquer outro
   assunto. Sem IA, sem produto, sem banco local. O bot completo (`run.mjs`) fica
   no repositório, desligado. **Sessão pareada em 25/11 à noite** (o bot estava com
   a credencial morta desde a tarde — causa abaixo; o pareamento foi refeito e o
   reinício do PM2 já reconecta sem QR). Situação a qualquer momento:
   `node bot-whatsapp/status.mjs`; log de prova de vida: cada mensagem recebida sai
   como `recebi de <número> — PIX: sim/não` (sem o conteúdo).

   **Achado 25/11 — bot mudo depois de um tempo (root cause):** o arranque do
   Windows (`TecnoCell-Bot.bat` na pasta Startup) rodava `pm2 resurrect`, e o dump
   do PM2 restaurava o bot ANTIGO (`run.mjs`) **na mesma pasta de sessão**
   (`auth_petropolis`). Dois bots na mesma sessão = `Bad MAC` em massa
   (`tecnocell-bot-error.log`), depois `sessão inválida (500)`, o `pix.mjs` apagava
   a credencial e o bot caía no QR — "com um tempo ele para de responder". Correções
   (25/11): (a) o `.bat` agora roda `pm2 start ecosystem.config.cjs` + `pm2 save`
   (fonte única — nunca mais volta o `run.mjs`); (b) `pm2 delete`/start pelo
   ecosystem + `pm2 save`, então o dump não tem mais `run.mjs`; (c) `pix.mjs` não
   apaga mais a credencial no erro 500 (transitório) — só 401/405/409/412/440 pedem
   QR novo.

6. **Monitoramento de erro em uso — falta só 1 variável.** Estado em 25/11 (fim do dia):
   - **No ar:** commit `83f06ef` (avisos de tela religados + correção da descoberta do Telegram).
   - **Banco:** migration `2026-11-24-erros-app.sql` **aplicada** em 25/11 pela API de
     administração do Supabase (14 colunas, RLS ligado, **0 policies**, 4 índices). O arquivo
     agora está no repositório.
   - **Destino:** bot **@Tecnocellerros_bot** (dedicado, sem webhook). O dono mandou `/start`;
     o chat (`901717187`) ficou salvo em `configuracoes` → `erros_chat`. Não precisa digitar
     `chat_id` nem criar grupo — conversa direta com o bot basta.
   - **FALTA:** cadastrar **`TELEGRAM_TOKEN_ERROS`** (token do @Tecnocellerros_bot) nas
     variáveis da Vercel. Provado em produção: o cron das 19:00 viu o erro de teste, resolveu o
     destino (`chat_ok: true`) e **não conseguiu enviar** (`avisado: false`) — sem a variável o
     app cai no token do bot de Petrópolis, que não pode falar nesse chat.
   - Depois: rodar um erro de teste e confirmar a mensagem; revogar o token `sbp_...` e o token
     antigo do bot. Detalhe: `docs/mapa/monitoramento-erros.md`.

### Não é para reabrir (decidido com o dono em 23/11)

Sobra de R$ 10,20 do caixa · 4 vale-crédito/estorno já fechados · Banco Original, DPVAT,
acordo 135/2026, nota fiscal de troca (não existem no banco) · 598 lançamentos de venda sem
forma (a forma está em `pagamentos_venda`) · R$ 530 de estorno do RODRIGO PEREIRA · ISEC
−R$ 230 (é de 31/10, está em `docs/registros/2026-10/achados-pos-fechamento.md`) ·
R$ 1.699,89 de compras em dinheiro fora do app (decisão: a partir de dezembro, lançar no dia).

### O que está esperando decisão (não está em andamento)

`docs/futuras-opcoes.md` — regra do “teste”, saída para teste no estoque, quebra de caixa
separada de perda, conferente de perda, lista de devoluções no DRE, backfill de vínculo,
cartão “quanto sobrou pra mim”.

## Nesta rodada (23/11/2026) — particular ligado e data de vencimento certa

**1. As contas pessoais que já estavam lançadas foram para a aba Particular.**
Três linhas que estavam em `Retirada do sócio` eram **conta paga**, não saque:
1.499,78 (pagamento de conta a Luiza Lopes Neves, 02/11), 500,00 (retirada a Leoni De
Souza Azevedo, 02/11) e 96,69 (Supercabo TV, internet da casa, 11/11) — **R$ 2.096,47**.
Viraram `Particular` (subcategoria Pessoal · Pessoal · Casa) por
`scripts/passar-particular.mjs --gravar`, com backup e DESFAZER em
`docs/registros-banco/2026-11/`.

**10. Desfazer recebimento do PDV + status Avaria (os dois pedidos do dono).**
Antes, quitação feita no F9 do PDV **não podia ser desfeita**: o botão do Financeiro vinha
desabilitado e mandava para a tela de Fiados, que não tem desfazer — correção de erro de
balcão só por SQL. Agora o desfazer vale para as duas origens, com três travas: **mesmo
dia** (data da baixa = hoje), **caixa aberto** e **movimento ligado ao lançamento** (a
prova de que o dinheiro entrou). A RPC `desfazer_pagamento_atomico` passou a apagar também
`origem 'pdv'`/`'correcao'` — migration `2026-11-24-desfazer-pagamento-aceita-pdv.sql`
**aplicada em 23/11** (conferido no `pg_proc`), e a action tem rede de segurança que limpa
o movimento se a RPC do banco estiver velha.
Na devolução entrou o status **`Avaria · não vende`**: peça quebrada sai do estoque e não
volta a ser vendida (o RPC já trata status diferente de `ok` assim). Hoje a peça avariada
**não gera despesa** — só baixa de estoque; virar "Perda de troca" no mês é decisão do dono.
**Teste na tela com a Maria Julia de Souza Ferreira Carvalho** (fiados #11213 R$ 7,90 e
#14425 R$ 5,00): F9 quitou as duas com hora real e **dois** movimentos (um por dívida, com
`lancamento_id` e `origem pdv`); o Desfazer ficou habilitado e devolveu o fiado a pendente
com 0 movimentos. Tudo revertido. Script: `scripts/teste-tela-f9-desfazer.mjs`.
Correção de leitura: os "598 lançamentos sem forma" **não são quitação** — são lançamentos
de venda criados pela `finalizar_venda`, cuja forma está em `pagamentos_venda`. Nada de valor, data, forma ou conta foi tocado: é
rótulo, e a despesa do mês continua a mesma. `Retirada do sócio` de novembro ficou
**R$ 0,00** — a aba agora mostra: pró-labore 5.976,00 (pago 20/11) − contas
particulares 2.096,47 = **sobra R$ 3.879,53**.

**2. A aba mostrava o vencimento um dia antes.** `data_vencimento` é `timestamptz` e
data pura entra como meia-noite UTC — 21h do dia anterior em São Paulo. O
`formatDate` tratava como instante: conta do dia 02/11 aparecia como 01/11 (o mesmo
defeito existia no painel e em Relatórios). Agora `formatDate` reconhece meia-noite
UTC como DIA; instante de verdade continua convertido. 5 testes novos em
`test/logica.test.ts`. Armadilha registrada no `AGENTS.md` §9. No ar em `868b4cb`,
conferido na tela: 02/11 · 02/11 · 11/11 · 20/11.

**3. Os quatro itens que o dono não reconhecia saíram da lista.** Nenhum é dinheiro de
novembro: "Banco Original R$ 10.000" e "DPVAT/licenciamento HPG-8E31 R$ 299,24" e
"acordo 135/2026 R$ 200/mês" **não existem** em `lancamentos` nem em `movimentos_caixa`
(varredura por descrição e motivo); "nota fiscal de troca" é documento do fornecedor,
sem valor a lançar. Foco daqui até o fechamento: **mês 11**.

**4. Funcionário não vê o dinheiro do dono no Financeiro.** As linhas `Pró-labore`,
`Retirada do sócio` e `Particular` (e qualquer linha que cite o nome do master) saíram
da lista, dos totais, dos cartões, das opções de filtro e do CSV para quem não é master.
A régua é uma só (`lib/visibilidade-dono.ts`, `semODoDono`) e os nomes do dono vêm do
cadastro de perfis (`is_master`), não de nome fixo no código. Para o master nada mudou.
Armadilha que isso evitou: `not.in` em SQL é nulo quando a coluna é nula, então o filtro
"ingênuo" apagava toda linha sem categoria e toda linha sem pessoa — conferido no banco
(7.522 contra 7.523) e travado por 4 testes.

**5. Peça quebrada não pode voltar para o estoque vendável.** A devolução de 12/11 marcou
a TAG RASTREADORA A'GOLD TCD-06F quebrada como `ok` (status de "peça boa, volta a
vender") e o RPC devolveu a peça ao estoque da loja — 3 unidades, uma delas quebrada.
Baixa corrigida como **perda** e item marcado `avaria`.
**Furo que continua no app:** a tela de devolução só oferece `OK · Venda` e
`Troca · Saída`; não existe botão "peça quebrada/avaria". Quem recebe uma peça quebrada
não tem o que marcar, e o padrão (`ok`) manda a peça de volta para vender. Decisão do
dono pendente: criar o botão `Avaria` (e dizer se a perda vira despesa no mês).

**6. O "🎟️ Vale" da tela de Fiados mostrava o DOBRO.** No dia 23/11 a cobrança saiu com
`Vale R$ 36,00` para o cliente AD CELL BINGEN, cujo extrato dá **R$ 18,00**. Causa: a
leitura de `creditos_clientes` era paginada por offset **sem `ORDER BY`** — o PostgREST
pode devolver a mesma linha em duas páginas, e a soma por cliente contava o movimento
duas vezes. Não era só dele: FORCELL CENTRO aparecia com 112 (certo: 56), BRUNA ALVES
220,76 (certo: 72), HIPERCELL 173 (certo: 79). Corrigido em duas camadas: `.order('id')`
na consulta de créditos e **`fetchAll` descarta `id` repetido** (rede de segurança para
as 214 chamadas paginadas do app). Conferência que prova: `scripts/conferir-vale-tela-vs-banco.mjs`
— antes 2 dobrados e 15 divergentes, agora os 10 clientes com vale batem centavo a
centavo. Também ganharam `.order('id')` as somas de dinheiro de `lib/saldos-contas.ts` e
o cartão "A Receber/A Pagar" do Financeiro. 3 testes novos em `test/robustez.test.ts`.
Armadilha registrada no `AGENTS.md` §9.

**7. Os estornos de 22–23/11 foram gravados FORA da tela e deixaram o saldo errado por
loja.** Três estornos (`RODRIGO PEREIRA` 1.000,00 · `LUIZ CARLOS SANTANA` 67,00 ·
`DENILSON PEÇAS` 45,00) entraram com `loja_id` nulo e sem `estorna_credito_id` — o
caminho da tela (RPC `estornar_credito_cliente`) copia a loja do crédito, liga o vínculo
e recusa estorno que deixaria saldo negativo; por SQL as três travas foram puladas. Como
o saldo é lido **por loja** (é o teto do PDV), o crédito continuava inteiro na loja e o
estorno caía num balde "(sem loja)": **o PDV mostrava 1.025,50 de vale para o RODRIGO
quando o real é 25,50**, 67,00 para o LUIZ e 45,00 para o DENILSON — crédito que não
existia, disponível para gastar. Consertado por `scripts/consertar-estornos-sem-loja.mjs`
(o estorno de 1.000 que cobria dois créditos virou 750 + 250 ligados, com backup e
DESFAZER). Agora os três mostram 25,50 · 0 · 0, e os alarmes 4 e 6 do
`conferir-estornos-credito.mjs` pegam a recaída. `buscarSaldoCredito` passou a resolver a
loja do estorno **pelo crédito que ele cancela**, então nem um estorno feito na mão
consegue inflar o vale do PDV.

**8. Conferência do mês passou a ser SÓ do mês.** A conferência de estornos lia
lançamento desde `2026-09-01` fixo e mostrava saldo de vale acumulado de toda a vida do
cliente — então a lista de novembro vinha com conta de setembro/outubro no meio (o caso do
ISEC é de **31/10**). Corrigido: toda consulta recorta pelo mês (`data_vencimento`/
`created_at` dentro do mês), e o alarme de "saldo negativo" virou "estorno **deste mês**
que passou do saldo". O que atravessa mês é **saldo**, não conta: dívida de cliente em
aberto (fiado) e saldo de vale-crédito, lidos como saldo do dia. Achado de mês fechado vai
para `docs/registros/2026-10/achados-pos-fechamento.md` — não para a lista de novembro.
Regra escrita no `AGENTS.md` §9.

**9. "Recebimento no domingo" era hora de pagamento gravada como data.** O dono avisou
que domingo a loja não abre, e a conferência tinha apontado pagamento no domingo 22/11.
Conferido: **zero venda, zero caixa, zero movimento de gaveta, zero devolução** no
domingo — a loja não abriu mesmo. O que aparecia era a RPC `receber_fiado_reais` gravando
`data_pagamento = (now() at time zone 'America/Sao_Paulo')::date` — **data pura** numa
coluna `timestamptz`, que vira meia-noite UTC = **21h do dia anterior** em São Paulo.
Assim, pagamento de segunda 23/11 aparecia como domingo 22/11 às 21h. Em novembro isso
afeta **3.240 dos 3.998** lançamentos pagos. A hora real de cada baixa está em
`historico_pagamentos`.
Correções prontas: migration `2026-11-24-fiado-data-pagamento-real.sql` (troca o `::date`
por `now()`; resto do corpo idêntico) e `scripts/consertar-hora-pagamento.mjs` (devolve a
hora das 2.550 linhas que têm a hora no histórico; 690 não têm hora em lugar nenhum, mas o
dia está certo). O script de conferência passou a tratar data pura como DIA, então esse
falso alarme não volta.
**Aplicado em 23/11 (o dono colou no SQL Editor, "Success. No rows returned"):**
`2026-11-24-fiado-data-pagamento-real.sql` e
`2026-11-24-recebimento-lote-instante-e-vinculo.sql` — conferido no `pg_proc`: as duas
funções estão com `now()` e a de lote já cria um movimento por dívida com `lancamento_id`
+ `origem`. O backfill das 2.552 horas foi gravado (backup e DESFAZER em
`docs/registros-banco/2026-11/`).

## Nesta rodada (22/11/2026) — dinheiro que estava fora do Financeiro + aba Particular

**O problema que a rodada resolveu:** novembro tinha muito dinheiro que saiu e não
estava no app — reembolso pago por PIX, despesa fixa, retirada de caixa. O resultado
do mês aparecia R$ 33 mil melhor do que foi.

**1. Extrato do PagBank (01–21/11) cruzado com o app.** 130 saídas (R$ 60.387,51):
70 casavam com lançamento, **60 não tinham nada**. Foram lançadas 51 (aluguel
Petrópolis, energia Enel, advogado outubro, contabilidade e honorários de novembro
pendentes, impostos/Receita Federal, FGTS da Caixa lidos por OCR, combustível,
alimentação, confraternização, passagens São Paulo, pró-labore, contas do sócio,
supercabo, Mercado Livre, recarga de cartão, adiantamentos do João Vítor, comissão,
13º 1ª parcela, motoboy, tarifas PagBank). Detalhe e prova de cada uma em
`docs/registros/2026-11/lancamento-novembro.md`.

**2. Lista de estornos do WhatsApp (`Downloads\INDRiQUE Proncipal.zip`).** 39 pedidos,
R$ 5.526,90. Cruzamento com `devolucoes` mostrou o furo: **a devolução era registrada
como "sem reembolso" e o dinheiro pago por PIX fora do app não virava lançamento** —
o RPC só cria `Devolução — nome` quando o reembolso é maior que zero. Resultado:
**51 lançamentos de devolução (R$ 6.509,30)** criados nesta rodada; antes eram 7.

**3. Trava de reembolso (banco + tela).** Migration
`supabase/migrations/2026-11-22-devolucao-exige-forma-de-reembolso.sql` (aplicada no
SQL Editor pelo dono): `registrar_devolucao` recusa reembolso > 0 com
`sem_reembolso`/`cancelamento_fiado` e misto sem nenhuma forma real. Na tela
(`DevolucoesClient.tsx`): "Sem reembolso" deixa de existir quando há valor a devolver,
aviso vermelho de saída não lançada, aviso âmbar em venda fiada e prévia do
vale-crédito que nasce.

**4. Retiradas de caixa de 03–05/11 (R$ 1.005,70).** Investigadas uma a uma no app:
10 ligadas ao destino (2 devoluções pagas em dinheiro, taxa, motoboy, 3 quebras de
caixa) e 4 são correção de pagamento (decisão do dono). Caixa conferido depois:
Petrópolis diferença 0,00 · Teresópolis sobra de 5,00 (a de 03/11).

**5. Classificação arrumada.** `Pró-labore` separado de `Retirada do sócio` ·
`Perda de troca` separada de `Perda` · `Bônus` e `Vale transporte` dentro de
`Salários` · categorias novas no catálogo (**Jurídico**, **Tarifas bancárias**,
**Particular**, **Perda de troca**) · **14 linhas sem categoria → 0** · **14 linhas
de fornecedor sem cadastro ligado → 0** (R$ 16.780,70, incluindo os 141,00 de 11/11
que eram do ZL).

**6. Aba nova: `/painel/particular` (master).** Pró-labore do mês, contas
particulares pagas, pendentes e **sobra para retirar**, com navegação de mês e atalho
`+ Nova conta particular` (pré-preenche A Pagar + categoria Particular). Pró-labore
fixo **4.000 Petrópolis + 2.000 Teresópolis**, dia 30 — lançado de dez/2026 a jun/2027.

**7. Bug real achado no check-up:** o botão **"Sair"** estourava
`Cannot read properties of null (reading 'submit')` (o `form.submit()` rodava depois
do `await signOut()`, com `currentTarget` nulo). Corrigido em `94faa83`.

**Check-up:** `docs/registros/2026-11/checkup-22-11.md` e
`docs/registros/2026-11/checkup-particular-22-11.md`. 87 telas em produção (86 OK,
1 falso positivo da impressão) · `tsc` 0 · CRUD da aba com `__QA__` e zero restos.
Commits: `af9ab04` · `1716536` · `7358fa5` · `94faa83` · `7ec235c`.

**Bloco de testes e melhoria sem o dono (22/11, fim da rodada):**

- **Testes de lógica: 249 passando, 0 falhando** em 10 arquivos (eram 238 em 8).
  Novos: `test/particular.test.ts` (10 casos da conta da aba: sobra, cancelado fora
  da conta, pendente não abate, sobra negativa, centavos) e
  `test/financeiro-setores.test.ts` (11 casos: categorias novas no setor certo,
  grafias legadas de mercadoria, sugestão do formulário sem as legadas).
  Obs.: `test/logica.test.ts` sai com código 1 apesar de 86/86 passarem — condição
  anterior a esta rodada, não é regressão; os arquivos novos saem com 0.
- **`npm run build` = sucesso** (Next 16.2.11, 112 páginas geradas).
- **`lib/particular.ts` criado**: o cálculo da aba saiu da página e virou função pura
  testável; a página consome `resumoParticular()`.
- **`scripts/conferir-estornos-credito.mjs` criado** (só leitura): acha estorno com
  conta a pagar aberta e reembolso já pago, crédito estornado que continua no saldo e
  "Estorno de crédito" pendente. Rodado em novembro: **nada a apontar**.
- **Financeiro → filtro**: `Fornecedor / Mercadoria` e `fornecedor/mercadoria` deixaram
  de cair em "❓ Sem categoria" (entraram no setor Fornecedores só para o filtro; a
  sugestão do formulário continua oferecendo apenas `Mercadoria`).
- **Armadilha nova no `AGENTS.md` §9:** estorno de crédito × reembolso já pago (caso
  RODRIGO PEREIRA, R$ 530 fantasma + R$ 1.000 de crédito preso).
- Foto final do mês em `docs/fechamento/2026-11/app.json`: despesas Petrópolis
  R$ 145.100,47 · Teresópolis R$ 116.331,61.

**O que ficou aberto — SÓ ISTO:**

> Consolidado no bloco **ESTADO ATUAL** no topo deste arquivo (fim do dia 23/11). A lista
> viva é aquela: fechar novembro · comparar a dívida do fornecedor com o extrato ·
> lançar as contas particulares do mês.

**Histórico do que esta rodada fechou** (não volta para a lista; cada linha teve prova):

- **Maria Julia de Souza Ferreira Carvalho — R$ 65,00 da TAG quebrada** (devolução de 12/11
  da venda #12938): ela quebrou a peça, não recebe reembolso; a peça saiu do estoque
  vendável como perda (`baixar-tag-quebrada.mjs`, estoque 3 → 2, item marcado `avaria`) e a
  despesa “Perda: TAG RASTREADORA…” (R$ 50,00) nasceu automática no banco. Os R$ 65,00
  estão pagos em PIX desde 11/11. **Fechado.**
- **R$ 1.699,89 de compras pagas em dinheiro fora do app** (Petrópolis 1.049,39 +
  Teresópolis 650,50): o caderno do dono é a verdade. Detalhe em
  `docs/registros/2026-11/divergencias-dinheiro-vivo-23-11.md`. Decisão do dono: a partir
  de dezembro, todo gasto em dinheiro entra no app no dia. **Fechado como decisão.**
- **DRE de novembro**: mudou de régua (ver ESTADO ATUAL). Números conferidos fora da tela
  por `scripts/dre-por-loja.mjs` e pela conta do dono
  (`scripts/conferir-conta-do-dono.mjs`: entrada × saída fecha em 0,02%). **Fechado.**

**Menu do que NÃO está em andamento (decisão futura do dono):** `docs/futuras-opcoes.md`
— regra do “teste” (755 cancelamentos de fiado em novembro, 70% com motivo “teste”, R$
42.750,87), saída para teste no estoque, quebra de caixa separada de perda, conferente de
perda, lista de devoluções dentro do DRE, backfill de vínculo dos recebimentos antigos e
cartão “quanto sobrou pra mim”. Nada disso entra na lista de pendências.

**Fechados em 23/11 — não voltam:** R$ 530,00 de estorno do RODRIGO PEREIRA (cancelado
e crédito estornado) · LK CELL 61,00 (pago em 13/11) · Banco Original R$ 10.000 ·
DPVAT/licenciamento HPG-8E31 R$ 299,24 · acordo 135/2026 · nota fiscal de troca (não
existem em `lancamentos` nem em `movimentos_caixa`; conferido por descrição e motivo).

**RESOLVIDO — não volta para a lista (cada um com prova):**

| Assunto | Prova |
|---|---|
| **14 devoluções / contagem de estoque** | era leitura errada da coluna `devolucao_id`; o dono já tratou. Dinheiro lançado, assunto encerrado |
| **RODRIGO PEREIRA 1.530,90** | está na lista de estornos do WhatsApp; lançado e pago em 19/11 (`Devolução — RODRIGO PEREIRA`) |
| **8 PIX "sem nome"** | todos lançados com o nome de fantasia do cadastro (STAR Manutenção, SUPERCELL, Diego Santos, Control Z…) |
| **3 casos de vale-crédito** (VT CELL 100 · Arthur Dias 55 · Larissa 141) | o crédito foi criado **e consumido** — o cliente recebeu em crédito, não há dinheiro a devolver |
| **Comissão 0,5% de outubro** | não é valor fixo: é precificada nas vendas no fim do mês |
| **R$ 1,00 do Fernando** (pediu 91, saiu 90) | insignificante por decisão do dono |
| **141,00 de 11/11** | atribuído ao ZL (comprovante: FERNANDES DA SILVA) |
| **14 linhas sem categoria / 14 de fornecedor sem cadastro** | classificadas e ligadas ao cadastro (R$ 16.780,70) |
| **Duas devoluções de 250 na venda #12657** | é 1 peça devolvida (`ok`) + 1 em troca (`troca`) do mesmo item — sem duplicidade |
| **Contas pessoais fora da aba Particular** | migradas em 23/11: as 3 linhas de `Retirada do sócio` que eram conta paga viraram `Particular` (R$ 2.096,47) |
| **Sobra de R$ 10,20 do caixa de novembro** | o dono decidiu em 23/11 que já estava tratada — não é pendência e não volta para a lista |


## Nesta rodada (18/11/2026) — importador de nota por foto, encomenda e caixa

**Deduplicação do bot do PIX estava cega** (`app/api/telegram/comprovante/route.ts`).
O `deduplica()` lia `comprovantes_pix` inteira, sem range: o PostgREST corta em 1000
linhas e devolve as mais antigas, então desde meados de outubro (quando a tabela passou
de 1000 linhas) o bot só enxergava setembro — duplicados deixaram de ser marcados e o
grupo parou de receber o aviso "COMPROVANTE JÁ ENVIADO". Correção: TODA leitura de
`comprovantes_pix` no bot passou a ser paginada (`paginar`/`comprovantesRecentes`) —
dedup, planilha, fechar, /revisar, reenvio e histórico. O dedup olha só os últimos 2
dias (cópia antiga não é retrabalhada: já foi paga e enviada) e o aviso no grupo sai só
quando a cópia chega nas últimas 24h. As 19 marcações de duplicado antigas que um
deploy intermediário tinha feito foram revertidas — nada antigo foi tocado. Armadilha
registrada no `AGENTS.md`.

**Despesa "quitada" em dinheiro agora cria a retirada ligada no caixa** (mesma régua do
botão "Pago" com "Saiu da gaveta"). Antes esta ligação só existia no "Pago": quem lançava
a despesa com o checkbox "quitado" fazia o dinheiro sair da gaveta sem movimento e o
fechamento travava com "Saíram R$ X do caixa sem destino" — foi o caso da Teresópolis em
17/11 (motoboy R$ 70,00) e da Petrópolis em 18/11 (motoboy R$ 20,00). O movimento sai com
`origem 'financeiro'` e `lancamento_id`, então o "Desfazer" também o enxerga. Só vale
para forma Dinheiro; PIX/cartão não passam pela gaveta. Quando o lançamento TEM conta
(cofre/banco), a gaveta não é tocada — a saída fica só na conta.

**Checklist da semana** (o que a rodada noturna fechou, 5 testes de erro, 50 ligações
de tela, 86 telas, telas pesadas medidas e limpeza): `docs/registros/2026-11/semana-checklist.md`.

**Importar Nota por Foto** (`Compras → Importar por foto`, rota `/painel/compras/importar`):
a pessoa anexa as fotos da nota que chegou (pode várias páginas), o app lê os itens com a
mesma visão do bot do PIX (Gemini, DeepSeek de reserva) e casa cada item com o catálogo
(nome normalizado, token a token, mínimo 60%). A nota nasce **pendente** — receber (mover
estoque) continua sendo o botão de gente no detalhe da nota. Pedido do dono em 18/11.
Testado com as notas reais da H2O (fotos em `Downloads`): 56 itens lidos, 56 casados;
criação validada de ponta a ponta com Playwright (nota de teste criada e apagada no mesmo
dia). Leitura em `lib/nota-leitura.ts`, testes em `test/nota-leitura.test.ts`. O botão
"Importar por foto" também aparece na tela "Notas de Entrada" e na "Nova Nota de Entrada".

## Nesta rodada (18/11/2026) — encomenda não mexe mais no estoque

**Botão "✓ Chegou" da encomenda não cadastra produto e não dá entrada no estoque**
(`3952d64`). Ele fazia três coisas além de avisar a chegada: criava o produto com o
**texto livre digitado no balcão** (nome torto, duplicado), sobrescrevia o
`preco_custo` do produto que já existia (matando o custo médio ponderado) e somava
quantidade direto na tabela `estoque`, sem passar pelo RPC `movimentar_estoque` —
sem movimentação e **contando a mesma peça duas vezes** quando a nota de entrada
chegava. Agora `aprovarEncomenda` grava só `status`, `custo` e `aprovado_em`.

- A **entrada continua sendo a nota de entrada** (RPC `receber_nota_entrada`: grava
  movimentação, distribui série e recalcula o custo pela média ponderada).
- A atendente **continua podendo encomendar item sem cadastro** — a opção não foi
  tocada (`NovaEncomenda.tsx` e `criarEncomenda` iguais). O que mudou é que a peça
  nova agora precisa de cadastro em **Produtos** antes da nota, porque a nota só
  aceita produto que já existe (`AddItemNota.tsx` busca, não cria).

**Limpeza dos cadastros que aquele caminho já tinha criado** (`69ebd25`, com
`scripts/limpar-produtos-encomenda.mjs` e `scripts/fundir-produto.mjs` — ensaiam por
padrão, fazem backup e recusam quando o cadastro tem item de nota ou número de série):

- **Apagados** (2): nome errado com gêmeo correto no catálogo, estoque 0 e sem venda —
  `frontal sansung m54 original nacional com aro` e
  `11766 - FRONTAL SAMSUNG S23 ULTRA OLED COM ARO`.
- **Fundidos** (4): a venda e o preço de tabela foram para o cadastro que sobrevive —
  TAMPA IPHONE 12 VERMELHA (fica o do SIGE, o clone tinha preço 41 contra custo 45),
  GAVETA SAMSUNG S21 FE CHUMBO (preço 50), GAVETA XIAOMIMI 9T/9T PRO PRETO (preço 40)
  e `frontal poco 81` → **FRONTAL XIAOMI REDMI 15 4G/5G/POCO M7 4G/POCO M7 PLUS 5G/
  NOTE 15R/POCO C81 PREMIUM \*\*ZL\*\* SEM ARO** (a unidade de estoque foi junto).
- **Ficaram (7)**: TAMPA REALME NOTE 60 AZUL · EXTENSOR A71 VERSÃO REVA06 · BOTAO
  EXTERNO VOLUME/POWER SAMSUNG A05 A055 LILÁS · BATERIA SAMSUNG A14 … \*ROX\* · BATERIA
  XIAOMI REDMI NOTE 9 … BM54 \*HK\* · CASE COURO IPHONE 15 · CASE COURO IPHONE 15 PRO
  MAX. Comparados contra os **8.184 produtos** do catálogo, **não são cópia de nada**
  (as *ROX*/\*HK\*/\*PREMIUM\* da mesma bateria e CASE COURO × CAPAS CASE são SKUs
  diferentes), e todos têm venda ou item de nota ligado.
- Backups do estado anterior: `docs/registros-banco/2026-11/backup-produtos-encomenda-*.json`
  e `backup-fundir-produto-*.json`.

**Varredura do catálogo (só leitura):** 15 nomes repetidos em 8.184 produtos e
**nenhum** veio do botão da encomenda. Os grandes grupos são convenção antiga do SIGE
(`COMPONENTE LIVRE` × 403, `CADASTRO INATIVO` × 6, `BATERIA LIVRE` × 3); os pares já
existentes (KIT 6 ESPATULAS AMARELAS, TAMPA XIAOMI MI 9 PRETA, FRONTAL SAMSUNG S10 /
S10 PLUS / S21 PLUS OLED NACIONAL COM ARO, LENTE CAMERA SAMSUNG S9 G960, CHIP VIVO,
GAVETA XIAOMI REDMI 9A AZUL, CAIXA DE SOM KAPBOM KA-8776, MOUSE COM FIO LEHMOX LEY-28,
PENDRIVE/CARTAO DE MEMORIA KAPBOM 128GB) vêm do SIGE. Só um par tem id do app e os
dois estão **inativos**.

**Caixa de Teresópolis da sessão de 16/11 fechado.** O fechamento travava por uma
retirada de **R$ 550,00 lançada em PIX** com motivo "QUITEI ERRADO": a trava recusa
retirada sem lançamento de destino, e o par que foi lançado para "desfazer" (retirada
550 em PIX + reforço 550 em **dinheiro**) **não se anula** — o reforço em dinheiro
somava 550 na gaveta e o esperado ia a R$ 2.016,30 contra R$ 1.466,30 reais.

- A retirada foi removida (era correção de digitação, sem dinheiro saindo) e o caixa
  fechou com contado = esperado = **R$ 2.016,30**, divergência **0**.
- Composição: troco 200,00 + vendas em dinheiro 289,30 + fiado recebido em dinheiro
  1.166,00 + reforço em dinheiro 550,00 − devolução em dinheiro 189,00.
- Rastro: `caixas.pix_resolucao` + `logs_atividade` (`caixa.fechar`) + backup
  `docs/registros-banco/backup-caixa-tere-2026-11-17.json`. Ferramenta:
  `scripts/fechar-caixa-tere-2026-11-16.mjs` (roda em ensaio com `DRY=1`).
- **PIX do dia não foi abatido de propósito**: o único PIX classificado como
  fornecedor (R$ 66,76) caiu em **CNPJ da própria rede**, então não é dívida a abater.
  Ficou registrado como não abatido.

**PIX do dia: dinheiro na chave da loja irmã deixou de virar dívida de fornecedor**
(`022e2cf`). A lista de "nossa conta" usava só o CNPJ da **loja do caixa**; PIX que
caía no CNPJ da outra loja casava com o cadastro de fornecedor dela e o fechamento
abatia dívida. Agora entra o CNPJ de **toda** a rede (lojas + chaves das contas).
Verificado com o caixa de 16/11: os R$ 66,76 passaram a sair como conta própria.

**Revisão independente do corte (Antigravity, 18/11) — "SIM COM RESSALVAS".** Não
sobrou nenhum outro caminho que cadastre produto ou dê entrada no estoque a partir de
`encomendas`: a tabela só recebe `update` de status/custo, criação de produto ficou
restrita a `salvarProduto` e entrada de estoque só pela nota. Sobre o `022e2cf`, o
risco de um PIX real de fornecedor virar conta própria é quase nulo (só o CNPJ das
lojas entrou na lista) e, se acontecesse, o efeito seria dívida ficar em aberto para
baixa manual — **sem perda de dinheiro**. Achados que ele levantou:

- **`EncomendasEspeciais.tsx` exige custo maior que zero** para marcar "Chegou"
  (`!(custo > 0)`). Como o custo virou só registro, isso trava encomenda de peça
  trocada em garantia (custo zero). Corrigir: campo passa a ser opcional.
- **`lib/pix-do-dia.ts` só leva `cnpj` das lojas para `docsProprios`**; se o
  comprovante da loja irmã trouxer só nome/razão social, ela não é reconhecida como
  conta própria. Corrigir: incluir `lojas.nome` em `nomesProprios`.
- **Consequência operacional do corte:** peça que chegou e foi lançada pela nota só
  baixa do estoque se for vendida pelo **cadastro do produto**. Venda como "item
  avulso" (sem `produto_id`) não baixa — sobra estoque. Vale avisar o balcão.

**Checklist de fechamento da rodada:** `docs/registros/2026-11/checkup-18-11.md` —
`tsc` 0 · **229 testes** de lógica · **85 telas** em produção sem erro (só o falso
positivo da página de impressão) · deploy confirmado com o código do dia · zero
referência órfã nova no banco. **Suíte e2e não rodada por decisão do dono** (escreve
no banco de produção; volta depois que as duas lojas fecharem o caixa). **Invariantes
do mês não rodaram**: falta `SUPABASE_ACCESS_TOKEN` no ambiente.

**Importador de nota por foto: parou de escolher a peça errada, e ganhou classe**
(18/11). Dois defeitos no mesmo lugar:

- **Número de modelo virou obrigatório.** A nota dizia "13 INCELL JK" e o app
  escolhia a "11 JK": duas de três palavras batiam e o número não era exigido. Pior,
  a comparação era `includes`, então "11" casava dentro de "A115". Agora compara
  **palavra por palavra** e todo número da nota tem que existir no nome do produto.
  Quando não há a peça certa, a linha fica **sem produto** (a pessoa escolhe na tela)
  — peça errada é prejuízo silencioso, linha em branco a pessoa resolve em 2 cliques.
- **Classe da nota** (`lib/nota-classes.ts`, novo — arquivo sem nada de servidor
  porque a tela usa a mesma régua): campo "De que trata esta nota?" no importador
  (telas/frontais · baterias · películas · tampas/gavetas · placas/conectores ·
  flex/botões · lentes/câmeras · alto-falantes · acessórios) **e** leitura automática
  do que a pessoa escreve no topo da lista ("TELAS E FRONTAIS"). A classe filtra as
  famílias do catálogo (a 1ª palavra do nome: FRONTAL 1.150, TAMPA 980, FLEX 564,
  BATERIA 535, PLACA 357, PELICULA 331…) — o casamento compara contra centenas em vez
  de 8.177 — e encolhe o `<select>` de produto, que listava o catálogo inteiro.
- Testes: `test/nota-leitura.test.ts` foi de 4 para **8 casos** (número obrigatório,
  "11" não casa em "A115", classe separando bateria de frontal, leitura da classe no
  texto livre). Total do projeto: **238 testes**.

**Importador de nota: ajuda na tela, busca no lugar da lista de 8 mil** (18/11). A tela
carregava o **catálogo inteiro** (8.177 produtos, ~meio mega de payload) só para montar
um `<select>` por linha — lista em que ninguém acha nada. Agora:

- **Busca por linha** (`EscolherProduto.tsx`): digita "a15" ou "13 jk" e o servidor
  devolve **no máximo 12** já filtrados pela classe (`buscarProdutosNota`, mesma régua
  de `palavrasBusca`/`aplicaBusca` do PDV, número exigindo palavra inteira). A página
  não carrega mais produto nenhum — quem lança a nota é a **estoquista**, e a tela
  abria pesada por causa disso.
- **"❓ Como lançar a nota"** (`AjudaNota.tsx`, `<details>`, funciona sem JS): os 5
  passos, o que significa produto preenchido / "⚠ conferir" / linha amarela em branco,
  a regra "nunca escolha no chute", o caminho para peça sem cadastro (Produtos → Nova
  peça → volta pra nota) e os quatro erros que já aconteceram aqui. Mesmo padrão do
  "Como fechar" do caixa.

**Nota com várias páginas: a trava era o tamanho, não a tela** (18/11). O importador
recusava várias fotos da mesma nota porque a server action tem teto de **4 MB**
(`next.config.ts`) e a Vercel corta em ~4,5 MB — foto de celular tem 2–4 MB cada, então
**3 páginas da nota da ADL (R$ 20.523,00) já estouravam** e o envio morria. Tentativa de
"uma nota por foto" foi descartada pelo dono: 3 páginas viram 3 notas com valor quebrado.

- **As fotos são comprimidas no navegador** (`lib/comprimir-foto.ts`: lado maior 1700 px,
  JPEG 0,72; foto já pequena não é recomprimida). Uma nota de ~10 páginas cabe no envio.
- **A leitura passou a ser FOTO POR FOTO** — era o outro furo: mandando as páginas numa
  chamada só, o motor de visão transcrevia **apenas a primeira imagem** e a nota de 3
  páginas vinha com 1/3 dos itens. Agora lê 3 fotos por vez (em paralelo, para não
  estourar o provedor) e soma as listas na ordem das páginas. Página que não render
  nada vira **aviso amarelo com o número dela**, em vez de sumir em silêncio.
- A tela mostra o total escolhido e o total enviado depois de comprimir.
- Teto do servidor em 3,8 MB, com mensagem dizendo para dividir em duas leituras da
  MESMA nota quando não couber.
- **Todas as fotos continuam virando UMA nota** — os itens das páginas somam.

**Pendências que esta rodada deixou — só uma é código:**

1. **✅ As duas correções da revisão foram aplicadas:** custo da chegada virou **opcional** (peça de garantia/troca entra com
   custo zero) e o **nome da loja** entrou na lista de conta própria do PIX do dia,
   travado por dois casos novos em `test/pix-destinos.test.ts` (nome da loja casa;
   fornecedor que cita a cidade no meio do nome continua fora).
2. **✅ A trava de retirada foi alinhada com a régua da gaveta (A+C, 18/11).** A trava
   recusava qualquer retirada sem destino escrito, olhando só `tipo` — mas
   `calcular_valor_esperado` soma apenas forma **dinheiro**. Resultado: retirada lançada
   em PIX (que não tira cédula nenhuma) travava o fechamento de um caixa correto — foi o
   que aconteceu em Teresópolis. Conserto em três frentes:
   - **origem (A):** `registrarRetirada` só aceita forma dinheiro — o `<select>` da tela
     passou a oferecer só isso e o **servidor recusa** forma errada, com a mensagem
     apontando o caminho certo (Contas → transferência, ou Financeiro → Pago).
   - **trava:** passou a considerar só `forma_pagamento ilike '%dinheiro%'` — dinheiro
     sem destino **continua travando**, que é o que ela existe para proteger.
   - **aviso (C):** retirada não-dinheiro sem destino virou aviso amarelo no fechamento
     (`lib/avisos-caixa.ts`, `retiradasForaDaGavetaSemDestino`), nunca bloqueio — a
     gaveta está certa, mas o dinheiro saiu da conta sem rastro.
   Teste novo em `test/avisos-caixa.test.ts` (avisa e **não** pede ciência). Estado atual
   do dado: 67 retiradas não-dinheiro sem destino no histórico, **todas anteriores a
   06/11** e **nenhuma em caixa aberto** — não há nada travado hoje.

**O que NÃO é pendência (verificado em 18/11, para não voltar como fantasma):**

- **PLANETA CELL 12.324,96** é o valor do app, sem diferença marcada no registro
  oficial (`docs/registros/2026-11/baixa-de-pagamento-em-nota.md` §15). Não existe
  "−231,00 em aberto".
- **R$ 95,00 da ADL** está nomeado e é do lado da **planilha**: algum pagamento saiu
  da planilha de 13/11 para a de 17/11 (`baixa-de-pagamento-em-nota.md` §14). O dado do
  app está certo; quem responde é o dono, com a planilha na mão.
- **Peças de troca sem fornecedor** é **métrica** de qualidade, não tarefa: 42 peças /
  R$ 2.827,69 em 17/11 (`conferencia-trocas-2026-11-17.md`). Varia com o movimento.
- **Os avisos do `conferir-divida-fornecedor.mjs`** ("pagamento virou dívida", "nota
  não fecha") são a **convenção do app** sendo acusada: o script soma `valor` +
  histórico, e o abatimento fica gravado no `valor` com o texto na descrição. A dívida
  por fornecedor já fecha com a planilha (H2O igual, ADL − R$ 375,00 nomeados). Regra do
  `AGENTS.md` §9: conferente não pode acusar o padrão documentado.
- **Suíte e2e** e **invariantes do mês** não são pendência de sistema: a e2e espera o
  caixa fechar (decisão do dono) e os invariantes só precisam do
  `SUPABASE_ACCESS_TOKEN` no ambiente.

## Rodada anterior (17/11/2026) — dívida de fornecedor: causa encontrada

O dono relatou às 08:31 que ADL e H2O não batiam com a planilha. **Causa da ADL
confirmada e explicada ao centavo:** uma linha "PAGAMENTO DE MERCADORIA" de
R$ 4.031,40 (criada 12/11 18:26 sem vínculo de cadastro) foi **desfeita hoje às
11:17** — e "Desfazer pagamento" devolve a linha para pendente, ou seja, o app passa
a cobrar um dinheiro que já saiu. Isso explica os dois lados: pago −4.031,40 e
pendente +4.031,40 (o resto da diferença do pendente é R$ 375,00 que falta nomear).

**Defeito de desenho registrado:** `desfazerPagamento` é assimétrico — o "Pago" de
mercadoria encolhe a nota (`abaterNaDivida`), o "Desfazer" não devolve o valor para a
nota. Está na seção 9 do `AGENTS.md` e detalhado em
`docs/registros/2026-11/baixa-de-pagamento-em-nota.md` §13.

**Pendente de decisão do dono:** (1) voltar a linha da ADL para paga, apagá-la ou
abater na nota; (2) de onde vêm os R$ 375,00 da ADL; (3) quais das 4 notas da H2O a
planilha já considera pagas (#110 2.496,00 · #117 12.483,00 · #118 11.462,90 ·
ESPECIAIS 123,44) — é o que fecha os R$ 11.642,29 da H2O.

**Ferramentas novas (só leem, nada gravam):** `scripts/conferir-divida-fornecedor.mjs`,
`scripts/diagnostico-fornecedor.mjs`, `scripts/investigar-pendentes.mjs`,
`scripts/pix-x-divida-fornecedor.mjs`.

**Corrigido em 17/11 (autorizado pelo dono, com backup e DESFAZER em
`docs/registros-banco/2026-11/`):** a linha de R$ 4.031,40 da ADL voltou para paga (sem
encolher nota) e os dois pagamentos de 16/11 da H2O (R$ 4.445,19 + R$ 7.197,10) foram
abatidos nas notas. Resultado: **H2O R$ 14.885,23 = planilha** e **ADL R$ 23.003,68**
(faltam R$ 375,00 = R$ 280,00 de um PIX de 13/11 ao Mais Barato que a planilha não tem
+ R$ 95,00 que mudaram na planilha).

**Pendente de decisão do dono:** de onde vêm os **R$ 95,00** que saíram da planilha da
ADL entre 13/11 e hoje.

**Corrigido no código (autorizado com "pode" em 17/11):**
`criarLancamento` com "quitado" agora abate a nota do fornecedor (a causa raiz dos
R$ 11.642,29); `desfazerPagamento` devolve o valor para a nota — cada abatimento leva o
carimbo `lancamento_id` e a conta é a função pura `planejarEstornoNota`
(`lib/estorno-abatimento.ts`, 9 casos em `test/estorno.test.ts`), nota zerada volta para
'pendente'; o crédito do `abaterNaDivida` nasce com `pessoa_id`; e o histórico das notas
#114 (ADL 502,00), #118 (H2O 1.337,50) e #112 (ZL 100,00) foi completado sem mexer em
valor (`scripts/completar-historico-abatimentos.mjs`).

**Ferramenta corrigida:** `conferir-divida-fornecedor.mjs` engolia as linhas de crédito
(negativas) e inflava a dívida — INOVA 35.243,70 e ZL 2.786,50 são os números certos.

## Rodada anterior (17/11/2026) — tutorial da troca na tela

**O tutorial agora está na página.** Antes era só documento em `docs/receitas/`;
quem atende não abre documento. Agora a aba Estoque → Trocas tem um painel
fechado **"Como funciona a troca com fornecedor"** com: o caminho da peça nos 4
passos (com o nome exato de cada botão), o que cada situação quer dizer, o que
significa cada número do topo, as 5 regras do dinheiro e o **roteiro de
conferência** para análise futura (ordem de checar antes de acusar erro, tabela
"onde cada número nasce", a armadilha do `excluirTroca`).
(`app/painel/trocas/Tutorial.tsx`, renderizado em `page.tsx`)

É `<details>` de propósito: fechado por padrão (não empurra a lista de 200+
linhas) e funciona sem JavaScript. O valor da tolerância aparece no texto lendo
`configuracoes` — se o dono mudar em Configurações, o texto acompanha sozinho.
Teste: `e2e/trocas-tutorial.spec.ts` (abre e confere o conteúdo).

**Tolerância virou campo de tela:** Configurações → **Troca com fornecedor**
(CampoDinheiro, padrão R$ 200, teto R$ 1.000) grava em `configuracoes` chave
`trocas`. Era o "falta a tela" da rodada anterior.

Fonte única: o documento `docs/receitas/tutorial-trocas-fornecedor.md` foi
reduzido a **como conferir os números** — o texto para pessoas mora na tela.

## Rodada anterior (16/11/2026) — troca com fornecedor

**Regra corrigida:** o retorno da troca entra **sempre no PETRÓPOLIS ESTOQUE** (o
fundo), qualquer que seja a loja de onde a peça saiu; a loja recebe por
transferência quando precisar. Antes o sistema creditava no estoque da loja de
origem — foi o que mandou a peça do 15 Pro Max para Teresópolis estoque.
(`app/painel/trocas/actions.ts`)

**Retorno agora pergunta o que voltou.** O botão virou **"✓ Chegou do
fornecedor"** e oferece "voltou a mesma peça" ou "voltou outra peça" (com busca).
Antes ele lançava **sempre o mesmo produto**: quando o fornecedor mandava modelo
diferente, o crédito ia para o item errado e a perda nunca era calculada.
(`TrocasClient.tsx`, componente `RetornoDaTroca`)

**Tolerância de diferença: R$ 100** (confirmada pelo dono; faixa considerada era
R$ 100–200). Diferença até o limite **não vira perda** — fica registrada como
observação. Acima disso a perda é registrada com o valor exato. O número vive em
`configuracoes` → chave `trocas` → `tolerancia_diferenca` (padrão 100, teto 1000);
**falta a tela** para o dono editar.

**Painel "Onde está o dinheiro"** na aba Trocas: por fornecedor, peças, valor a
custo e dias da peça mais antiga (vermelho acima de 30). Mostra também peças sem
fornecedor definido. (`page.tsx` + `PainelFornecedores`)

**Script de conferência:** `node scripts/conferencia-trocas.mjs` (só lê) — peças
com o fornecedor por loja e por fornecedor, fila de cobrança, **troca que voltou
sem entrada de estoque** e **peça que entrou fora do fundo**.

**Tutorial para o balcão:** `docs/receitas/tutorial-trocas-fornecedor.md`.

**Bug relatado pelo dono e corrigido (16/11):** ele apertava em "Chegou do
fornecedor" e "nada acontecia". O botão funcionava — o painel abria **no fim da
página** (a lista tem 239 linhas e mais de 580 mil caracteres), fora da vista.
Reproduzido em produção com navegador (clique abre o painel, zero erro de JS).
Agora os painéis de retorno e de abatimento abrem como **modal na frente**
(`e0b9672`). Verificado em produção: painel no topo da tela, sem erro de console.

**Testes desta rodada:**

- `lib/trocas-regras.ts` (`decidirPerdaRetorno`) — a decisão "vira perda ou não"
  virou função pura, testável, e `test/trocas.test.ts` cobre **14 casos**
  (mesma peça, dentro da tolerância, exatamente no limite, um centavo acima, mais
  cara, quantidade > 1, tolerância zero/inválida, custo inválido, fração de
  centavo). Total do projeto: **220 testes de lógica**.
- **9 testes de erro de propósito na tela em produção** (`erros-propositais`):
  troca já fechada não mostra o botão de retorno; modal abre na frente; "voltou
  outra peça" sem escolher a peça recusa com mensagem; busca com 1 letra pede 2;
  busca sem resultado não quebra; cancelar fecha; modal de abatimento abre e
  mostra a dívida aberta; zero erro de JS. **9 de 9 OK.**

**Achados no dado (o que falta arrumar):**

- **O cadastro de fornecedor NÃO está duplicado** (conferido por id em 16/11):
  H2O, ADL, ZL e INOVA têm **um id cada**. O que está duplicado é o **texto
  gravado em `trocas.fornecedor_nome`**, congelado no dia da classificação, antes
  de o cadastro ser renomeado. Corrigido no código: dívida/abatimento filtram por
  `pessoa_id`, e o painel e o script agrupam por id (mostram aviso quando o nome
  gravado difere do cadastro) — commit `ab4da13`.
- **Cadastro "TROCAS ADL" juntado no ADL (16/11, autorizado pelo dono):** ele
  tinha 2 notas de entrada de verdade (#35 R$ 4.441,81 de 23/09 e #82
  R$ 2.050,32 de 21/10) e não era só cadastro de troca. As notas passaram para o
  ADL (`69d6bb51…`) e o cadastro foi desativado. Compras do ADL: R$ 95.945,81
  (15 notas) → **R$ 102.437,94 (17 notas)**. Backup e desfazer em
  `docs/registros-banco/junta-trocas-adl-no-adl-2026-11-16.json`.
- **28 peças (R$ 1.946,57) sem fornecedor definido** — não dá para cobrar.
- **0 de 225 trocas abatidas** na dívida: o recurso existe e ninguém usa.
- **2 peças para mover** — resolvido: FRONTAL IPHONE 15 PRO MAX voltou para o
  fundo (Teresópolis estoque 0 → Petrópolis estoque 1). FRONTAL SAMSUNG A36 e A16
  entraram em Teresópolis estoque, mas hoje estão **0 lá** (já saíram por venda ou
  transferência) — nada a mover.

**Última atualização anterior:** 15/11/2026 (dívida de fornecedor fechando o mês 11, rastro de PIX no fechamento e Reposição paginada).

## Nesta rodada (13–15/11/2026)

**Dívida de fornecedor fecha em 103.014,16** — exatamente a planilha do dono
(13/11 10h): ADL 23.283,68 · PLANETA 12.555,96 · H2O 29.144,32 · ZL 2.786,50 ·
INOVA 35.243,70. Três consertos no caminho: ADL conciliou 581,00 (pagamento que
estava no Financeiro sem abater nota — `1c7da99`); INOVA rateada por loja
conforme estoque de ACESSÓRIOS (`296f3b9`, depois de o dono mostrar que o
crédito de −251,60 é abatimento real de trocas antigas — `b81c421`); trava nova
em Trocas: não gera crédito acima da dívida aberta (`08f61da`). Registro em
`docs/registros/2026-11/baixa-de-pagamento-em-nota.md`.

**PIX do dia no fechamento agora deixa rastro** (`2bb6734`): ao fechar o caixa,
o app grava em `caixas.pix_resolucao` o que resolveu por fornecedor (valor,
comprovantes, janela) — "os PIX fecharam" virou prova, não reconstrução.
Coluna em `supabase/migrations/2026-11-13-caixa-pix-resolucao.sql` (**aplicada**;
ainda sem fechamento novo para gravar). Os 3 abatimentos de PIX de cliente feitos
**depois** do snapshot da planilha explicam a diferença ao centavo: H2O −1.202,00
(115,00 em 13/11 + 1.087,00 em 14/11) e ADL −280,00 (13/11) = −1.482,00. App hoje
em 101.532,16. **A planilha é a fonte de segurança e é conferida por humano — o
dono não quer edição pelo agente.**

**ADL 440,40 — encerrado de verdade.** O número do checkup da madrugada era
errado: o fechamento de 12/11 abateu 440,40 (435,20 + 5,20) e a noite abateu
3.599,00 = 4.039,40, igual ao que o app resolveu; os 53,60 de 18:33 foram para a
sessão seguinte. Prova: dívida ADL hoje 23.003,68 = planilha − 280,00 (único
abatimento pós-snapshot). Detalhe do bug de código (regra "já abatido" por dia
UTC → agora por sessão do caixa, `c2b3c20`) em `baixa-de-pagamento-em-nota.md`.

**Next 16.2.11** (`1974c13`): fecha as CVEs da faixa 16.2.6 (bypass de proxy,
DoS em Server Actions, e mais três) — sem mudança de comportamento.

**Reposição paginada** (`9c17b00`): lista padrão 1,24 MB → **0,33 MB**; "ver
todos" 2,87 MB → **0,33 MB**; páginas de 100 com o `Paginacao` do sistema;
warm ~1,9s. As "pesadas" do smoke (Contas 8,4s, Promoções 5,4s, Descontos 10s)
eram **cold start do Vercel** — warm: 0,8–1,3s.

**56 fiados sem `pessoa_id` — encerrado, nunca foi pendência.** A régua oficial
(`scripts/conferir-fiado-por-cliente.mjs`) mostra 56/56 ligados ao cliente
**pela venda** e **0 sem dono identificável**. O defeito de origem (fiado nascer
sem `pessoa_id`) foi corrigido em 27/10 (migration
`20261027200000_finalizar_venda_fiado_com_pessoa.sql` + `ebe9cc6`). Virou
armadilha nova no `AGENTS.md` §9: achado antigo não volta como pendência viva.

**Check-up 15/11** (`docs/registros/2026-11/checkup-15-11.md`): 85 telas sem
erro de console/500 (única bandeira: impressão sem `?id=`, falso positivo);
CRUD real (categorias e depósitos) criar → editar → excluir com **0 restos**;
invariantes do mês 11 = **46 OK / 0 falha**; `tsc` = 0; **206 testes**.

**Verificado nesta rodada:** `tsc` = 0 · 206 testes · smoke 85 telas · CRUD
real com limpeza · invariantes · deploy 28afbbf (app) e 32ab1ae (docs) no ar.

**Fechamento do dia (15/11, fim da rodada):**
- **`conta_id` nulo resolvido** (`705f538` + backfill): fiado recebido em PIX
  pelo botão "Pago" do Financeiro agora recebe a conta (PIX → banco da loja ·
  dinheiro → cofre); as 6 linhas antigas ganharam conta (PagBank +67,00 ·
  TON Teresópolis +260,49 = 327,49). As 335 notas "Venda #" sem conta são
  convenção (entrada conta em `pagamentos_venda`). Revisão do Claude Code:
  seguro — o recebimento da gaveta é separado e não duplica no saldo.
- **Revisão externa dupla:** Claude Code + Antigravity (Gemini) — ambos
  "seguro para financeiro". As falhas iniciais do Antigravity eram o **sandbox
  do shell cortando o TLS/streaming do `agy`** (não era rede).
- **Contas adicionais:** já existe (Contas → aba Contas → "+ Nova conta"), com
  tipo/origem, saldo inicial, chave Pix e dados bancários — testada ao vivo
  (criar, aparecer nos Saldos, excluir; 0 restos).
- **Sandbox do DSH:** patch de perfil gravado (`danger-full-access` + approval
  `never`) — vale para as próximas sessões a partir do próximo start do app.
  Nesta sessão continua workspace-write.
- Checklist de fechamento: `tsc` 0 · 206 testes · 85 telas OK (só o falso
  positivo da impressão) · invariantes do mês 11: 46 OK / 0 falha.

## Rodada de 17/11/2026

**Bug do desconto no fiado (achado pelo dono).** Ele perdoou R$ 55,00 do Luís
Paulo pelo app e a tarja continuava no nome — a tarja é do CADASTRO
(`nao_vender`), não some quando a dívida é perdoada. Investigando, apareceu bug
maior: a ação do desconto grava a despesa ("Desconto concedido"/"Perda com
fiado") com `lancamentos.criado_por` — coluna que existia só no código. O insert
falhava em silêncio: a dívida era perdoada e o valor **sumia do resultado do
mês**. Conferido: 8 descontos sem despesa entre 13 e 17/11 = **R$ 415,40**.
Conserto: migration `2026-11-17-lancamentos-criado-por.sql` (aplicada) +
backfill das 8 despesas. Backup:
`docs/registros-banco/2026-11/backup-desconto-sem-despesa-*.json`. Armadilha nova
no `AGENTS.md` §9.

**Cadastros gerais (etapa aberta pelo dono, um por vez).** DANIEL FERREIRA DA
SILVA e LUIS PAULO FERREIRA DOS SANTOS FILHO aplicados: nome limpo + não vender
+ motivo + A Receber real (o Luis Paulo depois foi perdoado pelo app e a tarja
limpa; a observação registra o perdão). Lista e regras no item 8 das pendências.

**PDV com letras garrafais:** "🚫 NÃO VENDER" e "⚠️ Já deve" maiores e em negrito
(`d89e594`) — o aviso não pode passar batido no balcão.

**Ferramenta:** dívida de anotação antiga nasce **sem loja** — sem loja o F9 não
lista (filtra pela loja do caixa) e a tela Fiados esconde para usuário restrito.
Linkar a loja resolve (Luís Paulo = Petrópolis, provado pelas vendas dele).

**Bateria autônoma do fim da rodada (17/11, sem o dono):**
- **Erros/robustez:** `test/robustez.test.ts` **81 casos** (entrada inválida,
  NaN/negativo, datas quebradas) + 14 casos de erro da Troca — **95 checks** ≥50.
- **Palavras erradas:** 10 telas reais × 7 padrões = **70 checagens, 0
  problema** (sem mojibake, sem `undefined`/`null`/`NaN` de texto, sem erro em
  inglês); varredura de fonte em **401 arquivos: 0 mojibake**.
- **Funcionalidade:** **220 testes** de lógica (6 arquivos) + smoke de **85
  telas** (só o falso positivo da impressão) + invariantes do mês 11 **46 OK /
  0 falha**.
- **Últimas 10 mudanças:** cada commit verificado (ver `checkup-15-11.md` e
  registros desta rodada) — nada destoando; o diff não commitado de
  `lib/pix-do-dia.ts` é **só comentário** de outra sessão (não é nosso, não mexi).

## Rodada de 12/11/2026 — RH, ponto e conferência de horas

**RH — desligamento virou um ato.** Preencher a data de demissão em Usuários e
salvar já desliga a pessoa de tudo: sai da folha, da escala, do espelho do RH, do
login; salário e vale-transporte zerados. O perfil **não** é apagado (vendas,
ponto e salários pagos apontam pra ele). Regra única em `lib/vinculo.ts`, usada
também por folha, escala, RH, lembrete de pagamento recorrente e Contabilidade.
Documento: `docs/mapa/funcionarios-desligamento.md`.

**RH — espelho de ponto por dia.** A tela só mostrava hoje; abrindo de madrugada
aparecia zerada ("ninguém bate ponto") com 207 batidas no mês. Agora tem seletor
de dia, e em dia passado quem não fechou o ponto aparece **⚠ Sem saída**.

**RH — ponto com um caminho só.** Painel e Meu Perfil passam pelo mesmo RPC
`bater_ponto` (4 tipos, sequência validada, trava de clique duplo) e a saída
fecha o banco do dia nos dois. Migration `2026-11-12-ponto-um-caminho-so.sql`
**aplicada** em produção em 12/11. Verificação:
`node scripts/teste-ponto-sequencia.mjs`.

**RH — Conferência de horas** (`/painel/rh/conferencia`): previsto (escala) ×
trabalhado (ponto) × diferença × saldo do banco, por pessoa e por mês.

**RH — correções de lógica.** Recálculo do banco não apaga mais lançamento manual
(`criado_por is null`); estagiário não acumula hora extra nem dobrada
(Lei 11.788); folha/Contabilidade/lembrete respeitam demissão; dois campos mortos
do MEI saíram da tela (`mei_valor_servico`, `mei_dia_pagamento` — nada lia).

**Decisão do dono sobre MEI (12/11/2026):** o MEI **continua** no banco de horas
(atraso, falta, hora extra) neste ano — o risco trabalhista disso está escrito no
`funcionarios-desligamento.md` e é decisão dele. Em 2027 entra a estrutura só de
MEI (item 9 das pendências, abaixo).

**Verificado nesta rodada:** `tsc` = 0 · 202 testes de lógica passando
(12 + 82 + 4 + 23 + 81) · `scripts/teste-ponto-sequencia.mjs` = 10/10 e limpeza
confirmada · migration aplicada e conferida no banco.

**Dívida de fornecedor x planilha do dono (12/11):** fecha em **111.442,26**
(ADL 27.463,68 · PLANETA 12.555,96 · H2O 32.489,12 · ZL 3.689,80 · INOVA 35.243,70).
Dois consertos no caminho: a categoria `fornecedor/mercadoria` (sem espaço) segurava
abatimento de 1.260,50, e as 12 notas pendentes que ainda baixavam por `valor_pago`
foram convertidas para a régua da nota encolhida. Registro completo em
`docs/registros/2026-11/baixa-de-pagamento-em-nota.md`.

**Auditoria do Saúde mais honesta (12/11):** a regra "lançamento com valor zero ou
negativo" acusava a convenção do próprio app (nota zerada e cancelada pelo abatimento,
e crédito de fornecedor em Mercadoria negativo). Passou a ignorar os dois casos e a
acusar só o que é anomalia: **53 recebíveis marcados como pagos com valor zero**
(51 de agosto–outubro, 2 de novembro — vendas #12266 e #12391, pagas cheias, com
"a receber" de 0,00 criado junto).

**Check-up da madrugada de 12/11 (autônomo):** relatório em
`docs/registros/2026-11/checkup-12-11.md`. 85 telas em produção, zero erro de
console/exception/HTTP 500; as três telas novas abrem. Um achado médio em aberto:
**ADL recebeu 5.462,10 de PIX de cliente hoje e só 3.599,00 abateu** (1.863,10 sem
baixa) — a baixa automática só enxerga a janela do caixa. Não corrigido: é caminho de
dinheiro. A tela de desconto na venda era a mais lenta do sistema (6,6s) e foi
otimizada para uma consulta. Script reutilizável: `node scripts/checkup-telas.cjs`.
**Foco combinado com o dono:** outubro está fora do processo ("já foi pago, valor
pequeno, irrelevante"); o alvo é **fechar novembro sem erro para o mês 12 não herdar**.

## Rodada de 07/11 — não commitada na época

Feita depois do deploy, **no disco e sem commit** (aguardando o dono):

1. **Apelidos de pessoas eliminados do projeto** (regra nova do `AGENTS.md` 1.3,
   que também ganhou porteiro no CI). 71 arquivos tocados, **só comentário e
   texto de tela**: apelido de ex-funcionária virou "equipe" (ou só a data), o
   apelido do coordenador virou o nome completo, e os três apelidos da equipe
   atual viraram os nomes completos. **O de/para está em
   `docs/mapa/glossario.md`, seção Pessoas** (este arquivo não repete apelido).
   `lib/chat-ia.ts` ficou como **exceção documentada** (é o dicionário que
   traduz apelido no chat).
2. **CI:** a checagem de apelidos (`type-check.yml`) passou a excluir
   `supabase/migrations/`, `docs/arquivo/`, `docs/registros/` e `chat-ia.ts` —
   histórico e dicionário, cada um com o motivo escrito no próprio workflow.
   Simulei a checagem aqui: **passa**.
3. **`AGENTS.md` seção 13 — Número de dinheiro:** as 4 regras de como falar de
   dinheiro e a fórmula oficial do dinheiro em espécie.
4. **`scripts/conferencia-caixa.mjs`** (novo, só leitura): confere o dinheiro em
   espécie por loja e período, caixa por caixa, com o "devia ter" x "contado".
   Rodado em Petrópolis 03–06/11: contado R$ 10.461,00 · devia ter R$ 10.464,70 ·
   −R$ 3,70 no caixa de 06/11 (o dono mandou ignorar). Nas duas lojas de
   01–07/11: +R$ 1,30 de sobra.

Verificado nesta rodada: `tsc` = 0 · **186 testes passando** · varredura UTF-8
(921 arquivos, zero quebrado) · telas Lembretes, Vendas, Relatórios, Contas e
Painel abrindo sem erro de console.

## Estado do Git

- Branch `main` publicada, tudo commitado. **Últimos (18/11):** `69ebd25` (funde o
  `frontal poco 81` no cadastro do POCO C81), `3952d64` (o "Chegou" da encomenda não
  cadastra nem dá entrada), `022e2cf` (PIX na chave da loja irmã é conta nossa),
  `dc793f6` (guia da retirada no fechamento do caixa).
- `3952d64` e `69ebd25` com CI verde no próprio commit (`tsc` + `review`).
- Últimos anteriores: `32ab1ae`
  (fiados encerrados + regra da pendência-fantasma), `28afbbf` (checkup 15/11),
  `9c17b00` (Reposição paginada), `2bb6734` (rastro do PIX no fechamento).
- **Produção com o código novo:** deploy do `main@28afbbf` confirmado (Reposição
  respondendo 0,33 MB com "Mostrando 1–100 de 529"); `32ab1ae` é só documentação.
- Histórico recente: `1974c13` (Next 16.2.11), `1c7da99` (ADL conciliação),
  `296f3b9` (INOVA rateio), `08f61da` (trava de troca), `c2b3c20` (fechamento
  "já abatido" por sessão do caixa).
- `docs/mapa/` versionado no Git (conferido em 12/11/2026: glossário e README
  são rastreados; a nota antiga dizendo que ficava fora estava errada).

## Pendências reais (por prioridade)

> **Abertas hoje (18/11):** a lista desta rodada está em "Pendências que esta rodada
> deixou", no topo do arquivo. Na lista numerada abaixo seguem abertos o item 8
> (cadastros gerais — pausado por decisão do dono) e o item 9 (estrutura MEI 2027).
> O resto está resolvido ou é nota de processo. Foco combinado: **fechar o mês 11
> limpo** para o mês 12 não herdar erro.

1. **✅ REVISÃO INDEPENDENTE CONCLUÍDA (15/11 — Claude Code + Antigravity).**
   Dois pareceres externos independentes, **ambos: seguro para financeiro** — só
   paralelização e a correção intencional de fuso do comprovante Pix; nenhum
   cálculo/soma/filtro mudou. Claude Code: achados baixos (a) `saldos-contas.ts`
   engole erro de lote (`data ?? []`) — silencioso pré-existente, o paralelismo
   só aumenta a chance; (b) `lojasPromise` sem catch em `fiados/page.tsx`;
   (c) `diaSP` devolve "Invalid Date" com entrada inválida (não ocorre na
   prática). Antigravity (plataforma da Google; agentes Gemini): parecer completo
   arquivo por arquivo, veredito literal "SEGURO PARA O FINANCEIRO". **Causa das
   falhas iniciais do Antigravity: o sandbox do shell cortava o TLS/streaming do
   `agy`** (via schannel até google.com resetava; com acesso pleno, 200/404
   normais). Rodar `agy` com acesso pleno resolve — receita em
   `docs/registros/2026-11/checkup-15-11.md`.
2. **✅ RESOLVIDO em 13/11 (`1974c13`)** — Next.js **16.2.11** no ar; as CVEs
   da faixa 16.2.6 (bypass de proxy, DoS em Server Actions e mais três) fechadas;
   build e telas conferidos.
3. **✅ RESOLVIDO em 15/11 (`9c17b00`)** — Reposição paginada em 100 por página:
   lista padrão 1,24 MB → **0,33 MB**, "ver todos" 2,87 MB → **0,33 MB**, warm
   ~1,9s. (Nota histórica: o diagnóstico anterior — `fetchAll` em série e
   builder reusado — continua valendo como referência; o corte foi a paginação.)
4. **✅ F9 HOMOLOGADO em 15/11 — produção, com reversão total.** Venda real com
   fiado (venda #13501, R$ 2,30, cliente `__QA__`) → quitação pelo F9 na tela →
   banco confere tudo (lançamento `pago`, `valor_pago` 2,30, forma "Dinheiro",
   histórico com 1 linha, movimento de caixa "Fiado recebido — __QA__CHECKUP_F9")
   → reversão: movimento e operação idempotente apagados, venda cancelada pela
   RPC `cancelar_venda`, estoque de volta a 57, **0 resíduos** (lançamentos 0,
   movimentos 0, cliente 0). Backup:
   `docs/registros-banco/2026-11/backup-f9-homologacao-*.json`.
5. **`conta_id` nulo nos lançamentos de venda — ✅ RESOLVIDO em 15/11.**
   Investigação: as 335 notas "Venda #" sem forma/sem conta são convenção (a
   entrada é contabilizada em `pagamentos_venda`; as migrations de reembolso
   dizem "só o reembolso recebe conta_id") — o saldo das Contas não lê nota de
   venda. As 118 vale e 8 dinheiro idem. **O furo real eram 6 linhas (R$ 327,49,
   04–11/11): fiados recebidos em PIX pela tela Financeiro** ("botão Pago"),
   onde `marcarPago` só resolvia conta para `tipo = pagar`. Consertos:
   (a) **código** `705f538` — `marcarPago` agora resolve conta também em
   `receber` (PIX → banco ativo da loja · dinheiro → cofre), com revisão
   independente do Claude Code (seguro para financeiro; o recebimento da gaveta
   é separado e não entra no saldo das Contas); (b) **dado** — as 6 linhas
   receberam conta (PagBank +67,00 · TON Teresópolis +260,49 = 327,49 exato),
   backup em `docs/registros-banco/2026-11/backup-conta-fiado-pix-*.json`.
   Restantes PIX sem conta: 0.
6. **Cron de salários — ✅ MANTIDO (decisão do dono em 15/11).** Job
   `pagar-salarios-sabado` (pg_cron, `0 22 * * 6` = sábado 19h de São Paulo)
   marca `pago`, com `data_pagamento` do dia, todo lançamento `pagar` pendente
   com descrição "semana de" e vencimento naquele dia. No sábado 14/11 pagou
   exatamente as 6 folhas que venciam (Erick Alves de Mattos, Isaac Bento
   Morelli, Maria Eduarda Kappler da Silva, Mariana Vila Real Castelli, Nikollas
   Bernardo Leocadio, Brunna Furtado Gonçalves — R$ 4.160,62). É registro
   contábil, não movimento de dinheiro. **Receita para funcionário novo
   semanal:** cadastrar em Usuários/RH e criar as linhas "Salário — Nome —
   semana de DD/MM" (A Pagar · Salários · vencimento sábado) no Financeiro →
   Novo lançamento; o cron dá baixa sozinho. O botão "Gerar folha" cria
   "Salário — Nome" sem "semana de" — esse o cron NÃO pega.
7. **Telas pesadas — medidas de novo em 15/11 (produção, warm):** Saúde 1,7s ·
   Fechamento do Mês 1,7s · Contas 1,3s · Promoções 0,8s · Descontos 0,95s ·
   Relatórios 1,0s. As leituras lentas do smoke (8–11s) eram **cold start do
   Vercel**, não tela lenta. Nada acima de 2s — **nada pendente aqui**.
8. **EM ANDAMENTO — Cadastros gerais: revisão de nomes (aberta pelo dono em
   17/11/2026, um por um).** Regras que saíram até aqui:
   - **Dívida mencionada no nome com dívida REAL no app** → nome limpo +
     `nao_vender` + motivo + observação + **registrar o valor no A Receber**
     (dado). **Primeiro caso: DANIEL FERREIRA DA SILVA** (era "DANIEL FERREIRA
     DA SILVA (DEVENDO R$ 199,00)") — aplicado: nome limpo, não vender + motivo
     "DEVE R$ 199,00 — cobrar antes de vender", observação histórica, A Receber
     R$ 199,00 pendente (venc. 01/08/2026). Backup em
     `docs/registros-banco/2026-11/backup-daniel-nao-vender-*.json`.
   - **Três camadas de aviso (desenho fechado em 17/11):**
     1. **Aviso interno de cuidado** — o campo antigo "Não vender" foi
        renomeado. Mesma coluna (`nao_vender`); no PDV vira tarja garrafal
        "⚠️ AVISO INTERNO · motivo"; na lista de Clientes, selo "⚠️ AVISO
        INTERNO"; **editável e apagável pelo balconista** (Clientes → editar),
        some só quando for apagado — **pagar/perdoar dívida não limpa** (de
        propósito). No balcão **avisa, não bloqueia**; no **App bloqueia** a
        compra (`a8699a6`).
     2. **Aviso na nota de venda** — campo novo `pessoas.aviso_nota`
        (migration aplicada, `70c772e`), editável no cadastro: **sai impresso
        no cupom** (automático e 2ª via) em caixa preta abaixo do nome do
        cliente, **sem mensagem interna**. Luís Paulo = "Só receber diante do
        pagamento" (testado com venda real #13933 → 2ª via conferida; cupom em
        `docs/registros/2026-11/preview-nao-vender/cupom-luis-paulo.html`).
     3. **Financeiro** — não lê nenhum dos dois campos; a matemática é
        independente (dívida se paga/perdoa pelo F9, não pelo aviso).
   - **Dívida mencionada no nome com dívida REAL no app** → nome limpo +
     `nao_vender` + motivo + observação + **registrar o valor no A Receber**
     (dado). **Primeiro caso: DANIEL FERREIRA DA SILVA** (era "DANIEL FERREIRA
     DA SILVA (DEVENDO R$ 199,00)") — aplicado: nome limpo, aviso interno +
     motivo "DEVE R$ 199,00 — cobrar antes de vender", observação histórica,
     A Receber R$ 199,00 pendente (venc. 01/08/2026). Backup em
     `docs/registros-banco/2026-11/backup-daniel-nao-vender-*.json`.
   - **Aviso no PDV em LETRAS GARRAFAIS** (pedido do dono): "⚠️ AVISO INTERNO"
     e "⚠️ Já deve R$ X em fiado" agora `font-extrabold` com borda 2 — o
     atendente não passa batido (`d89e594`). Prints em
     `docs/registros/2026-11/preview-nao-vender/`.
   - **Anotação de dívida sem dívida no app** → nome limpo; conferir caso a
     caso se a dívida é real (aí registra) ou é anotação velha (aí cai).
   - **Instrução operacional** → observação (e o PDV passa a mostrar a
     observação do cliente quando ele é selecionado).
   **Feito em 17/11 (lote 11–20 aprovado pelo dono):** nomes limpos — `J N
   MANUTENCAO CWB LTDA` (repetido), `MAURICIO FAGUNDES DA SILVA` (duplicado +
   número), `FERNANDA` (nfernanda781 repetido), `ANA CRISTINA DA SILVA STARCK`
   e `LUCIENE CRISTINA DOS REIS SALOTTI` (CPF saiu do nome), `DOUGLAS` (telefone
   saiu). Apagados (0 referência em todas as 14 tabelas que apontam para
   pessoas): CLIENTES INADIMPLENTES, "Mega Tech (NAO UTILIZAR…", 313, TROCAS
   313, HU100 ESPECIAIS. **H2 (fornecedor) foi fundido no H2O**: o pagamento de
   mercadoria pago (R$ 5.880,90) passou a apontar para o H2O e a ficha H2 saiu.
   Backup: `docs/registros-banco/2026-11/backup-cadastros-limpeza-*.json`.
   **Pendentes (o dono resolveu alguns em 17/11 e deixou estes para 18/11):**
   TRICELL 16 DE MARÇO (devendo 3.511,00) e TRICELL MR - MR CELL (devendo
   1.806,00) → só falta o **nome limpo** (o dono já pôs o aviso na nota:
   "ENTREGAR NA MR CELL" / "ENTREGAR NA TRICELL CURSO"); Luiz Gustavo (R$ 100),
   Marcio (R$ 924) e Matheus (R$ 654,50) → dívida real (registrar no A Receber)
   ou anotação velha? — o dono pôs o texto no motivo do aviso, falta o nome.
   **Feitos em 17/11:** Tatiana (aviso "Complicado — cuidado ao atender"),
   CSM CELL (instrução na nota E interna), RODRIGO PEREIRA (lembrete removido),
   BIO TECH (inativado + aviso), **ARTHUR** (nome limpo `ARTHUR RODRIGUES
   VAILLANT` + **Inativa**), Luís Paulo (perdoado, aviso na nota), Daniel.
   Backup: `docs/registros-banco/2026-11/backup-arthur-inativo-*.json`.

   Números levantados em 10/11/2026, para dimensionar quando a etapa abrir: de
   2.153 pessoas, **9 têm lembrete dentro do nome** e **18 passam de 45
   caracteres**. Nos três casos conferidos (CNN DA SEMANA QUE VEM, TATIANA DA
   SILVA COELHO (NÃO VENDER), MATHEUS MATTOS DE SOUZA DUARTE (DEVENDO
   R$654,50)), `observacoes` estava vazio, `nao_vender` falso e
   `nao_vender_motivo` vazio — o aviso existe **só** no nome, e o PDV não lê nome.

   A regra a aplicar: `nome` é só o nome; aviso, pendência, instrução e valor
   devendo vão para `observacoes` ou `nao_vender_motivo`. Com o **Não vender**
   marcado, o PDV mostra a tarja vermelha "🚫 NÃO VENDER" ao escolher o cliente
   (`app/painel/pdv/PDVClient.tsx`), que hoje nunca aparece por esse motivo.

   Candidatos já listados (o de/para é ponto de partida, **não** decisão tomada —
   cada linha com valor devido precisa saber antes se a dívida é real):

   | O que está gravado | Deveria ser | Observação |
   |---|---|---|
   | CNN DA SEMANA QUE VEM | CNN | o resto é lembrete de compra |
   | TATIANA DA SILVA COELHO (NÃO VENDER) | TATIANA DA SILVA COELHO | vira `nao_vender` + motivo |
   | LUIZ GUSTAVO DA SILVA ANDRADE (CLIENTE INADIMPLENTE - R$ 100,00) | LUIZ GUSTAVO DA SILVA ANDRADE | conferir se os 100,00 estão no A Receber |
   | MATHEUS MATTOS DE SOUZA DUARTE (DEVENDO R$654,50) | MATHEUS MATTOS DE SOUZA DUARTE | conferir se os 654,50 estão no A Receber |
   | CADASTRO INATIVADO / ARTHUR RODRIGUES VAILLANT | ARTHUR RODRIGUES VAILLANT | o "inativado" é o campo `ativo` |
   | J N MANUTENCAO CWB LTDA J N MANUTENCAO CWB LTDA | J N MANUTENCAO CWB LTDA | nome repetido duas vezes |
   | CSM CELL (SOMENTE RETIRADA E CONFERÊNCIA OBRIGATÓRIA) | CSM CELL | instrução → observações |
   | TRICELL MR - MR CELL (ENTREGAR NA TRICELL CURSO) | TRICELL MR - MR CELL | instrução → observações |

   Por que importa além da bagunça: o nome é o que casa o comprovante do PIX com o
   fornecedor no bloco "PIX do dia" e o que aparece na cobrança do cliente. Nome com
   lembrete colado atrapalha os dois. É **dado**, não código: corrigir pelo cadastro,
   com a lista na mão, um por um.

9. **MEI — estrutura própria (2027).** Decisão do dono em 12/11/2026: **neste ano
   fica como está** — o MEI continua no banco de horas (atraso, hora extra, falta)
   e ganha uma conferência de horas por pessoa (RH → Conferência de horas). Em
   **2027** montar estrutura só para MEI. O que ela precisa ter:

   - **Contrato de prestação de serviço** por pessoa: escopo (hoje só existe texto
     livre em `mei_funcoes`), valor mensal, vigência e reajuste.
   - **Fechamento mensal do MEI**: valor combinado, horas dedicadas no mês,
     diferença e o que foi combinado sobre ela. Sem vocabulário de CLT.
   - **Controle de nota fiscal** do prestador (hoje o app não tem nenhum): número,
     competência, valor e vínculo com o lançamento pago.
   - **Relatório para o contador** separando folha CLT (com encargos) de serviço
     MEI (sem encargos) — hoje a Contabilidade soma os dois no mesmo bloco.

   O risco que essa estrutura existe para reduzir está escrito em
   `docs/mapa/funcionarios-desligamento.md` (seção MEI). É decisão do dono, não do
   agente: o app só registra o que ele mandar registrar.

   Campos mortos removidos em 12/11/2026: `mei_valor_servico` e `mei_dia_pagamento`
   saíram do formulário (nada no app lia os dois). As colunas continuam no banco,
   sem uso.

10. **Nota sobre a planilha (não é pendência).** App 101.532,16 x planilha
    103.014,16 — a diferença de 1.482,00 é PIX de cliente abatido nos fechamentos
    de 13–14/11, depois do snapshot das 10h. A planilha é a fonte de segurança,
    conferida por humano; o dono decide quando/quem atualiza (decisão: o agente
    não edita). Mesma régua do capítulo "Nesta rodada".
11. **Perdas de troca sem vínculo do fornecedor — ✅ RESOLVIDO em 17/11.**
    Investigado a pedido do dono ("acho que já foi feito"): **não estava** — o
    que existia era outra coisa (abatimento por ID do cadastro, `ab4da13`, e a
    regra de perda como função pura com testes, `666d7dc`). O insert da perda
    gravava só o nome copiado na troca (que pode estar **velho** — fornecedor
    renomeado depois), sem `pessoa_id`; a conta por fornecedor não enxergava.
    Consertos: (a) **código** `ed09d1a` — os dois inserts de perda (retorno e
    abatimento) passam `pessoa_id` do cadastro e o nome ATUAL; (b) **dado** —
    15 linhas antigas linkadas (3 "H2O" + 12 "H2O FORNECEDOR" → H2O; ADL/ZL/
    INOVA idem pelo alias); 3 linhas sem fornecedor na troca ficam como estão.
    Backup: `docs/registros-banco/2026-11/backup-perda-troca-vinculo-*.json`.
    Invariante 19: **46 OK / 0 falha** no mês 11 (tsc 0, trocas 14/14).

## Nesta rodada (07/11/2026 — madrugada)

**Documentação (organização aprovada pelo dono)**

- `AGENTS.md` virou o **único** lugar das regras (inclui armadilhas, regras de
  negócio, permissões, autorização e o índice "onde mora cada informação").
- `CLAUDE.md` e `GEMINI.md` só apontam para o `AGENTS.md` (não têm mais regra).
- `README.md` reescrito curto (o antigo era o texto padrão do `create-next-app`).
- Criados: `docs/passagem-de-turno.md` (este arquivo), `docs/receitas/`
  (checkup, perf-audit, design-polish, debug, execute-plan, conselho),
  `docs/mapa/README.md` + `docs/mapa/glossario.md`,
  `docs/registros/2026-10/`, `docs/registros/2026-11/`,
  `docs/registros/analise-caixa-2026-11-03/`, `docs/registros-banco/`.
- `docs/arquivo/` recebeu 22 documentos encerrados + `docs/superpowers/` +
  os snapshots do SIGE (`docs/arquivo/dados-sige/`).
- As 6 receitas do projeto saíram dos `SKILL.md` (`.agents` e `.claude`) e agora
  moram só em `docs/receitas/` — os `SKILL.md` são ponteiros de 10 linhas.
- **Cofre Obsidian removido de todas as instruções** (`AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, `~/.dsh/AGENTS.md`) e os 2 documentos que o projetavam foram
  apagados. Ele não é mais fonte de verdade.
- `.claude/settings.local.json`: removida a linha que tinha **senha do SIGE em
  texto puro** e as entradas obsoletas do SIGE.
- Lixo apagado: `_an1-16.py`, `_crop*.py`, `_ocr*.ps1`, `_ocr/` (5 MB),
  `graphify-out/` (13 MB gerado), `dev-log.txt`, scripts soltos de `scripts/`.
  Conferido antes: nenhum arquivo do app citava esses arquivos.

**Código (verificado, sem mudar nenhum número)**

- `app/painel/contas/page.tsx` + `lib/saldos-contas.ts`: leituras que estavam em
  fila viraram paralelas e os lotes de 300 vendas deixaram de ser sequenciais.
  **Contas: 4,0 s → 2,1 s** (mediana de 3 rodadas no dev; mesma máquina) com os
  **mesmos 10 valores** na tela (conferido contra produção, valor por valor).
- `lib/saude-financeiro.ts`: as 10 leituras da auditoria agora vão numa rodada
  só (eram dois lotes em série), e os **produtos** deixaram de ser lidos inteiros
  (8,2 mil linhas, 1000 por vez) — agora só os que aparecem com estoque
  negativo, que é o único uso. Texto da tela idêntico (5.231 caracteres, mesmos
  4 erros e 8 atenções) e **4,4 s → 3,9 s** no dev.
- `app/not-found.tsx`, `app/painel/not-found.tsx`, `app/painel/error.tsx`,
  `app/error.tsx`: antes, um link velho ou um erro de servidor mostrava a tela
  padrão do Next **em inglês** ("This page could not be found." / "Application
  error"). Agora aparece mensagem em português, com "Voltar ao painel" e
  "Tentar de novo" (dentro do painel o menu lateral continua à vista). Conferido
  local: as duas telas aparecem, zero erro de console.
- `app/painel/fiados/page.tsx`: os lotes de 100 vendas deixaram de ser buscados
  em fila (agora em paralelo) e as lojas do usuário sobem junto, não depois.
  Texto da tela idêntico (8.165 caracteres). **Ganho medido ficou no ruído**
  (1,48 s → 1,4 s no dev) — mantido por ser mais direto, sem mudar número.
- `app/painel/fechamento-mes/page.tsx`: as duas leituras de aviso ("vendeu
  depois do mês", "caixa aberto") entraram no lote principal. Texto idêntico
  (2.395 caracteres); ganho no ruído.
- 21 arquivos atualizados para os caminhos novos dos documentos
  (`scripts/*.mjs` que gravam em `docs/fechamento/...`, `lib/mercado-livre.ts`,
  `bot-whatsapp/README.md`) — antes apontariam para pasta que não existe mais.
- `AGENTS.md` ganhou a armadilha nova: `fetchAll` é sequencial e `.range()` muta
  o builder (não reusar builder em chamada paralela).

**Bug corrigido (fuso horário do comprovante Pix) — muda comportamento de
propósito:** o bot do Telegram e o bot local liam o dia do comprovante com
`String(recebido_em).slice(0, 10)`, que é o dia em **UTC**. Comprovante que
chegava **depois das 21h** caía no dia seguinte. Agora usa `diaSP` (dia de São
Paulo) em `app/api/telegram/comprovante/route.ts`, `bot/lib/util.mjs` e
`bot/lib/fluxo.mjs` (o helper `diaSP` foi criado no util do bot). Só afeta o
comprovante **sem data legível** (o dia do próprio Pix, lido do ID ou do
comprovante, continua mandando). O teste do bot provou: 22h de São Paulo →
`2026-11-07` (antes vinha `2026-11-08`); dia já em AAAA-MM-DD não muda. Ganhou
7 testes de fuso em `test/logica.test.ts` para não voltar.

**Verificado nesta rodada:** `npx tsc --noEmit` = 0 · **186 testes de lógica
passando** (12 + 67 + 4 + 22 + 81) · varredura de UTF-8 em 917 arquivos: zero
arquivo quebrado e zero mojibake · smoke local em Contas, Saúde, PDV, Estoque e
Relatórios sem erro de console · **suíte e2e: 101 de 103 testes passando**
(os 2 restantes são de ambiente, ver abaixo). **Nenhuma venda/caixa/estoque de
produção foi alterado pelos testes** (conferido: zero venda, zero movimentação
e zero registro `__QA__` deixados por eles).

**Depois do deploy, conferido em produção:** `/painel/contas` abrindo em 1,1 s
(era 2,2–2,9 s), `/painel/saude` em 1,1 s (era 1,4–1,6 s) e a Saúde continua
marcando **4 erros, 8 atenções e 5 de 17 conferidos** — os mesmos de antes. O
saldo das contas subiu em relação à leitura da madrugada (R$ 85.388,15 →
R$ 88.032,65) **porque a loja vendeu durante a manhã** (vendas #12025 a #12034
nos caixas de Petrópolis e Teresópolis), não por causa do código.

**⚠️ Cuidado ao rodar `npx playwright test`:** a suíte roda contra o MESMO banco
de produção e o teste `pdv.spec.ts` **abre caixa** (`valor_abertura: 0`) quando
não encontra um aberto, e fecha no fim — mas se o teste falhar no meio, o caixa
fica para trás. Rodando de madrugada sobrou 1 caixa fantasma (abertura 0, sem
movimento, sem venda), já apagado. **Nunca rodar a suíte com a loja aberta.**
Além disso, 30 s de timeout padrão estoura no `npm run dev` (cada rota compila na
primeira visita): rodar com `--timeout=150000`.

**2 testes e2e que falharam por ambiente (não é bug do app):**
`estoque.spec.ts:24` procura `input[name="produto_id"]` na tela Movimentar, que
mudou depois do IMEI/OS serem desligados — teste velho, precisa ser atualizado.
`pdv.spec.ts:108` (fluxo completo) depende de finalizar venda e falhou porque a
loja estava com caixa real de terceiro aberto e vendendo.

## Ferramentas deste PC

- `npm run dev` na porta 3000 pode já estar rodando em outra sessão — conferir
  com `Get-NetTCPConnection -LocalPort 3000` antes de subir outro.
- Playwright 1.62.1 com Chromium instalado. Login de teste vem de
  `TESTE_USUARIO_EMAIL` / `TESTE_USUARIO_SENHA` no `.env.local`.
- A sandbox de agente bloqueia: iniciar navegador (`spawn EPERM`), escrever fora
  do workspace e `git push`. Pedir permissão elevada quando precisar.
- **Sandbox desligado a pedido do dono (15/11):** patch de perfil
  (`~/.dsh/profiles/web/cordis.patch.yml` → `sandbox-policy.mode:
  danger-full-access` + `approval.policy: never`) — vale para **toda sessão nova**
  a partir do próximo start do app. A sessão que já estava aberta continua em
  workspace-write até reiniciar/reabrir o app. Consequência: o agente escreve em
  qualquer lugar do PC e não há prompt de aprovação.
- **Antigravity (`agy`):** o sandbox workspace-write **corta o TLS/streaming** do
  binário (o agente conecta, trabalha e a conexão "reset" na hora de devolver a
  resposta; schannel no shell dá `SEC_E_NO_CREDENTIALS` até em `google.com`).
  Rodar o `agy` direto, **com acesso pleno** (`danger-full-access`), resolve:
  `C:\Users\usuario\AppData\Local\agy\bin\agy.EXE --print "<prompt>" --add-dir
  "<projeto>" --dangerously-skip-permissions --output-format text`.

## Pendente (24/11/2026) — monitoramento de erro em uso

Código pronto, **não commitado**. Falta, na ordem:

1. **Aplicar a migration** `supabase/migrations/2026-11-24-erros-app.sql` no SQL
   Editor do Supabase. Sem ela o sistema funciona igual (tudo é silencioso), mas
   nada é gravado em `erros_app`.
2. **Criar o grupo privado do Telegram** "TecnoCell — Erros" (só o dono), pôr o
   bot como administrador e cadastrar `TELEGRAM_GRUPO_ERROS` nas variáveis da
   Vercel (opcional: `TELEGRAM_TOKEN_ERROS`; sem ela usa o token de Petrópolis).
   Sem essa variável, a tela Saúde avisa em vermelho que o alerta está desligado.
3. Só então autorização de commit/deploy (trava do dono).

Como funciona: `docs/mapa/monitoramento-erros.md`. Verificação rodável:
`node --import ./test/alias.mjs test/erros.test.ts` e
`node --import ./test/alias.mjs test/vigia-erros.test.ts` (11 testes).

Revisão independente já aplicada (2 críticos + 8 médios corrigidos): `avisado_em`
só é marcado quando o Telegram aceita; `insert` com erro agora avisa no console
(`[erros] não gravou: ...` — é o sinal de monitoramento cego); CPF/CNPJ/telefone
formatados são mascarados; a URL enviada é só o caminho, nunca a query; consulta
do vigia e da tela paginada (`fetchAll`) com `.order('id')`; grupo silenciado não
renova o próprio silêncio; cron do vigia é `*/10 * * * *` (24h).

Ajuste de ruído (pedido do dono, mesmo dia): **não existe resumo diário** —
mensagem só quando há problema. A prova de vida virou a hora da última passada,
gravada em `configuracoes` → `erros_vigia` e mostrada na tela Saúde ("último check:
há X min"; acima de 20 min ela acusa o vigia parado). Além do Telegram existe
**alerta na tela**: `components/AlertaErros.tsx`, montado no layout do painel só
para o master, consulta `GET /api/erros/novos` de minuto em minuto e mostra um
aviso no canto com link para a Saúde; a dispensa é por ocorrência
(`localStorage`), então o mesmo problema não reaparece.
