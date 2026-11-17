# Troca com fornecedor — como conferir os dados

> O texto que a equipe lê **não mora aqui**: mora na própria tela, em
> **Estoque → Trocas → “Como funciona a troca com fornecedor”**
> (`app/painel/trocas/Tutorial.tsx`). Se a regra mudar, muda **num lugar só** —
> este arquivo é só a parte de conferência de número.

## Conferir o número antes de falar em erro

1. **Filtre** em Trocas por loja e por fornecedor e confira a contagem de linhas.
   Sem filtro, a lista soma as duas lojas: 17/11/2026 fechou em 244 peças com
   fornecedor (R$ 20.352,60) + 42 sem fornecedor (R$ 2.827,69).
2. **Linha repetida** (mesma peça, mesmo dia, mesma loja) pode ser duas peças de
   verdade — conferir `quantidade` antes de tratar como duplicidade.
3. **Sem fornecedor** é cadastro a completar, não dado corrompido. Agrupe por
   `fornecedor_id`, nunca por `fornecedor_nome` (é texto copiado no dia e fica
   velho depois de renomear o cadastro — agrupar por texto inventa fornecedor
   duplicado).
4. **Abatimento não é perda.** Abatido vira crédito em `lancamentos` (tipo pagar);
   perda vira despesa na categoria `Perda`. Somar os dois infla o prejuízo.
5. **Diferença de valor** só é perda acima da tolerância (`configuracoes` →
   `trocas.tolerancia_diferenca`, padrão R$ 100, teto R$ 1.000). A conta é função
   pura: `lib/trocas-regras.ts`, testada em `test/trocas.test.ts`
   (`node --import ./test/alias.mjs test/trocas.test.ts`).
6. **Leitura crua, sem mexer em nada:** `node scripts/conferencia-trocas.mjs`.

## Onde cada número nasce

| Número | Tabela |
|---|---|
| linha da troca, custo congelado, desfecho | `trocas` |
| saída (`operacao = 'troca'`) e volta (`'entrada'`) | `movimentacoes_estoque` |
| abatimento na dívida | `lancamentos` (tipo `pagar`) |
| perda do mês | `lancamentos` (categoria `Perda`) |

## Armadilha já vista

`excluirTroca` devolve a peça ao estoque **sempre** — inclusive quando a troca
foi lançada sem saída de estoque. Isso infla o estoque em 1 unidade. Antes de
concluir que "o estoque está sobrando", checar se a linha nasceu sem movimento de
saída.
