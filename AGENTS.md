<!--
  ESTE É O ÚNICO LUGAR DAS REGRAS DO TECNOCELL.
  CLAUDE.md e GEMINI.md só apontam para cá. Se precisar mudar uma regra, mude AQUI.
  Conhecimento de "como o sistema funciona" mora em docs/mapa/ — não aqui.
-->

# TecnoCell Cloud — regras do projeto

ERP online para comércio, varejo, prestação de serviços e indústria.
Next.js + TypeScript + Supabase + Vercel. Uso real em duas lojas de celulares:
**Petrópolis** (`e41aa9ea-820d-44d2-a04a-2e4efc8b0946`) e **Teresópolis**
(`81791d01-dc4a-485c-bbb8-f2b4cda6731c`).

- No ar: `tecnocell-cloud.vercel.app` · GitHub: `indriquegomes/tecnocell-cloud` (branch `main`)
- Módulos: Financeiro · Vendas/PDV · Estoque e compras · CRM · Ordens de serviço ·
  Relatórios · Integrações · Extras (tarefas, RH, WhatsApp, Telegram, IA)

<!-- BEGIN:nextjs-agent-rules -->
## Antes de escrever código Next.js

Esta versão do Next **não é a que você conhece** — APIs, convenções e estrutura
de arquivos podem diferir. Leia o guia da versão instalada em
`node_modules/next/dist/docs/` antes de escrever código. Respeite os avisos de
descontinuação.
<!-- END:nextjs-agent-rules -->

---

## 1. O dono manda: simples e com impacto mostrado antes

1. **UI simples e intuitiva (vale para TUDO).** Toda tela, menu, botão, coluna,
   relatório e mensagem precisa ser compreensível por QUALQUER pessoa — o dono
   não é técnico. Nome claro, linguagem do dia a dia, sem jargão, sem sigla
   interna, sem termo de contador. Antes de nomear, pergunte: "o dono entende
   isso de primeira?" Não? Simplifica ou renomeia.
2. **Análise de impacto ANTES de qualquer mudança.** A mudança interfere em
   menu, tela, relatório, fluxo ou RPC que já existe? Pode quebrar, conflitar,
   mudar número/cálculo que o dono já usa, ou confundir? Se interferir (ou
   houver dúvida): mostrar ao dono o que muda, onde aparece e qual o risco —
   ele autoriza ANTES. Nunca renomear, remover ou mudar cálculo sem autorização.
   Mudança isolada e segura: pode tocar, avisando no fim o que mudou e onde.
3. **Pessoas sempre pelo NOME COMPLETO.** Proibido apelido ou abreviação de
   nome de pessoa em qualquer lugar: respostas, documentos, comentários de
   código, textos de tela. Só isso — outras abreviações e nomes internos do
   código/banco NÃO entram nessa regra. A lista de apelidos e os nomes
   completos fica em `docs/mapa/glossario.md`, seção "Pessoas".

## 2. Dado é real: autorização e trava de deploy

- **Produção é dado real** (uso desde 05/09/2026; migração SIGE→TecnoCell
  concluída em Petrópolis). Toda mudança em **banco, caixa, estoque ou
  financeiro** exige autorização do dono + ser reversível e auditada. Nada de
  chutar em dado real.
- **Trava de deploy — palavra-chave do dono.** Nada de commit/push/deploy de
  mudança financeira/banco nem das correções da auditoria SIGE×TecnoCell
  (desconto de vendas, canceladas, fiado, vale) sem a palavra-chave. A
  palavra-chave fica só com o dono; **nunca** gravar em repositório, nota ou
  documento.
- **Não commitar sem pedir.** Antes de qualquer commit, confirmar que o
  type-check passou (`npx tsc --noEmit` = saída 0).
- **Nunca** alterar produção, dados reais, Git remoto ou deploy sem autorização
  explícita. Nenhum subagente faz isso sem ordem do dono.
- **Nunca gravar senha, token, chave, cookie ou dado pessoal** em arquivo do
  repositório, documento ou nota.

## 3. Preservar UTF-8 sempre

Os arquivos têm acentos e emojis no código e nos comentários; corromper isso já
causou dois commits de conserto.

- **NUNCA** usar `Set-Content -Encoding utf8` no `PDVClient.tsx` (nem
  `Out-File`/`>` do PowerShell).
- Editar com as ferramentas de edição. Se precisar de script, usar Python com
  `io.open(..., encoding='utf-8', newline='')` preservando CRLF.
- Conferir depois com `file <arquivo>` — tem que dizer "UTF-8 text".

## 4. Código: ponytail (dev sênior preguiçoso)

