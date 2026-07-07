---
name: design-polish
description: "Polimento leve de UI do TecnoCell — deixa a tela consistente e bonita sem redesenhar do zero. Aplica o brand (azul #1B6CA8 + laranja #F47920), cards limpos, hierarquia de botão, espaçamento, toasts discretos. Use quando o usuário pedir pra 'dar uma mexidinha' no visual, deixar menos feio, arrumar o design/layout, deixar mais bonito/profissional, padronizar a aparência de uma tela."
trigger: /design-polish
---

# /design-polish — Uma mexidinha no visual

Melhora a cara da tela **sem redesenhar**. A regra do dono: **"só uma mexidinha"** — deixar consistente e limpo, não inventar tela nova. Menos é mais ([[design-clean-minimalista]]).

## O que NÃO fazer

- **Não redesenhar do zero** nem inverter o layout que já funciona.
- **Não trocar o logo** do topo — o Vitor vai mandar a arte nova ([[padrao-visual-dashboard]]).
- **Não encher de cor/badge.** Cor com intenção; alerta discreto (toast no canto que some, não bloco no meio).
- **Não mexer na lógica** — é só aparência (classes/markup), o comportamento fica igual.
- Não inflar: 3-5 ajustes por tela, os que mais "despoluem". Parar quando ficou limpo.

## O brand (usar sempre)

- **Azul `#1B6CA8`** = primário (botão principal, destaque, link). **Laranja `#F47920`** = marca/CTA pontual. Branco = fundo. Semânticas: emerald (ok), rose (erro), amber (aviso).
- Fonte da verdade: `docs/design/brand.md` e `docs/design/referencias-ui.md`.

## Checklist de polimento (pegar os que se aplicam)

1. **Cards** — `rounded-2xl border border-gray-200 bg-white shadow-sm`, cantos generosos, respiro interno (`p-4`/`p-6`). Nada de borda dura sem sombra.
2. **Hierarquia de botão** — 1 primário sólido azul por área (ação principal); secundário com borda/fundo neutro; destrutivo em texto/vermelho discreto. **Nunca dois primários competindo** ([[design-clean-minimalista]]).
3. **Espaçamento arejado** — `space-y-6` entre blocos, `gap` no flex/grid (não margin solta). Deixar a tela respirar.
4. **Números** — `tabular-nums` em tudo que é valor/quantidade (não "dança" ao atualizar). Dinheiro sempre `formatBRL`.
5. **Header padrão** — título `text-2xl font-bold text-gray-900` + subtítulo `text-sm text-gray-400`; botão de ação principal no canto direito.
6. **Estados** — vazio tratado ("Nenhum X no período", cinza centralizado); loading com spinner suave; feedback imediato (disabled/spinner no submit — usar `components/SubmitButton.tsx` e `components/Carregando.tsx`).
7. **Toast discreto** — aviso some sozinho no canto, não bloqueia. Erro rose, sucesso emerald.
8. **Herói azul** (quando a tela tem um número-chave: dashboard, resumo) — card `#1B6CA8`, texto branco, número grandão `text-[38px] font-extrabold tabular-nums`, eyebrow uppercase, círculo `bg-white/5` no canto. É onde gasta a ousadia; o resto fica claro ([[padrao-visual-dashboard]]).
9. **Listas** seguem o [[padrao-lista-universal]] (cards de resumo + busca + tabela item-a-item + badges de status + ordenável).

## Fluxo

1. **Ver antes.** Screenshot da tela atual (Playwright, logado) — registrar o estado.
2. **Ajustar** só o markup/classes, seguindo o checklist. Sem tocar em lógica/dados.
3. **Ver depois.** Screenshot de novo, comparar. Ficou mais limpo? Nada quebrou/saltou de layout?
4. Dev primeiro, push só com OK ([[fluxo-testar-dev-antes-de-subir]]).

Grounding: [[design-brand-tecnocell]], [[design-clean-minimalista]], [[padrao-visual-dashboard]], [[padrao-lista-universal]].
