# Publicar anúncio no Mercado Livre direto do TecnoCell — design

## Contexto e objetivo

Hoje o TecnoCell só **importa** anúncios que já existem no Mercado Livre
(`importarAnuncios`, casando por código) — nunca criou nada novo lá. O
usuário quer o caminho contrário: escolher um produto do estoque e publicar
um anúncio novo no Mercado Livre, direto do TecnoCell, sem entrar no site
deles.

Motivo de negócio: alguns dados do produto, do jeito que estão cadastrados
aqui, não podem ir pro Mercado Livre sem ajuste — nome de marca de terceiro
(ex: "Apple", "Samsung") no título de um acessório não-oficial é motivo
recorrente de denúncia por uso indevido de marca. O produto em si, no
estoque do TecnoCell, não tem problema nenhum — o ajuste é só pro anúncio.

Confirmado com o usuário (perguntas de esclarecimento, 2026-08-21):
- Fluxo: produto do estoque → escolhido numa tela → editado (categoria,
  título, atributos, fotos) numa tela de rascunho → revisado → publicado.
- Categorias variam muito (não são só 5-10 fixas) → atributos têm que vir
  **dinamicamente da API do Mercado Livre**, não de um formulário fixo por
  categoria.
- Categoria escolhida **navegando a árvore manualmente** (não por sugestão
  automática a partir do título).
- Primeira versão: só **anúncio comum** (não-catálogo). Catálogo fica pra
  uma etapa futura — exige bater com um `catalog_product_id` já existente
  no Mercado Livre, é uma capacidade adicional e não bloqueia a atual.
- Fotos: upload de várias fotos específicas do anúncio (não usa só a
  imagem única do cadastro de produto).
- Rascunho revisável antes de publicar (não publica direto ao salvar).

## Onde entra na estrutura existente

