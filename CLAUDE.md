@AGENTS.md

# TecnoCell Cloud

ERP online para comércio, varejo, prestação de serviços e indústria.
Next.js + TypeScript + Supabase + Vercel.
Uso próprio hoje: loja de celulares (Petrópolis e Teresópolis).

- No ar: tecnocell-cloud.vercel.app
- GitHub: indriquegomes/tecnocell-cloud (branch `main`)

Módulos:

- **Financeiro** — contas a pagar/receber, custos, fluxo de caixa
- **Vendas e PDV** — online e offline, cupom fiscal, app de vendas
- **Estoque e compras** — controle avançado, compras, produção
- **CRM** — clientes e força de vendas
- **Ordens de serviço** — assistência técnica
- **Relatórios** — 100+
- **Integrações** — e-commerce, marketplaces, pagamento, logística, loja
  virtual, banco digital
- **Extras** — tarefas/projetos, RH, documentos na nuvem, WhatsApp, Telegram, IA

## Regras de trabalho

- **Respostas diretas.** Sem explicação técnica desnecessária, sem elogio, sem
  concordar por concordar. Se a ideia tem problema, diga qual. Sério e objetivo.
- **O usuário é iniciante em programação. Uma coisa por vez.** Não despejar
  várias mudanças ou vários conceitos na mesma resposta.
- **Fase de teste — nada aqui é dado real.** O banco tem só cadastro (pessoas,
  produtos, preços, configuração); todo o movimento foi zerado em 13/08/2026.
- **Não commitar sem pedir.** Confirmar que o type-check passou antes de
  qualquer commit.
- **Preservar UTF-8 sempre.** Os arquivos têm acentos e emojis no código e nos
  comentários. Corromper isso já causou dois commits de conserto.
  **NUNCA usar `Set-Content -Encoding utf8` no `PDVClient.tsx`** (nem
  `Out-File`/`>` do PowerShell). Editar com as ferramentas de edição; se
  precisar de script, usar Python com `io.open(..., encoding='utf-8',
  newline='')` preservando CRLF. Conferir depois com `file <arquivo>` —
  tem que dizer "UTF-8 text".

## Verificação

```
npx tsc --noEmit     # type-check; exit 0 antes de commitar
npm run dev          # servidor local
npx playwright test  # e2e (e2e/pdv.spec.ts, e2e/f1.spec.ts)
```

Não há suíte de testes unitários. `tsc` não pega erro de lógica — em caminho de
dinheiro (PDV, caixa, devolução), descrever o teste manual que o usuário deve
fazer antes de usar no balcão.

## Ambientes

- **Casa:** sem `.env.local`. Não dá pra rodar o app localmente contra o banco;
  o teste é feito no site online depois do deploy.
- **Loja:** tem `.env.local`, roda local.
- Migrations do Supabase **não são aplicadas automaticamente**. O arquivo entra
  em `supabase/migrations/` e o usuário cola o SQL no SQL Editor do Supabase.
  Sempre avisar quando uma mudança depende de migration ainda não aplicada.

## Estrutura

```
app/painel/<modulo>/     página (server component) + actions.ts + *Client.tsx
app/api/                 rotas HTTP (login, telegram, pdv/catalogo…)
components/              compartilhados; components/ui/ = primitivos
lib/                     regra de negócio pura + acesso a dados
supabase/migrations/     SQL versionado por data (AAAA-MM-DD-nome.sql)
proxy.ts                 middleware (Next 16 renomeou "middleware" → "proxy")
bot/                     bot de comprovantes do Telegram (Node avulso, .mjs)
```

Convenção por módulo: `page.tsx` busca dados no servidor, `actions.ts` tem as
server actions (`'use server'`), `XClient.tsx` é a parte interativa.

## Helpers que já existem (usar, não reescrever)

- `lib/supabase/server.ts` — `createClient()` (sessão do usuário),
  `createServiceClient()` (service role, ignora RLS), `requireAuth()`,
  `requirePermissao(key)`, `permissoesEfetivas()`, e `fetchAll`/`fetchAllIn`
  para paginar (o Supabase corta em 1000 linhas — sem isso os totais saem errados).
- `lib/utils.ts` — `formatBRL`, `formatDate`, `hojeSP`, `cn`.
- `lib/permissoes.ts` — catálogo de permissões e mapa rota → permissão.
- `components/CampoDinheiro.tsx` — campo de dinheiro com máscara (entra por
  centavos). Em modo controlado não guarda estado próprio: ressincroniza pelo
  prop `value`, então dá pra limitar o valor no componente pai.
- `components/BuscaLista.tsx`, `Paginacao`, `SubmitButton`, `Dica`, `icons.tsx`
  (ícones Lucide inline — **não** instalar `lucide-react`).

## RPCs do banco (regra de negócio crítica mora no Postgres)

`finalizar_venda`, `cancelar_venda`, `registrar_devolucao`, `movimentar_estoque`,
`transferir_estoque`, `receber_nota_entrada`, `estornar_nota_entrada`,
`dashboard_resumo`, `dashboard_faturamento_metas`, `marcar_lembrete_feito`.

