# Passagem de turno — TecnoCell

> **Este é o único arquivo de passagem de turno.** Quem começa uma sessão lê este
> arquivo primeiro; quem termina reescreve a seção "Nesta rodada" e mantém o
> histórico (não apague linha: o que fechou vira histórico).
>
> Regras do projeto: `AGENTS.md`. Como o sistema funciona: `docs/mapa/`.

**Última atualização:** 12/11/2026 (RH: desligamento, ponto e conferência de horas).

## Nesta rodada (12/11/2026)

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

- Branch `main` **publicada**. Commits da rodada anterior: `ffb2f84` (docs/organização),
  `d07b549` (perf + correções), `7e7df07` (para de versionar log de dev),
  `345b3e0` (passagem de turno).
- **Produção está com o código novo** (deploy da Vercel confirmado: o 404 em
  português responde em `/endereco-que-nao-existe` com status 404).
- **A rodada atual está no disco, sem commit** (ver acima).
- `docs/mapa/` **está versionado** no Git (conferido em 12/11/2026: glossário e README
  são rastreados; a nota antiga dizendo que ficava fora estava errada).

## Pendências reais (por prioridade)

1. **Revisão independente da rodada `d07b549`** (regra do projeto para
   financeiro). O que mudou nesses arquivos foi só *como* as consultas são
   feitas — nenhum cálculo —, e os números foram conferidos tela contra tela
   antes do deploy:
   `lib/saldos-contas.ts` e `app/painel/contas/page.tsx` (Contas 4,0 s → 2,1 s
   no dev; em produção 2,9 s → 1,1 s), `lib/saude-financeiro.ts` (4,4 s → 3,9 s
   no dev; 1,6 s → 1,1 s em produção), `app/painel/fiados/page.tsx`,
   `app/painel/fechamento-mes/page.tsx`.
2. **Next.js 16.2.6 em faixa com falha crítica** (bypass de proxy/middleware em
   App Router com Turbopack e um único locale; faixa afetada
   `>=16.0.0 <16.2.11`). Subir para `16.2.11+`, refazer build e conferir as
   telas. Mitigação que já existe: `layout.tsx` também barra por permissão.
3. **Performance — tela Reposição** (`/painel/estoque/reposicao`): 4,1 s e
   **1,2 MB** de HTML (512 linhas). Diagnóstico feito: `fetchAll` busca página
   de 1000 **em série**, e a tela puxa 8,2 mil produtos + 19,6 mil linhas de
   estoque só para somar por produto (≈30 idas ao banco em fila). **Receita**:
   (a) construir a query DENTRO do callback do `fetchAll` (hoje o builder `vq`
   é criado fora — `.range()` MUTA o builder, então reuso paralelo dá dado
   errado); (b) opção de páginas em paralelo no `fetchAll` (ex.: 5 por vez);
   (c) buscar só os produtos que venderam (`fetchAllIn`). Mexe em estoque →
   autorização + revisão. **Não fazer sem o dono.**
4. **F9 (quitação de fiado) com venda real nunca foi homologado** — só em teste
   local (PGlite).
5. **Conferir `conta_id` nulo** nos lançamentos de venda (o commit `3d33514`
   mexeu na baixa de conta; conferir se o nulo ainda acontece).
6. **Cron de salários** (`pagar-salarios-sabado`, `pg_cron` no Supabase): a
   regra marca como **pago** tudo que tem "semana de" na descrição e vence no
   sábado. Vale o dono conferir se é isso mesmo que ele quer — é dinheiro saindo
   sem ninguém olhar.
7. **Telas ainda pesadas** (medido em 07/11, produção): Saúde 1,4–3,6 s (faz 10
   leituras grandes), Fechamento do Mês 1,5 s. Relatórios e Vendas já foram
   paginados (`5d14a6d`) e estão em 0,8 s.
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
