# Handoff — TecnoCell Cloud (sessão DeepSeek)

> Leia este arquivo no INÍCIO de uma sessão nova pra recuperar o contexto.
> Atualize depois de cada sessão. Não apague histórico.

## Estado do git
- Commit `f556164` já pushado: `efd0604..f556164 main -> main`.
- Contém 6 arquivos: perf (`lib/supabase/server.ts`, `app/painel/relatorios/page.tsx`, `app/painel/vendas/page.tsx`) + ponto (`app/painel/meu-perfil/actions.ts`, `meu-perfil/MeuPerfilClient.tsx`, `ponto/actions.ts`).
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

## Pendências (próximo a fazer)
1. **Migration PIN** (ainda não aplicada) — colar no Supabase SQL Editor:
   `ALTER TABLE perfis ADD COLUMN IF NOT EXISTS pin_ponto text NOT NULL DEFAULT '1234';`
   Sem ela o PIN funciona só com 1234; não dá pra cada pessoa trocar o próprio PIN.
2. **Medir antes→depois** (Relatórios/Vendas) — precisa do login do usuário (Playwright).
3. **Fase 2 de perf** (o corte grande): somar os totais no banco via RPC pras abas Financeiro/Estoque/Lucro (ainda buscam tudo pra somar em JS). É mudança em número + migration → só com autorização do dono + revisão.
4. **WIP alheio** (devoluções / senha-liberacao / backups) — não tocar, não commitar.

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
