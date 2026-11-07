# TecnoCell Cloud

Sistema de gestão (ERP) das lojas TecnoCell — Petrópolis e Teresópolis.
Vendas no balcão (PDV), estoque com IMEI, financeiro, fiado, vale-crédito,
ordens de serviço, compras, integrações e relatórios.

- **No ar:** https://tecnocell-cloud.vercel.app
- **Código:** Next.js + TypeScript + Supabase (banco e login) + Vercel
- **Repositório:** https://github.com/indriquegomes/tecnocell-cloud (branch `main`)

## Rodar na sua máquina

```bash
npm install
npm run dev          # abre em http://localhost:3000
```

Precisa do arquivo `.env.local` (só existe no PC da loja). Sem ele o app sobe,
mas não conversa com o banco.

## Antes de mexer

Leia **`AGENTS.md`** — é o único lugar das regras (autorização, dado real,
trava de deploy, padrão de código, armadilhas conhecidas).

## Onde fica cada assunto

| Assunto | Arquivo/pasta |
|---|---|
| Regras do projeto | `AGENTS.md` |
| Como o sistema funciona | `docs/mapa/` |
| Nomes oficiais dos processos | `docs/mapa/glossario.md` |
| O que está pendente agora | `docs/passagem-de-turno.md` |
| Receitas (checkup, performance, design, debug) | `docs/receitas/` |
| Fechamentos e auditorias por mês | `docs/registros/` |
| Backups de dados antes de mexer | `docs/registros-banco/` |
| Assunto encerrado | `docs/arquivo/` |

## Verificação

```bash
npx tsc --noEmit                                  # tipos
node --import ./test/alias.mjs test/logica.test.ts # testes de lógica
npx playwright test                               # testes de tela
```