Preguiçoso quer dizer eficiente, não relaxado. O melhor código é o que não
precisou ser escrito.

Antes de escrever código novo, parar no primeiro degrau que resolver:

1. **Precisa existir?** (YAGNI)
2. **Já existe neste repositório?** Reusar o helper/padrão que já está lá.
3. **A biblioteca padrão resolve?** Usar.
4. **Um recurso nativo da plataforma resolve?** Usar.
5. **Uma dependência já instalada resolve?** Usar — `lib/xlsx.ts` para `.xlsx`,
   **nunca** `exceljs` (trava nas exportações do SIGE).
6. **Cabe em uma linha?** Uma linha.
7. Só então: escrever o mínimo que funciona.

A escada roda **depois** de entender o problema: ler a tarefa, ler o código que
ela toca, seguir o fluxo real de ponta a ponta, e só aí subir.

- **Bug é causa raiz, não sintoma.** Procurar todos os chamadores da função e
  corrigir a função compartilhada UMA vez — remendar só o caminho do chamado
  deixa o irmão quebrado.
- Nenhuma abstração não pedida. Nenhuma dependência nova evitável. Nenhum
  boilerplate. Deleção acima de adição. Chato acima de esperto. Menos arquivos.
- O menor diff que funciona vence — mas só depois de entender. Mudança pequena
  no lugar errado não é preguiça, é um segundo bug.
- Questione pedido complexo: "precisa mesmo de X, ou Y já cobre?"
- Entre duas opções do mesmo tamanho, escolha a que trata o caso de borda.
- Simplificação deliberada com teto conhecido leva comentário `ponytail:`
  nomeando o teto e o caminho de upgrade.
- **NÃO** seja preguiçoso em: entender o problema; validação na fronteira de
  confiança (toda server action de escrita começa com `requireAuth` ou
  `requirePermissao`); tratamento de erro que evita perda de dado; segurança; e
  qualquer coisa pedida explicitamente.

## 5. Verificação (o que rodar antes de dizer "pronto")

```
npx tsc --noEmit                                   # type-check; exit 0 antes de commitar
npm run dev                                        # servidor local (porta 3000)
node --import ./test/alias.mjs test/logica.test.ts  # testes de lógica (um por vez)
npx playwright test                                # e2e (UI e banco)
```

- **Testes de lógica:** `test/*.test.ts` cobrem lógica pura (escala/ponto,
  Pix, robustez, avisos de caixa, fuso horário). Hoje são **186 testes** em 5
  arquivos. O `test/alias.mjs` resolve o alias `@/` do tsconfig — sem ele não
  rodam (`ERR_MODULE_NOT_FOUND`); não há `tsx` instalado.
- **E2E:** 31 arquivos em `e2e/` (`.spec.ts` = Playwright; `.cjs` = scripts de
  banco/PGlite). Dados de teste usam prefixo `__QA__` e o próprio teste apaga.
- **`tsc` não pega erro de lógica.** Em caminho de dinheiro (PDV, caixa,
  devolução, vale-crédito), descrever o teste manual passo a passo que o dono
  roda antes de usar no balcão.
- Lógica não-trivial deixa **UMA** verificação rodável. Uma linha trivial não
  precisa de teste.

## 6. Ambientes

- **Casa:** sem `.env.local` — não dá para rodar o app localmente contra o
  banco; o teste é feito no site online.
- **Loja:** tem `.env.local`, roda local.
- **Migrations do Supabase NÃO são aplicadas automaticamente.** O arquivo entra
  em `supabase/migrations/` (nome `AAAA-MM-DD-nome.sql`) e o SQL é colado no SQL
  Editor. Sempre avisar quando uma mudança depende de migration não aplicada.
  Hoje são 230 migrations — as antigas do SIGE ficam como registro histórico de
  como o banco chegou aqui: **não apagar**.
- **Git neste PC:** o backend TLS padrão (`schannel`) falha em qualquer acesso
  ao GitHub com `schannel: AcquireCredentialsHandle failed:
  SEC_E_NO_CREDENTIALS (0x8009030e)`. Já corrigido com
  `git config --global http.sslBackend openssl` — **não desfazer**. Mesmo assim,
  o `push` usa o gerenciador de credenciais do Windows, que a sandbox de uma
  sessão de agente bloqueia: empurrar commit de dentro do agente exige permissão
  elevada.
- **CI:** `.github/workflows/type-check.yml` roda `tsc` a cada push;
  `claude-code-review.yml` revisa PR e só abre PR de correção — nunca commita na
  `main`.

## 7. Estrutura

