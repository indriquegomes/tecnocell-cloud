# Passagem de turno — TecnoCell

> **Este é o único arquivo de passagem de turno.** Quem começa uma sessão lê este
> arquivo primeiro; quem termina reescreve a seção "Nesta rodada" e mantém o
> histórico (não apague linha: o que fechou vira histórico).
>
> Regras do projeto: `AGENTS.md`. Como o sistema funciona: `docs/mapa/`.

**Última atualização:** 07/11/2026, ~07:30 (madrugada).

## Estado do Git

- Branch `main`, HEAD = `f366a47 fix(salarios): muda horário do pagamento automático de sábado pra 19h`.
- **Produção roda `f366a47`.** Desde `c724bc7` entraram, entre outros:
  relatórios paginados em 200 linhas (`5d14a6d`), IMEI desligado (`fbb13c3`),
  OS/Serviços fora do menu (`6984802`), Halloween removido (`703adda`),
  `calcular_valor_esperado` (`06411fe`), trava de retirada sem destino
  (`6267e2b`), baixa de conta resolvendo a conta pela forma (`3d33514`),
  salários semanais automáticos no sábado via `pg_cron` (`56e35a0`).
- **Working tree desta rodada** (não commitado): reorganização da documentação,
  `lib/saldos-contas.ts`, `lib/saude-financeiro.ts`, `app/painel/contas/page.tsx`,
  `app/not-found.tsx`, `app/painel/not-found.tsx`, `app/painel/error.tsx`.
- Nada foi commitado nem publicado nesta rodada (sem a palavra-chave do dono).

## Pendências reais (por prioridade)

1. **Revisar e commitar a rodada de 07/11** (esta). Ver "Nesta rodada" abaixo.
   O único arquivo de lógica tocado é `lib/saldos-contas.ts` (tela Contas) —
   entra na regra de revisão independente porque é financeiro, apesar de os
   números terem sido conferidos (ver prova).
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
(os 2 restantes são de ambiente, ver abaixo). **Nada foi commitado, nada foi
publicado, nenhuma venda/caixa/estoque de produção foi alterado** (conferido:
zero venda, zero movimentação e zero registro `__QA__` deixados pelos testes).

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