São `security definer` e atômicos. Estoque, IMEI, crédito do cliente e
lançamentos são alterados **dentro** deles, com `for update` onde há corrida.
Ao mexer num RPC: copiar o corpo da última migration que o define, alterar só o
necessário, e conferir com `diff` que o resto ficou idêntico.

`finalizar_venda` tem uma trava: `soma(p_pagamentos) + p_credito_valor` precisa
bater com o total, senão a venda inteira é recusada.

## Armadilhas conhecidas (todas já causaram bug em produção)

- **Fuso horário:** nunca `toISOString()` para data — o servidor roda em UTC e
  depois das 21h vira o dia seguinte. Usar `hojeSP()` e
  `timeZone: 'America/Sao_Paulo'`.
- **`proxy.ts` não pode usar supabase-js.** Ele valida o token com `fetch`
  direto no `/auth/v1/user`. O supabase-js apaga o cookie ao ver
  `AuthSessionMissing` e derruba o login no meio da venda.
- **Dinheiro de verdade vs. não:** a verdade dos pagamentos é a tabela
  `pagamentos_venda` (venda mista = várias linhas), não `vendas.forma_pagamento_id`.
  Quem soma dinheiro real filtra `status = 'pago'`. Fiado é dívida e vale-crédito
  é abatimento de saldo — nenhum dos dois entra na gaveta nem no cash-in das metas.
- **Gaveta do caixa:** só dinheiro físico (`tipo = 'dinheiro'`). PIX está no
  banco, cartão na maquininha.
- **Paginação:** consulta sem `fetchAll` para em 1000 linhas e o relatório mente.

## Feito recentemente

- **Vale-crédito como forma de pagamento completa.** Forma `FP_VALE`, tipo
  `vale_credito`. Aparece no grid e no dropdown do PDV (só com saldo > 0), valor
  editável com teto no saldo do cliente, funciona em pagamento misto, e sai
  discriminado no detalhe da venda, no fechamento de caixa e no relatório de
  formas. A constraint `pagamentos_venda_status_check` aceita `'vale'`.
  No PDV o vale é uma **linha de pagamento normal**; a separação acontece só no
  `handleFinalizar`, que tira as linhas de vale de `p_pagamentos` e manda a soma
  como crédito — mandar nos dois lugares conta em dobro, mandar só como pagamento
  não debita o saldo do cliente.
  Migration `2026-08-25` já aplicada no Supabase.
  Cliente de teste com saldo de vale: **SMART INK**.
- **Conferência de estoque em massa por planilha** (`app/painel/estoque/conferencia`).
- **Limpeza de código morto** (ponytail): removidos `lib/types.ts`,
  `lib/auditoria.ts`, componentes sem uso, assets órfãos e as dependências
  `lucide-react` e `class-variance-authority`.
- **Plugins no Claude Code:** superpowers, ponytail, claude-mem.

- **Supabase conectado via MCP** (`.mcp.json`, token em `SUPABASE_ACCESS_TOKEN`
  no ambiente do usuário). O Claude aplica migration direto — não precisa mais
  colar no SQL Editor.
- **Banco limpo e SIGE removido** (13/08/2026). Saíram as pastas `sige-deep/`,
  `scripts-sige/`, `extensao-sige/`, as telas `/painel/espelho`, e as tabelas
  `eventos_sige` e `sige_conferencia`. Todo o movimento foi truncado; sobrou só
  cadastro. As migrations antigas do SIGE continuam em `supabase/migrations/`
  porque são o registro de como o banco chegou aqui — não apagar.
  ⚠️ Cuidado: "espelho" também aparece no RH (espelho de ponto) e no bot do
  Telegram (planilha espelho) — nada a ver com SIGE.
- **Importador de itens do SIGE** (`app/painel/produtos/importar`). Sobe `.xlsx`,
  mostra prévia do que muda, grava só depois de confirmar. Casa por
  `Identificador` = `produtos.id` + sufixo `idproduto`. Atualiza e insere,
  **nunca apaga**. Detalhes em [docs/2026-08-13-sessao.md](docs/2026-08-13-sessao.md).
- **`lib/xlsx.ts`** — leitor de planilha próprio. O `exceljs` **trava** nas
  exportações do SIGE (levou +2 min e não voltou); este faz o mesmo arquivo em
  0,7s. Usar ele, não o exceljs, pra qualquer `.xlsx` novo.

## Próximos passos

1. **Testar com poucos itens:** entrar estoque em alguns produtos e rodar
   venda / devolução / fechamento de caixa do zero.
2. **Trazer pagamentos e fiados atualizados** dos clientes (usuário vai passar).
3. **Histórico de compras do cliente** — só pra medir relevância do cliente pelo
   poder de compra. Entra depois da migração completa.

## Cérebro Obsidian — obrigatório

Vault: `C:\Users\usuario\Documents\celebro tecnocell cloud`.

- Antes de trabalhar, ler `00-Início/Cérebro TecnoCell.md` e buscar notas relacionadas.
- Depois de concluir, atualizar histórico, decisão, teste ou pendência afetada.
- Nunca apagar histórico nem gravar senha, token, chave, cookie ou dado pessoal.
- Código e banco atuais vencem em conflito; corrigir a nota desatualizada.
- Não alterar produção, dados reais, Git remoto ou deploy sem autorização explícita.
