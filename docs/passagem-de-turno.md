# Passagem de turno — TecnoCell

> **Este é o único arquivo de passagem de turno.** Quem começa uma sessão lê este
> arquivo primeiro; quem termina reescreve a seção "Nesta rodada" e mantém o
> histórico (não apague linha: o que fechou vira histórico).
>
> Regras do projeto: `AGENTS.md`. Como o sistema funciona: `docs/mapa/`.

**Última atualização:** 07/11/2026, ~10:20 (manhã, depois do deploy).

## Estado do Git

- Branch `main` **publicada**. Commits desta rodada: `ffb2f84` (docs/organização),
  `d07b549` (perf + correções), `7e7df07` (para de versionar log de dev).
- **Produção está com o código novo** (deploy da Vercel confirmado: o 404 em
  português responde em `/endereco-que-nao-existe` com status 404).
- Árvore limpa. Só ficou de fora um arquivo de outra sessão:
  `e2e/contas-saldos.spec.ts` (não versionado, não é importado pelo app).
- `docs/mapa/` continua no disco e **fora do Git** por decisão do dono
  (`.git/info/exclude`).

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