```
app/painel/<modulo>/     page.tsx (busca no servidor) + actions.ts ('use server') + *Client.tsx (interativo)
app/api/                 rotas HTTP (login, telegram, pdv/catalogo…)
components/              compartilhados; components/ui/ = primitivos
lib/                     regra de negócio pura + acesso a dados
supabase/migrations/     SQL versionado por data
proxy.ts                 middleware (Next 16 renomeou "middleware" → "proxy")
bot/  bot-whatsapp/      bots avulsos (Node, .mjs)
e2e/  test/              testes
docs/                    ver seção 12
```

### Helpers que já existem (usar, não reescrever)

- `lib/supabase/server.ts` — `createClient()` (sessão do usuário),
  `createServiceClient()` (service role, ignora RLS), `requireAuth()`,
  `requirePermissao(key)`, `permissoesEfetivas()`, `fetchAll`/`fetchAllIn`
  (o Supabase/PostgREST corta em 1000 linhas — sem isso os totais mentem).
- `lib/utils.ts` — `formatBRL`, `formatDate`, `hojeSP`, `diaSP`, `cn`,
  `normalizarUsuario`.
- `lib/permissoes.ts` — catálogo de permissões e mapa rota → permissão.
- `components/CampoDinheiro.tsx` (máscara por centavos), `components/BuscaLista.tsx`,
  `components/Paginacao.tsx`, `components/SubmitButton.tsx`, `components/Dica.tsx`,
  `components/icons.tsx` (ícones inline — **não** instalar `lucide-react`).
- `lib/caixa.ts`, `lib/xlsx.ts`, `lib/fechamento.ts`, `lib/escala.ts`.

## 8. RPCs do banco (a regra de negócio crítica mora no Postgres)

`finalizar_venda`, `cancelar_venda`, `registrar_devolucao`, `movimentar_estoque`,
`transferir_estoque`, `receber_nota_entrada`, `estornar_nota_entrada`,
`finalizar_pedido_app_pdv`, `dashboard_resumo`, `dashboard_faturamento_metas`,
`marcar_lembrete_feito`.

São `security definer` e atômicos. Estoque, IMEI, crédito do cliente e
lançamentos mudam **dentro** deles, com `for update` onde há corrida. Ao mexer
num RPC: copiar o corpo da **última** migration que o define, alterar só o
necessário, e conferir com `diff` que o resto ficou idêntico.

`finalizar_venda` tem uma trava: `soma(p_pagamentos) + p_credito_valor` precisa
bater com o total, senão a venda inteira é recusada.

## 9. Armadilhas conhecidas (todas já causaram bug em produção)

- **Fuso horário:** nunca `toISOString()` para data — o servidor roda em UTC e
  depois das 21h vira o dia seguinte. Usar `hojeSP()` e
  `timeZone: 'America/Sao_Paulo'`. Para data-only, `new Date(d + 'T12:00:00')`.
- **`Intl.format` LANÇA com data inválida** (`RangeError: Invalid time value`)
  — não devolve "Invalid Date". Guarda com `Number.isNaN(new Date(x).getTime())`.
- **`proxy.ts` não pode usar supabase-js.** Ele valida o token com `fetch`
  direto no `/auth/v1/user`; o supabase-js apaga o cookie ao ver
  `AuthSessionMissing` e derruba o login no meio da venda. Ele também **apaga
  qualquer header `x-user-*` vindo do cliente** antes de setar o da sessão —
  sem isso, um atacante se passaria por outro usuário.
- **Dinheiro de verdade:** a verdade dos pagamentos é `pagamentos_venda` (venda
  mista = várias linhas), não `vendas.forma_pagamento_id`. Quem soma dinheiro
  real filtra `status = 'pago'`. Fiado é dívida e vale-crédito é abatimento de
  saldo — nenhum dos dois entra na gaveta nem no cash-in das metas.
- **Gaveta do caixa:** só dinheiro físico (`tipo = 'dinheiro'`). PIX está no
  banco, cartão na maquininha.
- **Paginação:** consulta sem `fetchAll` para em 1000 linhas e o relatório
  mente. Filtro por coluna de JOIN (`.eq('vendas.created_at', …)`) dá 400 —
  evitar.
- **`fetchAll` busca página por página (sequencial)** e **`.range()` MUTA o
  builder** (`return this`, não devolve cópia). Por isso: nunca guardar um
  builder fora do callback e chamá-lo duas vezes, e nunca reaproveitar o mesmo
  builder em chamadas paralelas — os dois `range` caem no mesmo objeto e volta
  dado errado. Construir a query DENTRO do callback.
