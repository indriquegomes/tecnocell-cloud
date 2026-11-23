# Check-up PDV — TOP 20 e desconto 2ª peça (23/11/2026)

> Rodado em produção (`https://tecnocell-cloud.vercel.app`), com login de teste do
> `.env.local`. Só leitura; nada foi escrito no banco. Receita: `docs/receitas/checkup.md`.

## Fase 1 — Deploy e código

- `git log`: 3 commits do dia — `8220d0a` (campo TOP 20), `da7f6b0` (aviso no PDV),
  `1510ccd` (botão 2ª peça + registro).
- `npx tsc --noEmit`: **0**.
- Deploy da Vercel no ar: o selo TOP 20 e o botão 🎁 aparecem em produção (provado pelo
  Playwright).
- Arquivos soltos no working tree (monitoramento de erro) não são importados pelo código
  commitado — não quebram o build.

## Fase 2 — Smoke das telas (50 rotas)

- **0 telas quebradas** (sem "Application error" / "client-side exception").
- **0 erros de console** e **0 pageerror** nas telas reais.
- 3 "404" no relatório são rotas inventadas pelo teste e que não existem no app
  (`/painel/caixa`, `/painel/extras`, `/painel/bonus`) — falso positivo, não é bug.

## Fase 5 — Usabilidade do PDV (fluxo novo)

Testado clicando de verdade:

- Busca "03645" → **selo TOP 20** aparece no resultado.
- Adicionar ao carrinho → **selo TOP 20** no item e **botão 🎁** presente.
- Clicar 🎁 → **modal "Desconto 2ª peça (garantia)" abre**.
- Digitar desconto na peça TOP 20 → **aviso vermelho "⚠ peça TOP 20 — sem desconto"**.
- Aplicar o benefício numa peça TOP 20 → **o servidor recusa** ("é peça TOP 20 — não entra
  em desconto") e o modal mostra o erro sem fechar.

## Pendências encontradas

- ~~A tabela `beneficios_segunda_peca` ainda não foi criada no banco~~ → **criada em
  23/11** (SQL colado pelo dono; conferida: 9 colunas + índice `beneficios_segunda_peca_pessoa`).
- **Caminho completo testado depois do SQL (só leitura, sem finalizar venda):** cliente
  selecionado, peça **não** TOP 20 adicionada (03889 FRONTAL MOTOROLA E13 LCD VIVID COM
  ARO), botão 🎁 abriu o modal, Aplicar → desconto de 40% aplicado na peça
  (`tipo = percent`). Nenhum erro de console.
- **Falta testar só o registro do uso** (o insert em `beneficios_segunda_peca` acontece
  quando a venda finaliza). Finalizar venda mexe em estoque/caixa — fica para uma rodada
  com produto `__QA__` e limpeza, com autorização do dono.

## Fase 3 (CRUD com `__QA__`) — não rodada

Não executei escrita em produção nesta rodada. Para o teste do registro do benefício,
usar produto de teste `__QA__` + limpeza no `finally`.
