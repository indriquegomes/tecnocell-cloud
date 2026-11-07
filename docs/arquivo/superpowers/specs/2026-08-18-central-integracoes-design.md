# Central de Integrações — design

## Contexto

O TecnoCell não tem hoje nenhuma tela de integrações (e-commerce, marketplace,
pagamento, logística, banco digital) — o módulo é listado no README do
projeto mas nunca foi construído. O SIGE (ERP legado que a loja usa hoje) já
tem uma "Central de Integrações" madura, num subdomínio próprio
(`ec.sigecloud.com.br`), que foi mapeada ao vivo (login + navegação
automatizada) pra servir de referência real, não suposição.

## Objetivo desta entrega

Construir a **estrutura completa** da Central de Integrações — 9 seções +
submenus, navegável, com o mesmo menu do SIGE — mas **sem nenhuma integração
realmente conectada ainda**. Cada seção mostra um estado "não conectado"
honesto (sem fingir que funciona). Conectar de verdade qualquer plataforma
(Mercado Livre, banco digital, transportadora, fornecedor de drop shipping)
é trabalho futuro, decomposto em projetos separados — o primeiro candidato é
Mercado Livre, que só pode começar depois que o TecnoCell for cadastrado
como aplicativo no Mercado Livre Developers (fora do escopo desta entrega).

## Referência: mapeamento do SIGE

Menu lateral fixo, 9 itens, subdomínio `ec.sigecloud.com.br`:

1. **Dashboard** — gráfico comparativo de pedidos (mês atual x anterior) por
   14 plataformas, cards "produtos integrados por plataforma", top 10
   produtos/vendas.
2. **Minhas Lojas** — dropdown "Selecione uma Loja" + botão "Adicionar
   Loja". Cada loja conectada abre em 4 sub-abas: Meus Anúncios, Minhas
   Vendas, Perguntas e Respostas, Anúncios do Catálogo, mais um botão
   "Configurações".
3. **Meus Produtos** — tabela: Tipo, Produto, Categoria, Preço Venda,
   Integrado com. Busca por produto/código, filtro, dropdown "Sincronizar
   com".
4. **Meus Pedidos** — tabela: Código Ecommerce, Cliente, Data criação,
   Status, Status do Envio, Valor, Origem, Última Sincronização. Dropdown
   "Importar pedidos de".
5. **Sincronizações Pendentes** — fila de produtos aguardando sincronizar
   com as lojas virtuais.
6. **Mensagens Automáticas** — evento → mensagem automática (no SIGE, hoje
   só disponível pra Mercado Livre). Lista de "Eventos Cadastrados".
7. **Financeiras** — lista de integrações financeiras (bancos digitais) +
   botão "Adicionar Integração".
8. **Expedição** — integrações de logística/transportadora + botão
   "Adicionar Expedição".
9. **Drop Shipping** — plataformas de fornecedor pra importar produto +
   botão "Adicionar Plataforma".

14 plataformas de e-commerce/marketplace listadas no Dashboard do SIGE: Loja
Integrada, Magento, Magento 2, Mercado Livre, WooCommerce, NEO, Via
Marketplace, Moovin, Magazine Luiza Marketplace, B2W, Nuvem Shop, Shopee,
Amazon, Ecomece. Hoje só Mercado Livre está conectado na conta real da loja.

## Decisão de negócio importante (guarda pra quando conectar de verdade)

Quando qualquer integração de e-commerce for conectada de verdade, o estoque
usado por ela **tem que ser o mesmo `estoque`/`movimentar_estoque` que o PDV
usa** — nunca um contador de estoque separado por canal. Vender no Mercado
Livre e vender no balcão têm que descontar do mesmo lugar, senão vende a
mesma peça duas vezes. Essa regra não muda nada nesta entrega (nada está
conectado ainda), mas é o motivo de "Meus Produtos" já mostrar o catálogo
real (ver abaixo) em vez de ficar vazio.