- **PK TEXT sem default** (`depositos`, `formas_pagamento`, `pix_periodos`,
  `catalogo_app`): todo `insert` de criação precisa de `id: crypto.randomUUID()`,
  senão `null value in column "id"`.
- **IDs do SIGE são TEXT, não UUID:** nunca caste para `::uuid` em SQL/RPC.
- **Logout / ação destrutiva nunca atrás de `<Link>`/GET** — o Next prefetcha e
  dispara sozinho. Usar `<form method="POST">` ou botão com confirmação.
- **`next dev` com `.next` corrompido** = login preso / POST 404 em `/api/*`:
  apagar `.next` e subir de novo.
- **Arquivo novo não commitado** quebra o deploy na Vercel (build local passa):
  `git add` do arquivo novo antes de subir.
- **Coluna integer recebe `Math.round`/`parseInt`**, não `parseFloat` cru.
- **Módulo novo precisa de permissão configurável** no sistema de cargos
  (`lib/permissoes.ts`) — senão ninguém além do master entra.
- **Hidratação:** não aninhar `<button>` dentro de `<button>` (usar
  `<div role="button">`).

## 10. Regras de negócio que o código sozinho não conta

- **Permissão:** o master vê tudo; cada usuário vê o que o cargo libera. RH,
  Escala, Freelancers, Relatórios, Painel Vendedor, Saúde e Contabilidade são
  master-only.
- **PIN do ponto:** 4 dígitos, padrão `1234`, trocado em Meu Perfil. É separado
  da senha de login.
- **`login_bloqueado`:** a conta compartilhada (usuário `visitante`) é bloqueada
  ao deslogar; o master libera na tela Usuários.
- **Devolução de dinheiro:** dinheiro→dinheiro só no MESMO dia da venda; outro
  dia → PIX. Venda no cartão → devolver em PIX só com liberação do master na
  hora (senha de liberação).
- **Fiado (A Receber):** nasce na `finalizar_venda` como lançamento `receber`
  preso ao cliente. Quitação é o "F9" do PDV.
- **Vale-crédito:** é uma linha de pagamento normal no PDV; a separação acontece
  no `handleFinalizar` (tira as linhas de vale de `p_pagamentos` e manda a soma
  como crédito). Mandar nos dois lugares conta em dobro; mandar só como
  pagamento não debita o saldo.
- **Metas e comissão:** regra oficial em `docs/registros/2026-10/`; a comissão
  do mês sai na tela Financeiro → Comissão.
- **Fechamento do mês:** fecha o mês da loja ativa e congela estoque/caixa.
  Fechar o mês errado congela número errado — conferir antes.

## 11. Agentes (DeepSeek coordena)

- **DeepSeek** (esta sessão): coordena, evita trabalho duplicado, consolida.
- **Codex**: lógica, backend, TypeScript, Supabase, SQL, segurança, correções.
- **Claude Code**: ideias, arquitetura, regras de negócio, revisão crítica.
- **Antigravity**: frontend, usabilidade, testes visuais, Playwright.
- Mudança em **financeiro, estoque, caixa, autenticação ou banco** exige
  revisão independente por outro agente.
- Receitas prontas (o que rodar e como) ficam em **`docs/receitas/`** — os
  `SKILL.md` de `.agents/skills` e `.claude/skills` só apontam para lá.

### /conselho

- Ativar só com `/conselho` ou risco crítico.
- Primeira rodada: Codex, Claude e Antigravity em paralelo, máximo 300 palavras
  cada, só o contexto relevante. Se um falhar, seguir com no mínimo dois e
  avisar.
- Dois concordando e risco baixo → sintetizar e encerrar. Divergência ou risco
  alto → segunda rodada só com os discordantes. `/conselho completo` = revisão
  cruzada completa.
- Resposta: recomendação · consenso · divergências · riscos · próximo passo.

## 12. Onde mora cada informação

| Preciso de… | Onde está |
|---|---|
| Regras, armadilhas, permissões, autorização | **este arquivo** |
| Como o sistema funciona (telas, fluxos, banco) | `docs/mapa/` |
| Um nome oficial por processo | `docs/mapa/glossario.md` |
| O que fazer agora / o que ficou pendente | `docs/passagem-de-turno.md` |
| Receita de tarefa (checkup, perf, design, debug…) | `docs/receitas/` |
| Número de um mês fechado (financeiro, auditoria) | `docs/registros/<ano-mês>/` |
| Backup de dado antes de mexer (`backup-*.json`) | `docs/registros-banco/` |
| PDF, planilha, documento do dono | `docs/registros/<ano-mês>/entrada/` |
| Assunto encerrado / texto antigo | `docs/arquivo/` |
| Marca (cores, logo, CNPJ, tipografia) | `docs/design/brand.md` |
| Referências de UI | `docs/design/referencias-ui.md` |

