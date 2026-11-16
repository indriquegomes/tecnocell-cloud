# Passagem de turno — TecnoCell

> **Este é o único arquivo de passagem de turno.** Quem começa uma sessão lê este
> arquivo primeiro; quem termina reescreve a seção "Nesta rodada" e mantém o
> histórico (não apague linha: o que fechou vira histórico).
>
> Regras do projeto: `AGENTS.md`. Como o sistema funciona: `docs/mapa/`.

**Última atualização:** 15/11/2026 (dívida de fornecedor fechando o mês 11, rastro de PIX no fechamento e Reposição paginada).

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

- Branch `main` publicada, tudo commitado (working tree limpo). Últimos: `32ab1ae`
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

1. **Revisão independente da rodada `d07b549` — EM ABERTO (15/11).** O agente
   externo não respondeu nesta sessão: Antigravity (Gemini) caiu 3× com a mesma
   queda de rede no endpoint do Google, e o registro de subagentes internos ficou
   corrompido (4 tentativas). Fiz revisão PRÓPRIA do diff completo, arquivo por
   arquivo — só paralelização de consultas e a correção de fuso intencional do
   comprovante Pix; **nenhum cálculo, filtro de status ou soma mudou** (tabela em
   `docs/registros/2026-11/checkup-15-11.md`). Falta o parecer de agente externo:
   repetir quando o Antigravity voltar.
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
5. **Conferir `conta_id` nulo** nos lançamentos de venda — **conferido em 15/11:
   AINDA ACONTECE.** Novembro: 467 linhas `pago` com conta nula — 335 sem forma
   no lançamento (R$ 28.000,65, provável venda mista/importada), 118 vale-crédito
   e 8 dinheiro (ok por natureza, não vão a conta) e **6 PIX (R$ 327,49) que
   deveriam ter conta**. Falta decidir: a régua que ancora conta precisa cobrir
   venda mista e o PIX avulso — investigar antes de corrigir (dado financeiro).
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
8. **PRÓXIMA ETAPA — Cadastros gerais: revisão de nomes.** Não começar sem o
   dono abrir a etapa: ele parou o assunto em 10/11/2026 ("ta grande demais")
   porque a revisão esbarra em **dívidas de pessoas que não pagaram** e em
   **fornecedores com bilhete** — não é só tirar sufixo do nome, é decidir caso a
   caso o que é dívida real, o que é anotação velha e o que vira observação.

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
