# Múltiplas contas Mercado Livre — design

## Contexto

A integração com Mercado Livre (specs `2026-08-19-mercado-livre-integracao-design.md`
e `2026-08-19-dashboard-loja-mercado-livre-design.md`) foi construída inteira em
cima de uma decisão de negócio explícita tomada no início: **"uma conta só, pra
loja toda"**. Por isso `integracoes_mercado_livre` é um singleton — sempre uma
linha só, `id = 'principal'` — e as tabelas de anúncios/pedidos/perguntas/
mensagens não têm nenhuma referência a "de qual conta é isso", porque só podia
existir uma.

O usuário reverteu essa decisão: o negócio vai operar **várias contas Mercado
Livre reais ao mesmo tempo**, número não fixo (pode crescer). Confirmado nesta
conversa:
- Não é conveniência de teste — é uso real, simultâneo, de produção.
- Todas as contas continuam usando o **mesmo depósito físico** (Petrópolis
  Loja, `63d9054d59a9c829747233d4`) — não tem depósito por conta.
- Quantidade flexível — sem limite fixo, cresce com um botão "+ Adicionar
  Conta", não um número travado de vagas.
- Os 903 anúncios já importados da conta que foi desconectada durante os
  testes: **apagar**, começa limpo.

## Escopo

1. `integracoes_mercado_livre` deixa de ser singleton — vira uma linha por
   conta conectada.
2. `integracoes_mercado_livre_anuncios`, `_pedidos_pendentes`, `_perguntas`,
   `_mensagens` ganham uma coluna `conexao_id` — sem isso, impossível saber
   de qual conta cada anúncio/pedido/pergunta/mensagem veio.
3. Webhook aprende a rotear a notificação pra conta certa usando o
   `user_id` que o próprio Mercado Livre já manda no aviso.
4. Fluxo de conectar sempre cria uma conta nova (nunca sobrescreve).
5. Telas: "Minhas Lojas" vira lista de contas; o dashboard de 5 abas (já
   existente) passa a ser por conta; Perguntas/Mensagens do menu lateral
   viram uma caixa de entrada única, somando todas as contas.

## Parte 1 — Banco de dados

### `integracoes_mercado_livre`: de singleton pra multi-linha

```sql
alter table integracoes_mercado_livre drop constraint integracoes_mercado_livre_pkey;
alter table integracoes_mercado_livre alter column id drop default;
alter table integracoes_mercado_livre alter column id type uuid using gen_random_uuid();
alter table integracoes_mercado_livre alter column id set default gen_random_uuid();
alter table integracoes_mercado_livre add primary key (id);
alter table integracoes_mercado_livre add constraint integracoes_mercado_livre_ml_user_id_key unique (ml_user_id);
delete from integracoes_mercado_livre; -- linha 'principal' era a conta de teste ja desconectada
```

A constraint `unique (ml_user_id)` é o que garante "conectar a mesma conta
de novo atualiza, nunca duplica" — o `upsert` do callback OAuth passa a
usar `onConflict: 'ml_user_id'` em vez de `onConflict: 'id'`.

**Por que isso não é mais lento:** o padrão trocado aqui — de um valor fixo
pra uma tabela normal com chave primária indexada — é exatamente como toda
outra relação "um pra muitos" já funciona neste banco (uma venda pertence a
uma loja, um item pertence a uma venda). Buscar "a conexão com esse
`ml_user_id`" numa tabela com índice único é uma operação direta, não um
scan. Não existe uma versão mais rápida de "guardar várias contas" do que
uma linha por conta com índice — qualquer alternativa (misturar tudo num
campo só, tabela nova por conta) seria mais lenta e mais difícil de manter.

### Colunas novas: `conexao_id` nas 4 tabelas dependentes

```sql
alter table integracoes_mercado_livre_anuncios
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_pedidos_pendentes
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_perguntas
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;
alter table integracoes_mercado_livre_mensagens
  add column if not exists conexao_id uuid references integracoes_mercado_livre(id) on delete cascade;

create index if not exists idx_ml_anuncios_conexao on integracoes_mercado_livre_anuncios(conexao_id);
create index if not exists idx_ml_perguntas_conexao on integracoes_mercado_livre_perguntas(conexao_id);
create index if not exists idx_ml_mensagens_conexao on integracoes_mercado_livre_mensagens(conexao_id);
```

