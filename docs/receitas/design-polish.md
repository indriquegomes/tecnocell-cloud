# Receita — Uma mexidinha no visual (`/design-polish`)

Melhora a cara da tela **sem redesenhar**. A regra do dono: **"só uma
mexidinha"** — deixar consistente e limpo, não inventar tela nova.

## O que NÃO fazer

- **Não redesenhar do zero** nem inverter layout que já funciona.
- **Não trocar o logo** do topo sem o dono mandar a arte nova.
- **Não encher de cor/badge.** Cor com intenção; alerta discreto (aviso no canto
  que some, não bloco no meio da tela).
- **Não mexer na lógica** — é só aparência (classes/markup); comportamento igual.
- Não inflar: 3 a 5 ajustes por tela, os que mais despoluem. Parar quando ficou
  limpo.

## A marca (usar sempre)

- **Azul `#1B6CA8`** = primário (botão principal, destaque, link).
  **Laranja `#F47920`** = marca/CTA pontual. Branco = fundo.
  Semânticas: emerald (ok), rose (erro), amber (aviso).
- Fonte da verdade: `docs/design/brand.md` e `docs/design/referencias-ui.md`.

## Checklist (pegar os que se aplicam)

1. **Cards** — `rounded-2xl border border-gray-200 bg-white shadow-sm`, cantos
   generosos, respiro interno (`p-4`/`p-6`). Nada de borda dura sem sombra.
2. **Hierarquia de botão** — 1 primário sólido azul por área; secundário com
   borda/fundo neutro; destrutivo em texto/vermelho discreto. **Nunca dois
   primários competindo.**
3. **Espaçamento arejado** — `space-y-6` entre blocos, `gap` no flex/grid (não
   margin solta).
4. **Números** — `tabular-nums` em valor/quantidade (não "dança" ao atualizar).
   Dinheiro sempre `formatBRL`.
5. **Header padrão** — título `text-2xl font-bold text-gray-900` + subtítulo
   `text-sm text-gray-400`; ação principal no canto direito.
6. **Estados** — vazio tratado ("Nenhum X no período", cinza centralizado);
   loading com spinner; feedback no submit (`components/SubmitButton.tsx`,
   `components/Carregando.tsx`).
7. **Aviso discreto** — some sozinho no canto, não bloqueia. Erro rose, sucesso
   emerald.
8. **Herói azul** (tela com número-chave: dashboard, resumo) — card `#1B6CA8`,
   texto branco, número grande `text-[38px] font-extrabold tabular-nums`,
   rótulo em maiúsculas pequeno. É onde se gasta a ousadia; o resto fica claro.
9. **Listas** seguem o padrão universal: cards de resumo + busca + filtros
   recolhíveis + tabela item a item + badge de status + ordenação
   (`components/BuscaLista.tsx`, `components/Paginacao.tsx`).

## Fluxo

1. **Ver antes.** Screenshot da tela atual (Playwright, logado).
2. **Ajustar** só markup/classes, seguindo o checklist. Sem tocar em lógica.
3. **Ver depois.** Screenshot de novo e comparar: ficou mais limpo? nada
   quebrou ou saltou de lugar?
4. Dev primeiro; subir só com o OK do dono.