**Regra de ouro da documentação:** cada tipo de informação mora em **um** lugar.
Se você precisar repetir algo, coloque um link — não copie o texto.

## 13. Número de dinheiro — como falar de dinheiro sem erro

Nasceu de um erro real (07/11/2026): o dinheiro físico de Petrópolis foi
informado como R$ 8.307,10 quando o certo era R$ 8.861,00. O dinheiro estava
certo; **a comunicação estava errada** — o número era só uma parte da conta.

**A causa:** o dinheiro que entra na gaveta é gravado em **três lugares**:

| Entra | Onde fica |
|---|---|
| Venda paga em dinheiro | `pagamentos_venda` (forma `tipo = 'dinheiro'`) — **não** vira movimento de gaveta |
| Fiado recebido, sinal de encomenda | `movimentos_caixa` (`tipo = 'recebimento'`) |
| Reforço e retirada | `movimentos_caixa` (`reforco` / `retirada`) |
| Troco inicial | `caixas.valor_abertura` |

Quem soma **um** desses lugares informa um número menor e inventa um "dinheiro
que sumiu" que não existe.

### As 4 regras

1. **Um número de dinheiro só existe se vier do Fechamento de Caixa** (ou do RPC
   `calcular_valor_esperado`, que é a mesma conta). Nunca somar "extrato do
   caixa", nunca somar "recebimentos", nunca somar só pagamentos de venda.
2. **Todo número de dinheiro sai com quatro informações:** loja · período · **o
   que está dentro** (inclui troco? inclui venda em dinheiro? inclui fiado
   recebido?) · e, quando for fechamento, **quanto foi contado**. Faltou uma? O
   número não vale.
3. **Se dois números não batem, a diferença é explicada ao centavo antes de
   seguir.** Enquanto a diferença não tiver nome (venda em dinheiro, troco,
   retirada, contagem errada), a conversa não terminou.
4. **Ninguém cita apelido nem nome curto de pessoa.** Para nomear quem pediu ou
   decidiu, use o **nome completo** (tabela "Pessoas" em
   `docs/mapa/glossario.md`). Quando o que importa é a função, descreva a função:
   "a atendente", "quem fecha o caixa". **"O dono" = Indrique Gomes França
   (master)** — em documento e comentário, "o dono" sempre significa ele.

### Fórmula oficial do dinheiro em espécie no período

```
troco inicial (soma de valor_abertura dos caixas do período)
+ vendas pagas em dinheiro (pagamentos_venda, status 'pago', forma tipo 'dinheiro', pela venda)
+ fiado recebido e sinal (movimentos_caixa tipo 'recebimento', forma dinheiro)
+ reforços (movimentos_caixa tipo 'reforco', forma dinheiro)
- retiradas (movimentos_caixa tipo 'retirada', forma dinheiro)
- devoluções em dinheiro (movimentos_caixa tipo 'devolucao', forma dinheiro)
= deveria ter (esperado)   →   compare com a soma de valor_fechamento
```

Script pronto para rodar isso: `scripts/conferencia-caixa.mjs`
(`node scripts/conferencia-caixa.mjs 2026-11-03 2026-11-06`). Só lê.

## 14. Antes de qualquer mudança: é DADO, REGRA ou HISTÓRIA?

> Regra confirmada pelo dono (07/11/2026). Vale para todo pedido, de qualquer
> pessoa e de qualquer agente. Classificar ANTES de mexer.

Classifique o pedido:

- **DADO** (nomes, valores, casos específicos): vai para o **banco**, lançado
  pela tela do app. **Não muda código.**
- **REGRA** (como o app funciona): vai para o **código**, sempre **GERAL** — sem
  nome de pessoa, sem valor fixo, sem caso específico.
- **HISTÓRIA** (por que, quem pediu, contexto): vai para **`docs/`**. **NUNCA**
  em comentário de código.

Se o pedido for um **caso específico**, primeiro verifique se o app já tem uma
função geral que resolve (ex.: conta parcelada no Financeiro). Se tiver, **não
mexa no código**: indique como lançar pela tela.

Se não souber classificar, **pergunte ao dono** antes de fazer.

Consequência prática para comentário de código: comentário explica **o que o
código faz e por que aquele jeito é o certo** (armadilha, invariante, cálculo) —
nunca "quem pediu", "quem reclamou" ou a data do pedido. Isso tudo é HISTÓRIA e
mora em `docs/`.