## Estrutura no TecnoCell

- **Módulo próprio no menu lateral**, no mesmo nível de Financeiro/Estoque/
  Cadastros — não fica dentro de nenhum módulo existente.
- **Permissão nova**: `integracoes`, seguindo o padrão de
  `lib/permissoes.ts` (`ROTAS_PERMISSAO` + `TODAS_PERMISSOES`).
- **Rotas** (App Router, `app/painel/integracoes/...`):
  - `/painel/integracoes` — Dashboard (rota padrão da seção)
  - `/painel/integracoes/lojas`
  - `/painel/integracoes/produtos`
  - `/painel/integracoes/pedidos`
  - `/painel/integracoes/sincronizacoes`
  - `/painel/integracoes/mensagens`
  - `/painel/integracoes/financeiras`
  - `/painel/integracoes/expedicao`
  - `/painel/integracoes/drop-shipping`

## Conteúdo de cada página (v1 — nada conectado)

| Rota | Conteúdo |
|---|---|
| Dashboard | Cards com as 14 plataformas, todas "Não conectado", botão "Conectar" que leva a um aviso "Integração ainda não disponível — em construção" (sem OAuth real, sem fingir que funciona) |
| Minhas Lojas | Lista vazia + botão "Adicionar Loja" (mesmo aviso de "não disponível" ao clicar). As 4 sub-abas por loja (Meus Anúncios, Minhas Vendas, Perguntas e Respostas, Anúncios do Catálogo) só existem quando houver uma loja de verdade — não são construídas nesta entrega, ficam documentadas aqui pra quando o Mercado Livre for implementado |
| Meus Produtos | Tabela **com dado real**: lista o catálogo de `produtos` (nome, categoria, preço, estoque), coluna "Integrado com" = "Não integrado" pra todos. Usa paginação, reaproveitando o componente `Paginacao` já usado em outras telas do projeto |
| Meus Pedidos | Tabela vazia com as colunas certas (Código Ecommerce, Cliente, Data criação, Status, Status do Envio, Valor, Origem, Última Sincronização) |
| Sincronizações Pendentes | Estado vazio "Nenhuma sincronização pendente" |
| Mensagens Automáticas | Estado vazio explicando que depende de uma loja conectada primeiro |
| Financeiras | Estado vazio + botão "Adicionar Integração" (aviso "não disponível") |
| Expedição | Estado vazio + botão "Adicionar Expedição" (aviso "não disponível") |
| Drop Shipping | Estado vazio + botão "Adicionar Plataforma" (aviso "não disponível") |

## Dado / banco

**Nenhuma tabela nova no Supabase nesta entrega.** As 14 plataformas ficam
como uma constante no código (não há nada real pra persistir — nenhuma está
conectada). "Meus Produtos" lê direto da tabela `produtos` já existente, sem
schema novo. Quando a primeira integração real for construída (Mercado
Livre), aí sim entra uma migration pra guardar status/credencial daquela
conexão — fora do escopo aqui.

## Visual

Segue o padrão visual já estabelecido no TecnoCell (cor de marca
`#1B6CA8`/`#F47920`, cards arredondados, mesma tipografia de módulos como
Tabelas de Preço) — a organização de menu/conteúdo espelha o SIGE, o visual
não.

## Fora de escopo (explicitamente, pra não crescer escondido)

- Qualquer conexão real com Mercado Livre, Shopee, Amazon, bancos digitais,
  transportadoras ou fornecedores de drop shipping.
- OAuth, armazenamento de credencial/token, webhook de pedido.
- As 4 sub-abas de "Minhas Lojas" (Meus Anúncios, Minhas Vendas, etc.) — só
  fazem sentido com uma loja de verdade conectada.
- Qualquer sincronização de estoque de verdade (a regra de "mesmo estoque do
  PDV" está documentada aqui pra ser seguida no projeto do Mercado Livre,
  não implementada agora).
