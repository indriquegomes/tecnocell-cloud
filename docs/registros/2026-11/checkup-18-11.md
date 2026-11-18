# Check-up TecnoCell — 18/11/2026

**Alvo:** produção (`https://tecnocell-cloud.vercel.app`), somente leitura.
**Escopo:** checklist de fechamento depois das mudanças do dia (encomenda parou de
mexer no estoque · caixa de Teresópolis fechado · PIX do dia · limpeza de cadastros).
**Decisão do dono:** suíte e2e **não rodada** nesta rodada (motivo na seção do fim).

## Resultado

| Item | Resultado |
|---|---|
| `npx tsc --noEmit` | **0** |
| Testes de lógica | **229 pass / 0 fail** em 7 arquivos |
| UTF-8 dos arquivos tocados | 9 de 9 sem BOM e sem `U+FFFD` |
| Smoke de telas em produção | **85 telas, 84 ok**, 1 falso positivo |
| Produção rodando o código novo | confirmado |
| CI dos 4 commits do dia | `tsc` + `review` verdes |
| Integridade do banco pós-limpeza | 0 órfãos novos · 0 estoque negativo |

### Testes de lógica (um arquivo por vez)

`avisos-caixa` 12 · `estorno` 9 · `logica` 86 · `pix-conciliacao` 4 ·
`pix-destinos` 23 · `robustez` 81 · `trocas` 14 — total **229**, zero falha.

### Telas

85 rotas do painel, logadas em produção. Todas 200 e sem erro de console, exceto:

- 🟢 `/painel/pedidos-app/imprimir` — "SEM TITULO". **Falso positivo conhecido:**
  página de impressão sem `?id=` não tem título por desenho.

Telas afetadas pelas mudanças do dia, medidas no smoke:
`/painel/compras` 1.994 ms · `/painel/estoque/encomendas` 2.543 ms ·
`/painel/pdv/operacao` 2.910 ms — todas 200.

### Deploy

A tela de Encomendas em produção mostra a legenda nova ("A entrada no estoque é feita
pela nota de entrada") e não mostra a antiga: o deploy está com o código do dia.

### Integridade depois da limpeza dos cadastros

Era o risco real de apagar produto. Conferido em produção:

- `estoque`, `itens_venda`, `itens_tabela_preco`, `numeros_serie`,
  `itens_nota_entrada`, `itens_pedido`, `itens_devolucao`: **0** referência para
  produto inexistente.
- `movimentacoes_estoque`: **1** órfão, e é anterior a esta rodada (produto
  `43344f7f…`, apagado por sessão anterior — é um dos ids órfãos que já existiam).
- 0 linha de estoque negativa · 0 par produto+depósito com linha duplicada.

## Não rodado (e por quê)

- **Suíte e2e** (`npx playwright test`) — **decisão do dono**. A suíte escreve no
  banco de produção: `pdv.spec.ts` finaliza uma venda de verdade e abre caixa,
  `estoque.spec.ts` baixa estoque de produto real, `financeiro.spec.ts` cria
  lançamentos. Com as duas lojas atendendo (caixa aberto em Petrópolis e
  Teresópolis), a limpeza passa a depender de o teste terminar inteiro, e sujeira de
  teste no movimento do dia é o que se quer evitar no fechamento do mês.
- **Invariantes do mês** (`scripts/qa-invariantes.mjs`) — exige
  `SUPABASE_ACCESS_TOKEN` (Management API), que não está no ambiente nem no
  `.env.local`. Rodar com: `SUPABASE_ACCESS_TOKEN=... node scripts/qa-invariantes.mjs`.

## Severidade

- 🔴 Crítico: nenhum.
- 🟡 Médio: nenhum aberto pelo check-up (as pendências do dia estão na passagem de turno).
- 🟢 Pequeno: o falso positivo da página de impressão.

## Cleanup

Nada criado em produção por este check-up. Os únicos arquivos novos são os backups em
`docs/registros-banco/2026-11/`, já commitados.
