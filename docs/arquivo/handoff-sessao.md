# Handoff — TecnoCell Cloud (sessão DeepSeek)

> Leia este arquivo no INÍCIO de uma sessão nova pra recuperar o contexto.
> Atualize depois de cada sessão. Não apague histórico.

## Estado do git
- Commit `f556164` já pushado: `efd0604..f556164 main -> main`.
- Contém 6 arquivos: perf (`lib/supabase/server.ts`, `app/painel/relatorios/page.tsx`, `app/painel/vendas/page.tsx`) + ponto (`app/painel/meu-perfil/actions.ts`, `meu-perfil/MeuPerfilClient.tsx`, `ponto/actions.ts`).
- Commit `555cbae` (este handoff) também já pushado — `main` = `origin/main`.
- **NÃO commitado de propósito** (WIP de outro agente): `app/painel/devolucoes/actions.ts`, `lib/senha-liberacao.ts`, `scripts/definir-senha-liberacao.mjs`, `docs/backup-*.json`.

## Feito nesta sessão

### Performance (8 cortes, tsc exit 0)
- `fetchAllIn` chunkSize 100→200 (metade dos requests em qualquer tela).
- Relatórios: abas Lucro, Vendas, DRE, Estoque → fetches em paralelo (eram em fila).
- Tela Vendas (lista): clientes + pagamentos em paralelo.
- Relatórios Precificação e Inventário: buscar 200 + contagem em vez da lista inteira.
- Referência: Relatórios media ~6,3s antes. "Depois" ainda NÃO medido (precisa deploy + login).

### Ponto (PIN + logout)
- PIN de 4 dígitos (default 1234) no Meu Perfil + logout automático na saída.
- Dashboard (PontoWidget) já tinha PIN; agora o Meu Perfil também tem.

### Medição depois (23/10, produção, Playwright com TESTE_USUARIO)
Mediana de 4 rodadas por tela, sessão logada, `https://tecnocell-cloud.vercel.app`:

| tela | HTML (KB) | DCL (ms) | conteúdo (ms) |
|---|---|---|---|
| Relatórios · Financeiro | 434 | 1089 | 1370 |
| Relatórios · Lucro | 3732 | 5429 | 6109 |
| Relatórios · DRE | 128 | 1736 | 1784 |
| Relatórios · Vendas | 6026 | 2746 | 3837 |
| /painel/vendas | 116 | 532 | 617 |

Média das abas de Relatórios ≈ 2,7s (referência "antes" ≈ 6,3s, −57%). Financeiro/DRE caíram;
**Lucro e Vendas continuam pesadas** e não foram cortadas ainda.

Diagnóstico do peso (o HTML que chega ≠ problema de rede — TTFB 16ms, gzip 187–355KB):
- `aba=lucro`: 3,7 MB de HTML, **1.015 linhas** de tabela renderizadas, 2,4 MB de payload RSC.
- `aba=vendas`: 6,0 MB de HTML, **2.373 linhas** renderizadas, 4,2 MB de payload RSC.
- `aba=dre` (comparativo): 128 KB, 21 linhas — prova que o formato da tela não é o culpado.
- Causa: essas duas abas buscam o período inteiro (`fetchAll`) e mandam **todas** as linhas
  para o cliente (tabela + `ExportCsv` recebendo a lista completa). `AMOSTRA = 200` já existe
  e é usada nas outras abas, mas não nessas duas.


## Pendências (próximo a fazer)
1. ~~Migration PIN~~ **RESOLVIDA (23/10)**: a coluna `perfis.pin_ponto` JÁ EXISTE em produção
   (conferido via PostgREST: `GET /rest/v1/perfis?select=pin_ponto` → 200, valor `1234`).
   Nada a colar no SQL Editor. O arquivo `supabase/migrations/2026-10-22_pin-ponto.sql` segue
   versionado como registro.
2. ~~Medir antes→depois~~ **MEDIDA (23/10)** — números na seção acima. Falta só decidir o corte seguinte.
3. **Fase 2 de perf — abas Lucro e Vendas do Relatórios** (o que sobrou de pesado):
   - Corte barato (sem migration, sem mexer em número): limitar a TELA a `AMOSTRA` (200 linhas,
     padrão que as outras abas já usam) e mandar o CSV completo pelo `ExportCsvLazy`, que
     re-busca sob demanda. Derrete ~3,7 MB e ~6,0 MB de HTML.
   - Corte caro (Fase 2 do handoff anterior): somar no banco via RPC. Corta também o tempo de
     servidor (2,5–5,5s de `fetchAll` + agregação em JS), mas é migration + número → exige
     autorização do dono + revisão independente.
   - Nenhum dos dois foi feito ainda: aguardando o dono escolher.
4. **WIP alheio** (devoluções / senha-liberacao / backups) — não tocar, não commitar.
   Continua igual: `app/painel/devolucoes/actions.ts` modificado + `lib/senha-liberacao.ts`,
   `scripts/definir-senha-liberacao.mjs` e 5 `docs/backup-*.json` não versionados.

## Regras/contexto que não podem se perder
- **Permissão**: só o master vê tudo; cada usuário só o próprio. RH, Escala, Freelancers, Relatórios e Painel Vendedor são master-only.
- **PIN**: 4 dígitos, default 1234, troca no Meu Perfil. É SEPARADO da senha de login.
- **login_bloqueado**: conta compartilhada (username `visitante`) é bloqueada ao deslogar; o master libera na tela Usuários.
- **Devolução**: dinheiro→dinheiro só no MESMO dia da venda; outro dia → PIX. Venda no cartão → devolver em PIX só com autorização do master no momento.
- **Fuso horário**: nunca `toISOString()`; usar `hojeSP()` / `timeZone: 'America/Sao_Paulo'`.
- **PostgREST**: corta em 1000 linhas (usar `fetchAll`/`fetchAllIn`); filtro por coluna de JOIN (`.eq('vendas.created_at', ...)`) dá 400 → evitar.
- **Lojas**: Petrópolis `e41aa9ea-820d-44d2-a04a-2e4efc8b0946`, Teresópolis `81791d01-dc4a-485c-bbb8-f2b4cda6731c`.

## Ambiente DSH
- Sandbox agora está `workspace-write` (escreve arquivo SEM pedir aprovação).
- A trava "no meio do processo" era **sessão inchada** (~60 MB de histórico). Sessão nova resolve.
- `git push` de dentro do agente precisa `danger-full-access` (senão, o usuário faz manual).
