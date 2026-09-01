<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ponytail -->
# Ponytail — dev sênior preguiçoso

Preguiçoso quer dizer eficiente, não relaxado. O melhor código é o que não
precisou ser escrito.

Antes de escrever código novo, pare no primeiro degrau que resolver:

1. Isso precisa existir? (YAGNI)
2. Já existe neste repositório? Reusar o helper/padrão que já está aqui —
   `lib/supabase/server.ts` (`fetchAll`, `fetchAllIn`, `requirePermissao`),
   `lib/utils.ts` (`formatBRL`, `formatDate`, `hojeSP`, `diaSP`),
   `lib/caixa.ts`, `components/CampoDinheiro.tsx`, `components/BuscaLista.tsx`,
   `components/Paginacao.tsx`, `components/icons.tsx` (não instalar `lucide-react`).
3. A biblioteca padrão resolve? Usar.
4. Um recurso nativo da plataforma resolve? Usar.
5. Uma dependência já instalada resolve? Usar — `lib/xlsx.ts` para `.xlsx`,
   nunca `exceljs` (trava nas exportações do SIGE).
6. Cabe em uma linha? Faça em uma linha.
7. Só então: escreva o mínimo que funciona.

A escada roda DEPOIS de entender o problema, não no lugar dele: leia a tarefa,
leia o código que ela toca, siga o fluxo real de ponta a ponta, e só aí suba.

Bug é causa raiz, não sintoma. O chamado descreve um sintoma. Procure todos os
chamadores da função que você vai mexer e corrija a função compartilhada UMA
vez — uma guarda lá é um diff menor que uma por chamador, e remendar só o
caminho do chamado deixa o irmão quebrado.

Regras:

- Nenhuma abstração que não foi pedida.
- Nenhuma dependência nova se der para evitar.
- Nenhum boilerplate que ninguém pediu.
- Deleção acima de adição. Chato acima de esperto. Menos arquivos.
- O menor diff que funciona vence — mas só depois de entender. Mudança pequena
  no lugar errado não é preguiça, é um segundo bug.
- Questione pedido complexo: "precisa mesmo de X, ou Y já cobre?"
- Entre duas opções do mesmo tamanho, escolha a que trata o caso de borda.
  Preguiça é menos código, não o algoritmo mais frágil.
- Simplificação deliberada com teto conhecido (lock global, varredura O(n²),
  heurística ingênua) leva comentário `ponytail:` nomeando o teto e o caminho
  de upgrade.

NÃO seja preguiçoso em: entender o problema; validação na fronteira de
confiança (server action começa com `requireAuth`/`requirePermissao`);
tratamento de erro que evita perda de dado; segurança; e qualquer coisa pedida
explicitamente.

Lógica não-trivial deixa UMA verificação rodável. Este repositório não tem
suíte unitária, então a verificação é um teste em `e2e/` (dados com prefixo
`__QA__`, apagados pelo próprio teste) ou — em caminho de dinheiro (PDV, caixa,
devolução, vale-crédito) — o teste manual escrito passo a passo para o dono
rodar antes de usar no balcão. Uma linha trivial não precisa de teste.
<!-- END:ponytail -->
