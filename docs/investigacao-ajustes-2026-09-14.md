# Investigação — Ajustes Sistema Novo · 14/09/2026

## Aviso de cobertura — leia antes de usar este relatório

**O WhatsApp não foi lido nesta sessão.** Nenhuma mensagem do grupo *Ajustes
Sistema Novo* foi acessada. Portanto este relatório **não** contém a tabela de
solicitações, a lista do que os usuários pediram, nem a separação
implementado/parcial/pendente pedida no handoff — essas entregas dependem do
WhatsApp e ficaram por fazer.

O que existe aqui é o lado do código: estado atual do SaaS e evidências
encontradas por leitura do repositório, incluindo a **causa raiz confirmada**
de dois problemas que o relatório anterior havia levantado como pendentes.

Motivo do bloqueio e como destravar estão no fim do documento.

## 1. Estado atual do SaaS

- Produção com dado real desde 05/09/2026 (Petrópolis), migração SIGE→TecnoCell
  concluída. Fonte: `CLAUDE.md`.
- Ritmo alto de mudança: 130+ commits entre 31/08 e 14/09.
- 155 migrations no total; a mais recente é de 10/09.
- **Checkout local está 3 commits atrás do `origin/main`:**
  - `b3a4d4d` PDV: checkbox pagar na entrega na tela de pagamento (ao escolher fiado)
  - `dc9d1e9` PDV: item avulso no orçamento (item sem produto, preço estimado)
  - `7e4ba71` Bot WhatsApp: manual da loja (endereço, horário, cadastro, política)

Frentes ativas na última semana: PDV (desconto por item, pagar na entrega,
venda abaixo do custo), fiado (`permite_fiado`, combinado na entrega), PIX
(chave e titular dinâmicos, alerta de PIX sem comprovante), remessa de estoque
em duas etapas, bot de WhatsApp (histórico, comprovantes, planilhas) e
sincronização sombra com o SIGE.

### Lacuna de ferramental

`package.json` declara apenas `dev`, `build` e `start`. **Não há script de
teste, type-check ou lint**, embora existam `test/` (4 testes) e `e2e/`
(4 specs Playwright). Na prática nada roda por padrão — o `CLAUDE.md` exige
"confirmar que o type-check passou antes de qualquer commit", mas não há
comando para isso. Vale um ticket próprio.

## 2. Evidências no código

### 2.1 Cupom não mostra "Retirada" — CONFIRMADO, causa raiz localizada

Estado: **pendente** (bug real, nunca funcionou). Confiança: **alta**.

O dado existe e é gravado. `vendas.tipo_entrega` ('retirada' | 'entrega') vem
da migration `2026-08-28-retirada-entrega-venda.sql` e é passado ao RPC em
`app/painel/pdv/actions.ts:304`. A interface também existe: os botões
"🏪 Retirada" e "🛵 Entrega" estão em `PDVClient.tsx:2709-2717`.

O defeito está na montagem do cupom. Em `PDVClient.tsx:1358`, o snapshot do
cupom só recebe o campo quando é **entrega**; quando é retirada, o valor é
`null`. E a impressão, em `PDVClient.tsx:1974`, só sabe imprimir a linha de
entrega — o `else` dela cai em "Endereço do cliente".

Consequência: numa venda de retirada o cupom **não imprime nada** indicando
retirada — e, se o cliente tiver endereço cadastrado, imprime **"Endereço do
cliente"**, que num balcão de retirada parece entrega. Não é só ausência de
informação: é informação enganosa.

O comentário em `PDVClient.tsx:580` diz "só entra no cupom", o que mostra que a
intenção era imprimir — a implementação ficou pela metade.

Observação separada: `components/DocumentoPedido.tsx` (cupom de Pedido/
Orçamento, formato 80mm) também não tem retirada/entrega, e o tipo `PedidoImpr`
sequer possui o campo. São dois cupons distintos; corrigir um não corrige o
outro.

Próxima ação: **corrigir**.

### 2.2 Produtos saem sem gaveta impressa — CONFIRMADO, causa raiz localizada

Estado: **pendente** (bug real). Confiança: **alta**.

"Gaveta" no código é `prateleira`. O caminho normal funciona: ao adicionar um
produto pela busca, `PDVClient.tsx:794` grava `prateleira: p.prateleira`, e o
cupom imprime em `PDVClient.tsx:1887`. As consultas de produto trazem o campo
(`actions.ts:55`, `:82`, `:668`).