`on delete cascade`: desconectar uma conta apaga os anúncios/pendências
dela junto — comportamento já era esse no fluxo de "Desconectar" de hoje
(o singleton sendo apagado deixava tudo órfão sem querer; agora fica
explícito e correto por conta).

`integracoes_mercado_livre_anuncios.ml_item_id` continua `unique` global
(um anúncio do Mercado Livre pertence só a um vendedor, nunca colide entre
contas diferentes — o ID já vem globalmente único da própria API deles).

### Limpeza dos 903 anúncios órfãos

```sql
delete from integracoes_mercado_livre_anuncios; -- nenhum tem venda associada ainda
```

## Parte 2 — Roteamento do webhook por `user_id`

O aviso que o Mercado Livre manda já inclui `user_id` (id numérico do
vendedor dono do evento) no corpo — isso não muda com múltiplas contas, só
passa a ser **usado**. `app/api/integracoes/mercado-livre/webhook/route.ts`
ganha um passo novo antes de despachar por `topic`:

```ts
const { data: conexao } = await supabase
  .from('integracoes_mercado_livre')
  .select('id, access_token, refresh_token, expira_em')
  .eq('ml_user_id', String(body.user_id))
  .maybeSingle()
if (!conexao) return new Response('ok', { status: 200 }) // notificacao de conta que a gente nao tem (ou desconectou)
```

`processarPedido`/`processarPergunta`/`processarMensagem` passam a receber
essa `conexao` (não mais ler o singleton internamente) e gravar
`conexao_id: conexao.id` em cada linha que criam.

### `tokenValido`/`conexaoAtual`: de zero-argumento pra por-conexão

Sem singleton não existe mais "a" conexão — todo lugar que hoje chama
`conexaoAtual()`/`tokenValido()` sem argumento precisa passar a saber qual
conexão está usando. Isso muda as assinaturas (quebra compatibilidade de
propósito — não faz sentido manter um "default" que não tem mais
significado):

- `conexaoAtual()` → **removida**. Vira duas funções:
  - `listarConexoes(): Promise<ConexaoML[]>` — todas as contas conectadas,
    usada por Minhas Lojas.
  - `buscarConexao(conexaoId: string): Promise<ConexaoML | null>` — uma
    conta específica, usada pelo layout do dashboard por conta.
- `tokenValido()` → `tokenValido(conexaoId: string)` — parâmetro
  obrigatório, sem default.
- `chamarML(path, init)` ganha um primeiro parâmetro `conexaoId: string`
  também obrigatório — precisa saber de qual conexão pegar o token antes
  de montar o header `Authorization`.

Cada função que hoje chama essas sem saber de onde tirar o id passa a
receber ou descobrir o `conexaoId`, caso a caso:

| Função | De onde vem o `conexaoId` agora |
|---|---|
| `importarAnuncios()` | Parâmetro novo, vindo do botão "Importar Anúncios" de dentro do card daquela conta específica em Minhas Lojas |
| `buscarAnunciosAguardandoAjuste()` | Parâmetro novo, vindo do segmento `[conexaoId]` da URL do dashboard |
| Página de Anúncios do Catálogo | Mesmo — vem do `[conexaoId]` da URL |
| `responderPerguntaML()` / `responderMensagemML()` | Parâmetro novo — a pergunta/mensagem, na caixa de entrada agregada, já carrega seu próprio `conexao_id` (veio junto no `select`), passa direto |
| `sincronizarEstoqueML(produtoId)` | **Não muda de assinatura.** Ela já busca o anúncio pelo `produto_id` antes de chamar a API — esse anúncio agora vem com `conexao_id` junto no mesmo `select`, então descobre sozinha qual conexão usar sem o chamador (PDV, devolução, estoque) precisar saber nada sobre contas Mercado Livre |
| Webhook (`processarPedido`/`processarPergunta`/`processarMensagem`) | Já descoberto no passo de roteamento por `user_id` acima, passado direto |

## Parte 3 — Conectar sempre cria conta nova