**`app/painel/integracoes/produtos/page.tsx` já existe** (criada numa
sessão anterior como placeholder) — lista todo o estoque ativo com busca e
paginação, coluna "Integrado com" hoje sempre mostrando "Não integrado"
fixo (nenhuma integração real estava conectada quando foi criada). Essa é
a tela de entrada que o usuário descreveu ("a tabela geral... um menu
dentro do menu integração"). Este design **estende essa página**, não cria
uma nova lista de produtos do zero.

## Modelo de dados

Nova tabela `rascunhos_anuncio_ml` — o anúncio em edição, separado do
produto original (que nunca é alterado):

```sql
create table rascunhos_anuncio_ml (
  id uuid primary key default gen_random_uuid(),
  produto_id text not null references produtos(id),
  conexao_id uuid not null references integracoes_mercado_livre(id) on delete cascade,
  categoria_ml_id text,          -- ex: "MLB1055", null até escolher a categoria
  categoria_ml_nome text,        -- nome legível, cacheado pra exibição (evita rechamar a API só pra mostrar breadcrumb)
  titulo text,
  atributos jsonb not null default '{}'::jsonb,  -- { "BRAND": "Genérico", "MODEL": "..." }, chave = attribute id do ML
  fotos jsonb not null default '[]'::jsonb,      -- array de URLs (Supabase Storage)
  preco numeric,                 -- sugerido do produto.preco, editável só aqui
  status text not null default 'rascunho' check (status in ('rascunho', 'publicado', 'erro')),
  ml_item_id text,               -- preenchido só depois de publicar com sucesso
  erro_publicacao text,          -- mensagem crua do Mercado Livre, se falhar
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_rascunhos_ml_produto on rascunhos_anuncio_ml(produto_id);
create index idx_rascunhos_ml_conexao on rascunhos_anuncio_ml(conexao_id);
```

Bucket novo pro Supabase Storage, `anuncios-ml`, criado por migration (mesmo
padrão do bucket `clientes`, `insert into storage.buckets`) — mas
**público**, ao contrário do `clientes`: o Mercado Livre precisa buscar a
foto por URL pra montar o anúncio, não dá pra usar URL assinada aqui.

Por que uma tabela nova em vez de reaproveitar `integracoes_mercado_livre_anuncios`:
essa tabela existente representa **anúncio que já existe no Mercado
Livre** (importado ou publicado) — colunas como `ml_item_id` são
obrigatórias na prática em todo o código atual. Um rascunho, por
definição, ainda não tem `ml_item_id`. Misturar as duas coisas na mesma
tabela obrigaria a tornar colunas opcionais em código que hoje assume que
elas existem (`buscarVisaoGeral`, `buscarAnunciosSemEstoque` etc.) — risco
desnecessário. Um rascunho vira uma linha em
`integracoes_mercado_livre_anuncios` **só quando publica com sucesso** —
esse é o ponto de entrada que já é sincronizado automaticamente por
`sincronizarEstoqueML` (que descobre a conexão pelo `conexao_id` da própria
linha do anúncio, sem precisar saber nada sobre rascunhos).

## Fluxo de telas

1. **`/painel/integracoes/produtos`** (existente, editada): coluna
   "Integrado com" passa a mostrar o nome da conta ML quando o produto já
   tem um anúncio publicado (join em `integracoes_mercado_livre_anuncios`
   por `produto_id`), ou um botão "Publicar no Mercado Livre" quando não
   tem — visível só se houver pelo menos uma conexão ML ativa. Clicar cria
   uma linha em `rascunhos_anuncio_ml` (status `rascunho`, produto_id +
   conexao_id, resto vazio) e navega pro rascunho.

2. **`/painel/integracoes/lojas/mercado-livre/[conexaoId]/anuncios/rascunho/[rascunhoId]`**
   (nova): tela de edição.
   - **Categoria**: navegação em árvore — começa nas categorias-raiz do
     site (`GET /sites/MLB/categories`, endpoint público, sem token), cada
     categoria escolhida busca as filhas (`GET /categories/{id}` →
     `children_categories`) até `children_categories` vir vazio (categoria
     folha). Breadcrumb mostra o caminho escolhido, com botão pra voltar
     um nível.
   - **Atributos**: assim que a categoria folha é escolhida, busca
     `GET /categories/{id}/attributes` — monta o formulário na hora.
     Atributos com `tags.required` viram campos obrigatórios; atributos
     com `value_type: "list"` (o `values` da resposta) viram `<select>`
     com as opções que o próprio Mercado Livre define; o resto vira texto
     livre. Sem tabela de atributos por categoria no nosso banco — é
     buscado ao vivo toda vez.
   - **Título**: pré-preenchido com `produtos.nome`, mas editável (é
     onde o ajuste de marca acontece).
   - **Fotos**: upload de várias imagens pro Supabase Storage (mesmo
     padrão de `components/actions.ts` → `uploadFotoReport`, bucket
     próprio `anuncios-ml`), guarda os URLs públicos no array `fotos`.
   - **Preço**: pré-preenchido com `produtos.preco`, editável só aqui.
   - Salvar grava o rascunho (`status` continua `rascunho`) sem chamar o
     Mercado Livre — pode fechar e voltar depois.

3. **Revisão** (mesma tela do rascunho, ou uma seção que aparece quando os
   campos obrigatórios estão todos preenchidos — decisão de implementação,
   não muda o modelo de dados): mostra um resumo (categoria, título,
   atributos, preço, fotos) e o botão **Publicar**.
   - Ao clicar: monta o payload e chama `POST /items` no Mercado Livre.
   - **Sucesso**: grava `ml_item_id` e `status = 'publicado'` no rascunho,
     E insere uma linha em `integracoes_mercado_livre_anuncios`
     (`ml_item_id`, `conexao_id`, `produto_id`, `titulo_ml`, `preco_ml`,
     `is_catalogo: false`) — a partir daqui o anúncio se comporta como
     qualquer outro anúncio já importado (sincroniza estoque, aparece nas
     Minhas Vendas etc). Redireciona pra `/painel/integracoes/produtos`
     com uma mensagem de sucesso.
   - **Erro**: grava `status = 'erro'` e `erro_publicacao` com a mensagem
     crua que o Mercado Livre devolveu (ex: "atributo BRAND é
     obrigatório"), mostra na tela pro usuário corrigir e tentar de novo —
     o rascunho continua existindo, nada se perde.

## Mudanças em `lib/mercado-livre.ts`

Três funções novas, todas passando por `chamarML` (ponto único de chamada
à API, mesmo padrão de tudo que já existe no arquivo):

```ts
export async function buscarCategoriasFilhas(conexaoId: string, categoriaId: string | null): Promise<{ id: string; nome: string }[]>
// categoriaId null → GET /sites/MLB/categories (raiz)
// categoriaId preenchido → GET /categories/{id}, devolve children_categories (vazio = é folha)

export async function buscarAtributosCategoria(conexaoId: string, categoriaId: string): Promise<AtributoCategoriaML[]>
// GET /categories/{categoriaId}/attributes

export async function publicarAnuncio(conexaoId: string, payload: PublicarAnuncioInput): Promise<{ id: string }>
// POST /items — lança erro com a mensagem do Mercado Livre em caso de falha
// (mesmo padrão de erro que chamarML já usa hoje: throw new Error(`Mercado Livre API ${status}: ${texto}`))
```

`chamarML` já cuida de token/renovação — essas três funções não precisam
saber nada sobre isso, igual todo o resto do arquivo.

## Fora do escopo desta entrega (fica documentado, não esquecido)

- **Anúncio de catálogo** (bater com `catalog_product_id` existente) —
  fica pra depois, quando anúncio comum estiver funcionando bem.
- **Sugestão automática de categoria** a partir do título — usuário
  prefere escolher manualmente por enquanto.
- **Editar um anúncio já publicado** por aqui (mudar atributos/fotos
  depois de já estar no ar) — este design cobre só criar um anúncio novo.
- **Sincronizar preço automaticamente depois de publicado** — o preço vai
  uma vez, no momento de publicar; se o preço do produto mudar depois, o
  anúncio no Mercado Livre não muda sozinho (igual hoje, nenhum anúncio
  importado tem esse sync automático de preço).

## Teste manual (mexe com anúncio de verdade no Mercado Livre — sem suíte automatizada cobrindo isto)

1. Em "Meus Produtos", escolher um produto sem integração, clicar
   "Publicar no Mercado Livre".
2. Navegar a árvore de categorias até uma folha real (ex: capinha de
   celular) e confirmar que os atributos que aparecem batem com o que o
   próprio Mercado Livre mostra pra essa categoria (comparar com a tela de
   anúncio novo direto no site deles).
3. Preencher, tentar publicar faltando um campo obrigatório de propósito —
   confirmar que o erro do Mercado Livre aparece na tela e o rascunho não
   se perde.
4. Preencher tudo certo, publicar — confirmar que o anúncio aparece de
   verdade no Mercado Livre, com foto, categoria e atributos corretos.
5. Confirmar que a linha nova aparece em "Meus Anúncios" daquela loja e
   que "Integrado com" na tela de produtos mostra a conta certa.
6. Mudar o estoque desse produto no TecnoCell e confirmar que o anúncio
   novo sincroniza o estoque automaticamente (mesmo mecanismo de sempre).