O defeito está em **carregar um orçamento/pedido no carrinho**. A função
`carregarOrcamento` (`PDVClient.tsx:1426-1446`) monta os itens do carrinho
campo a campo e **omite `prateleira`**. Todo item que entra por esse caminho
fica sem gaveta, e o cupom imprime a linha sem a etiqueta.

Isso explica exatamente o sintoma relatado — "**alguns** produtos" — em vez de
todos: só falham os itens que vieram de um orçamento.

Por que o type-check não pegou: em `PDVClient.tsx:194` o campo é declarado
opcional (`prateleira?: string | null`), então omitir não é erro de tipo.

A correção é de uma linha: `prod` já está em escopo em `PDVClient.tsx:1430`,
bastando `prateleira: prod?.prateleira ?? null`. **Não apliquei nada** — o
handoff proíbe alterar o SaaS durante a investigação.

Próxima ação: **corrigir** (e considerar tornar o campo obrigatório no tipo,
para o compilador pegar o próximo caso).

### 2.3 Fiado bloqueado só no cliente — CONFIRMADO

Estado: **parcial**. Confiança: **alta**.

`pessoas.permite_fiado` existe (`2026-09-10-fiado-liberado-entrega.sql`), mas a
validação acontece **apenas no navegador**, em `PDVClient.tsx:1220`.

No servidor, `permite_fiado` só é **lido para exibição**
(`app/painel/pdv/actions.ts:160-171`); nem a server action `finalizarVenda` nem
o RPC `finalizar_venda` verificam o campo. A própria migration assume isso:
*"o PDV bloqueia os outros"* e *"não precisa mexer no RPC finalizar_venda"*.

É uma decisão consciente documentada, não um descuido — mas significa que a
trava é contornável por quem chamar a API direto. Como o campo nasceu com
`default false`, o efeito de um bypass é liberar fiado para cliente que a loja
marcou como não autorizado.

Próxima ação: **decidir** se o risco justifica mover a trava para o RPC.

## 3. Sugestões de ticket (NÃO criados)

Nada foi criado nem alterado no Jira. Sugestões para `TEC`:

| Sugestão | Base | Ação |
|---|---|---|
| Cupom do PDV imprimir "Retirada" e parar de cair no endereço do cliente | 2.1 | Corrigir |
| `carregarOrcamento` perder a prateleira dos itens | 2.2 | Corrigir |
| Cupom de Pedido/Orçamento (`DocumentoPedido`) sem retirada/entrega | 2.1 | Decidir se entra no mesmo ticket |
| Trava de `permite_fiado` no servidor | 2.3 | Decidir |
| Scripts de teste/type-check/lint no `package.json` | §1 | Corrigir |

O relatório anterior sugeria um item só cobrindo "cupom + gaveta". Com a causa
raiz na mão, são **dois bugs independentes, em pontos diferentes do código**, e
merecem tickets separados.

## 4. Dúvidas que dependem de decisão humana

1. O cupom de retirada deve imprimir uma linha "🏪 Retirada", ou apenas parar de
   imprimir o endereço do cliente? Muda o que o cliente recebe em mãos.
2. Em venda de retirada com cliente que tem endereço cadastrado, o endereço deve
   sumir do cupom? Hoje ele aparece e confunde.
3. A trava de fiado deve ir para o RPC (§2.3), assumindo o risco de mexer em
   função de produção que toca dinheiro?
4. Os 3 commits que faltam no checkout local devem ser puxados antes de qualquer
   correção? Um deles mexe justamente no PDV/pagar na entrega.

## 5. Por que o WhatsApp não foi lido

Verificação na ordem que o handoff define:

1. **Navegador que a ferramenta controla:** `list_connected_browsers` retornou
   lista vazia; `tabs_context` respondeu "Claude in Chrome is not connected".
   Nenhuma aba do Chrome real é alcançável.
2. **Navegador interno (fallback do handoff):** abriu `web.whatsapp.com` e o
   próprio WhatsApp recusou o motor — tela "O WhatsApp funciona no Google Chrome
   100 ou posterior". Bloqueio do lado deles, sem contorno.
3. **Histórico local do bot:** `bot-whatsapp/data/` está vazio; não há mensagens
   em cache. Não executei o bot: ele responde sozinho a menções a PIX
   (commit `36de1f3`), e rodá-lo enviaria mensagem ao grupo — proibido pelo
   handoff.

Para destravar: instalar a extensão Claude in Chrome
(https://chromewebstore.google.com/detail/fcoeoabgfenejglbffodgkkbkcdhcgfn),
abrir o painel lateral no Chrome e entrar com a mesma conta. O WhatsApp Web
ainda pedirá o QR code, que precisa ser escaneado pelo celular.