`GET /api/integracoes/mercado-livre/autorizar` e `.../callback` não mudam
de formato de URL (sem parâmetro de "qual vaga") — o botão "+ Conectar
Mercado Livre" em Minhas Lojas sempre aponta pra essa mesma rota. O
callback faz `upsert(..., { onConflict: 'ml_user_id' })`: primeira vez que
aquele `ml_user_id` aparece, cria linha nova; se já existe (usuário
clicou conectar de novo pra renovar token da mesma conta), atualiza a
mesma linha em vez de duplicar.

**Risco em aberto, só resolve testando ao vivo:** o Client ID/Secret hoje
cadastrado no Mercado Livre Developers foi criado pela conta principal. A
suposição (baseada em como app de terceiro funciona na maioria das
plataformas) é que esse mesmo app consegue autorizar contas diferentes —
não é a mesma regra de "só pode criar 1 app por conta". Não dá pra
confirmar isso na documentação oficial (bloqueiam acesso automatizado) —
só testando a segunda conta de verdade. Se der erro específico do Mercado
Livre negando a autorização por conta diferente, é a única parte deste
plano que exigiria voltar aqui e desenhar de novo (ex: precisar de app
separado por conta) — mas nada no código construído até lá precisa mudar
de estrutura por causa disso, só a forma de gerar credenciais.

## Parte 4 — Telas

### Minhas Lojas: lista de contas

`app/painel/integracoes/lojas/page.tsx` passa a buscar **todas** as linhas
de `integracoes_mercado_livre` (não mais uma). Pra cada uma, um card
"Mercado Livre — Conectado como {nickname}" com link pro dashboard daquela
conta e botão Desconectar. Mais um botão "+ Conectar Mercado Livre"
sempre visível no topo.

### Dashboard por conta: rota ganha o id da conexão

`app/painel/integracoes/lojas/mercado-livre/` vira
`app/painel/integracoes/lojas/mercado-livre/[conexaoId]/` — as 5 abas que
já existem (Dashboard, Meus Anúncios, Minhas Vendas, Perguntas e
Respostas, Anúncios do Catálogo) continuam idênticas, só que toda consulta
dentro delas ganha `.eq('conexao_id', conexaoId)`. O layout que hoje
resolve "tem conexão? não tem?" via singleton passa a resolver via esse id
da URL (404/mensagem clara se o id não existir ou não pertencer a nenhuma
conexão real).

### Perguntas e Mensagens do menu lateral: caixa de entrada única

Hoje são 2 itens fixos apontando pra rota de UMA conexão. Isso não
escala (não dá pra criar um item de menu novo toda vez que uma conta é
conectada). Viram duas telas **agregadas**:
`app/painel/integracoes/mercado-livre/perguntas/page.tsx` e
`.../mensagens/page.tsx` (fora da pasta `[conexaoId]`, nível acima) —
listam pendências de **todas** as contas juntas, cada linha mostrando o
nickname de qual conta é (`join` com `integracoes_mercado_livre` pelo
`conexao_id`). O contador do menu lateral (badge) soma o total de todas as
contas. Responder uma pergunta/mensagem dessa lista agregada usa o token
da conexão certa (lido via `conexao_id` da própria linha).

## Riscos identificados e como esta spec trata cada um

| Risco | Tratamento |
|---|---|
| Confundir pergunta/pedido/mensagem de uma conta com outra | `conexao_id` obrigatório (FK) em toda tabela dependente — impossível gravar sem saber de qual conta é |
| Conectar a mesma conta ML duas vezes sem querer, duplicando | `unique (ml_user_id)` + upsert por esse campo — segunda tentativa atualiza, não duplica |
| Desconectar uma conta deixar lixo órfão nas outras tabelas | `on delete cascade` em todo `conexao_id` |
| Webhook de uma conta que não é mais nossa (desconectada) | Roteamento por `user_id` não acha conexão → descarta com 200 silencioso, mesmo padrão já usado pra payload não confiável |
| App único não conseguir autorizar conta diferente da que criou o app | Assunção sinalizada explicitamente — única parte que só o teste ao vivo confirma, sem bloquear o resto da construção |
| Caixa de entrada de Perguntas/Mensagens crescer sem controle visual com muitas contas | Fora de escopo desta spec — cada pergunta/mensagem já mostra de qual conta é; paginação/filtro por conta fica pra quando o volume pedir |
