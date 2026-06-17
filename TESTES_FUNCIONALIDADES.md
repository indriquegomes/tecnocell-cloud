# Testes de Funcionalidades — TecnoCell Cloud

Auditoria estática completa de todos os módulos do `/painel`.
Método: leitura de todos os arquivos `page.tsx` e `actions.ts` de cada módulo.
Data: 2026-06-16 | Branch: `trabalho-noturno`

> **Legenda de status:**
> - ✅ Funciona como esperado
> - ⚠️ Funciona mas com limitação relevante
> - ❌ Bug real — comportamento errado ou dado incorreto

---

## 1. Dashboard (`/painel`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Card "Produtos Ativos" | Contagem total de produtos ativos | Conta `produtos` com `ativo=true` via `count: 'exact'` | ✅ |
| Card "Vendas Hoje" | Soma das vendas do dia atual | Soma `vendas.total` onde `created_at >= hoje` | ✅ |
| Card "Estoque Baixo" | Quantos produtos com estoque ≤ 3 | Filtra `estoque` com `quantidade > 0` e conta os com `quantidade ≤ 3` | ✅ |
| Card "Clientes" | Total de clientes cadastrados | Conta `pessoas` com `tipo='cliente'` | ✅ |
| Card "A Receber" | Soma de todos os lançamentos a receber pendentes | Soma apenas os 5 últimos lançamentos (`.limit(5)`) com `tipo='receber'` e `status!='pago'` | ❌ |
| Card "A Pagar" | Soma de todos os lançamentos a pagar pendentes | Mesma limitação — apenas os 5 mais recentes | ❌ |
| Lista "Últimos Lançamentos" | Mostrar últimos lançamentos financeiros | Mostra os 5 mais recentes, correto para um resumo | ✅ |
| Atalho "Abrir PDV" | Link para PDV | Navega para `/painel/pdv` | ✅ |
| Atalho "Novo Lançamento" | Link para criar lançamento | Navega para `/painel/financeiro/novo` | ✅ |
| Atalho "Chat com IA" | Link para chat | Navega para `/painel/chat` | ✅ |

**Bug crítico:** `aReceber` e `aPagar` são calculados sobre `lancamentosRecentes` que é limitado a 5 registros (`limit(5)`). Se houver 6+ lançamentos pendentes, os cards mostrarão valor errado — menor do que o real. A query de resumo do dashboard precisa de uma query separada que some todos os lançamentos pendentes sem limite.

---

## 2. PDV — Seleção de Produtos (`/painel/pdv`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Grid de produtos | Listar produtos disponíveis para venda | Busca produtos com join de estoque, filtra ativos | ✅ |
| Adicionar ao carrinho | Incluir produto no pedido | Adiciona ao estado local do carrinho | ✅ |
| Controle de quantidade | Aumentar/diminuir qtd no carrinho | Incrementa/decrementa quantidade no estado | ✅ |
| Campo de desconto por item | Aplicar desconto individual | Campo `desconto` no carrinho, descontado no subtotal | ✅ |
| Seleção de forma de pagamento | Escolher como o cliente pagará | Select carregado de `formas_pagamento` | ✅ |
| Seleção de cliente (opcional) | Vincular venda a um cliente | Select de `pessoas`, não obrigatório | ✅ |
| Botão "Finalizar Venda" | Registrar venda completa | Cria: `venda` → `itens_venda` → debita estoque (N+1) → cria `lancamento` | ⚠️ |
| Alerta de estoque insuficiente | Bloquear item com estoque zerado | Não bloqueia automaticamente — mostra produto mesmo sem estoque | ⚠️ |
| Vales de crédito como pagamento | Permitir pagar com vale | Não existe — vales não aparecem nas formas de pagamento | ❌ |
| Tabelas de preço por cliente | Aplicar preço especial ao cliente selecionado | Não implementado — preço padrão sempre usado | ❌ |
| Promoções automáticas | Aplicar descontos de promoções ativas | Não implementado — promoções não têm efeito no PDV | ❌ |

**Bug de performance:** `finalizarVenda` em `actions.ts` atualiza estoque com um loop `for...of`, executando um UPDATE no banco por produto no carrinho. Para um carrinho de 5 itens = 5 queries sequenciais. Deve ser substituído por `upsert` em lote.

---

## 3. PDV — Operação do Caixa (`/painel/pdv/operacao`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Status do caixa | Mostrar se caixa está aberto ou fechado | Busca caixa ativo do dia, exibe estado | ✅ |
| Abrir caixa | Registrar abertura com valor inicial | Insere na tabela `caixas` com `valor_abertura` | ✅ |
| Fechar caixa | Registrar fechamento com valor final | Atualiza caixa com `valor_fechamento` e `fechado_em` | ✅ |
| Resumo das vendas | Total, ticket médio, qtd transações | Calcula a partir das vendas desde abertura do caixa | ✅ |
| Lista de transações do dia | Vendas realizadas no período | Mostra vendas com valor e forma de pagamento | ✅ |
| Histórico de caixas | Caixas anteriores | Tabela com histórico de operações | ✅ |

---

## 4. Financeiro (`/painel/financeiro`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de lançamentos | Mostrar todos A Receber / A Pagar | Busca até 200 registros | ⚠️ |
| Filtro por tipo | Filtrar receber / pagar | Aplica `.eq('tipo', tipo)` quando selecionado | ✅ |
| Busca por texto | Filtrar por descrição ou pessoa | `ilike` em `descricao` ou `pessoa_nome` | ✅ |
| Cards resumo | A Receber, A Pagar, Pendentes | Calculados sobre os resultados filtrados (até 200) | ⚠️ |
| Marcar como pago | Registrar pagamento de um lançamento | `marcarPago` atualiza `status='pago'` | ✅ |
| Editar lançamento | Corrigir dados de um lançamento | Link para página `/financeiro/[id]/editar` | ✅ |
| Excluir lançamento | Remover lançamento | `BotaoExcluir` com confirmação | ✅ |
| Criar novo lançamento | Adicionar receita ou despesa | Link para `/financeiro/novo` | ✅ |
| Filtro por data | Filtrar por período | Não existe | ❌ |
| Recorrência | Lançamentos que se repetem mensalmente | Não implementado | ❌ |

**Limitação:** 200 registros máximos na listagem. Se a empresa tiver mais, os mais antigos somem e os cards de resumo ficam incorretos para o total real.

---

## 5. Estoque (`/painel/estoque`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Tabela de estoque | Mostrar produtos, depósito, quantidade | Join de estoque com produtos, marca, deposito | ✅ |
| Filtro por depósito | Ver estoque de um depósito específico | `.eq('deposito_id', deposito)` | ✅ |
| Busca por produto | Filtrar por nome | `ilike` no nome do produto | ✅ |
| Cards: Em Estoque / Baixo / Zerado | Contadores por faixa de quantidade | `quantidade > 3` / `1-3` / `0` | ✅ |
| Ajustar estoque | Registrar entrada, saída ou ajuste | Link para `/estoque/ajustar/[id]` | ✅ |
| Movimentação — entrada | Aumentar estoque | `upsert` em `estoque` por produto+depósito | ✅ |
| Movimentação — saída | Baixar estoque | Subtrai quantidade com guard de negativo | ✅ |
| Movimentação — ajuste | Forçar quantidade exata | Seta quantidade diretamente | ✅ |
| Histórico de movimentações | Ver log de entradas/saídas | Não existe na página de estoque | ❌ |

---

## 6. Produtos (`/painel/produtos`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Tabela de produtos | Listar produtos com estoque | Select com join de estoque (soma por produto) | ✅ |
| Filtro por busca | Filtrar por nome | `ilike` em nome | ✅ |
| Filtro por categoria | Filtrar por categoria | `.eq('categoria', ...)` | ✅ |
| Filtro por marca | Filtrar por marca | `.eq('marca', ...)` | ✅ |
| Imagem do produto | Mostrar miniatura | Verifica `p.imagem_url` — campo NÃO incluído no select | ❌ |
| Criar produto | Formulário de cadastro | Link para `/produtos/novo` | ✅ |
| Editar produto | Formulário de edição | Link para `/produtos/[id]/editar` | ✅ |
| Excluir produto | Remover produto | `BotaoExcluir` com `deletarProduto` | ✅ |
| Limite de exibição | Mostrar até 200 produtos | `.limit(200)` — sem paginação | ⚠️ |

**Bug:** O JSX em `produtos/page.tsx` (linha 113) testa `p.imagem_url` para exibir a miniatura, mas o campo `imagem_url` **não está no select query** (select inclui: `id, nome, descricao, preco, preco_custo, marca, categoria, ativo, codigo, cat, estoque`). O resultado: sempre mostra o ícone placeholder — a imagem nunca aparece na listagem de produtos.

---

## 7. Clientes / Pessoas (`/painel/clientes`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista unificada | Clientes e fornecedores na mesma tabela | Busca tabela `pessoas`, filtra por `tipo` | ✅ |
| Filtro por tipo | Cliente / Fornecedor / Todos | Select com `.eq('tipo', tipo)` | ✅ |
| Busca por nome | Filtrar por nome | `ilike` em nome | ✅ |
| Criar cliente/fornecedor | Formulário de cadastro | Link para `/clientes/novo` | ✅ |
| Editar | Formulário de edição | Link para `/clientes/[id]/editar` | ✅ |
| Excluir | Remover pessoa | `BotaoExcluir` com confirmação | ✅ |

---

## 8. Pedidos (`/painel/pedidos`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de pedidos/orçamentos | Todos os pedidos com status | Busca `pedidos` com filtros | ✅ |
| Filtro por tipo | Pedido / Orçamento | Select de tipo | ✅ |
| Filtro por status | rascunho / aguardando / aprovado / cancelado / entregue | Select de status | ✅ |
| Criar pedido | Novo pedido de venda | Link para `/pedidos/novo` | ✅ |
| Editar pedido | Alterar dados do pedido | Link para `/pedidos/[id]/editar` | ✅ |
| Aprovação automática → venda | Pedido aprovado gera venda | Não implementado — aprovação muda status mas não cria venda/lancamento | ❌ |

---

## 9. Compras / Notas de Entrada (`/painel/compras`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de notas | Notas de entrada recebidas | Busca `notas_entrada` | ✅ |
| Filtro por status | pendente / recebida / cancelada | Select de status | ✅ |
| Criar nota | Registrar compra | Link para `/compras/nova` | ✅ |
| Receber nota → dar entrada no estoque | Marcar como recebida e atualizar estoque | Não implementado automaticamente | ❌ |

---

## 10. Formas de Pagamento (`/painel/formas-pagamento`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de formas | Mostrar formas cadastradas | Busca `formas_pagamento` | ✅ |
| Criar nova forma | Inline no topo da página | Formulário com nome e prazo | ✅ |
| Editar | Abre o mesmo formulário preenchido | Via `?editar=[id]` na URL | ✅ |
| Excluir | Remover forma de pagamento | `ConfirmButton` com action | ✅ |

---

## 11. Depósitos (`/painel/depositos`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de depósitos | Mostrar depósitos com total em estoque | Busca `depositos` com sum de estoque | ✅ |
| Criar depósito | Inline no topo | Formulário com nome e descrição | ✅ |
| Editar depósito | Inline com valores preenchidos | Via `?editar=[id]` | ✅ |
| Excluir depósito | Remover depósito | `ConfirmButton` com guard se tiver estoque | ✅ |

---

## 12. Tabelas de Preço (`/painel/tabelas-preco`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de tabelas | Cards com cada tabela | Busca com count de itens | ✅ |
| Criar tabela | Formulário inline | Nome e descrição opcional | ✅ |
| Excluir tabela | Remover tabela | `ConfirmButton` com `deletarTabela` | ✅ |
| Contagem de produtos (lista) | Mostrar quantos produtos na tabela | `itens_tabela_preco(count)` — pode mostrar "1" para qualquer tabela não vazia | ⚠️ |
| Detalhe: adicionar produto | Incluir produto com preço especial | Select dos produtos ainda não na tabela + campo preço | ✅ |
| Detalhe: remover produto | Retirar produto da tabela | Botão Remover com confirm | ✅ |
| Detalhe: comparação de preço | Mostrar diferença entre padrão e tabela | Calcula `diff = item.preco - precoPadrao` | ✅ |
| Aplicar tabela no PDV | Ao selecionar cliente com tabela, usar preço da tabela | **Não implementado** — PDV sempre usa preço padrão | ❌ |

---

## 13. Promoções (`/painel/promocoes`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de promoções | Mostrar promoções com status ativa/vencida | Exibe com badge e indicador de vencida | ✅ |
| Criar promoção | Formulário com tipo, valor, datas | Funciona — insere na tabela `promocoes` | ✅ |
| Pausar / Ativar | Toggle do campo `ativa` | `togglePromocao` inverte o booleano | ✅ |
| Excluir | Remover promoção | `deletarPromocao` com ConfirmButton | ✅ |
| Aplicar desconto automaticamente | Desconto aplicado no PDV ou checkout | **Não implementado** — promoções são registros isolados, sem efeito em vendas | ❌ |
| Vincular a produtos específicos | Aplicar promoção só em certos produtos | Não existe — promoção não tem relação com produtos | ❌ |

---

## 14. Vales de Crédito (`/painel/vales-credito`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Cards resumo | Saldo total em vales e contagem de ativos | Soma `saldo` dos vales com `status='ativo'` | ✅ |
| Emitir novo vale | Criar vale vinculado ou sem cliente | Insere com `valor`, `saldo=valor`, `status='ativo'` | ✅ |
| Cancelar vale | Marcar como cancelado | `cancelarVale` seta `status='cancelado'` | ✅ |
| Usar vale no PDV | Aceitar vale como forma de pagamento | **Não implementado** — PDV não lista vales disponíveis | ❌ |
| Deduzir saldo ao usar | Diminuir `saldo` ao pagar com vale | **Não implementado** — não há mecanismo de consumo de saldo | ❌ |

---

## 15. Categorias (`/painel/categorias`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de categorias | Tabela com nome, descrição, total de produtos | Busca categorias e faz count em JS | ✅ |
| Criar categoria | Formulário inline no topo | `criarCategoria` com nome e descrição | ✅ |
| Editar categoria | Formulário inline preenchido | Via `?editar=[id]` na URL | ✅ |
| Excluir categoria | Remover | `deletarCategoria` com `BotaoExcluir` | ✅ |
| Contagem de produtos | Quantos produtos em cada categoria | Busca todos os produtos e filtra por `categoria_id` em JS — ineficiente para muitos produtos | ⚠️ |

**Nota de performance:** A contagem de produtos por categoria é feita buscando todos os registros de `produtos` (sem limite) e filtrando em memória. Para catálogos grandes isso é lento. O correto seria usar SQL: `categorias(count)` ou um group by.

---

## 16. Empresas (`/painel/empresas`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Lista de empresas | Tabela com dados principais | Busca com filtro de busca opcional | ✅ |
| Busca por nome | Filtrar empresas | `ilike` em nome | ✅ |
| Nova empresa | Link para formulário | Navega para `/empresas/nova` | ✅ |
| Editar empresa | Formulário em página separada | `/empresas/[id]/editar` com `editarEmpresa` | ✅ |
| Excluir empresa | Remover | `deletarEmpresa` com `BotaoExcluir` | ✅ |

---

## 17. Configurações (`/painel/configuracoes`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Dados da empresa | Nome, CNPJ, telefone, endereço, cidade, estado, site | Carregados do campo `valor` em `configuracoes` onde `chave='empresa'` | ✅ |
| Moeda | Selecionar BRL ou USD | Salvo em configuracoes.valor.moeda — mas **não aplicado** em nenhum lugar | ⚠️ |
| Fuso horário | Selecionar timezone | Salvo em configuracoes.valor.timezone — mas **não aplicado** | ⚠️ |
| Salvar | Persistir configurações | `upsert` com `onConflict: 'chave'` — funciona | ✅ |
| Feedback inline | Mostrar sucesso/erro sem reload | `useActionState` no ConfigForm — correto | ✅ |

---

## 18. Catálogo (`/painel/catalogo`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Grid de produtos | Mostrar todos os produtos ativos | Busca com `ativo=true`, inclui `imagem_url` | ✅ |
| Toggle visibilidade | Marcar produto como visível/oculto no catálogo | `toggleCatalogo` inverte `visivel_catalogo` | ✅ |
| Editar vitrine | Alterar descrição e URL de imagem para o catálogo | Formulário inline ativado por `?editar=[id]` | ✅ |
| Exibir imagem | Mostrar thumbnail do produto | `imagem_url` está no select — funciona corretamente aqui | ✅ |
| Link para catálogo público | Abrir página pública do catálogo | Não existe link — interface do catálogo público não encontrada | ⚠️ |

**Nota:** Esta página usa `createClient()` (com RLS) em vez de `createServiceClient()` — diferente de todos os outros módulos. Se as políticas RLS não estiverem configuradas, pode retornar dados incorretos ou vazio.

---

## Resumo de Bugs Encontrados

### Críticos (dados incorretos)
| # | Módulo | Bug | Arquivo |
|---|--------|-----|---------|
| 1 | Dashboard | Cards "A Receber" e "A Pagar" calculados sobre apenas 5 lançamentos (deveria buscar todos os pendentes) | `app/painel/page.tsx:32-38` |
| 2 | Produtos | Campo `imagem_url` ausente do SELECT mas usado no JSX — miniatura nunca aparece | `app/painel/produtos/page.tsx:18,113` |

### Funcionais ausentes (integração não implementada)
| # | Módulo | Lacuna |
|---|--------|--------|
| 3 | PDV | Vales de crédito não aparecem como forma de pagamento |
| 4 | PDV | Tabelas de preço não são aplicadas ao selecionar cliente |
| 5 | PDV | Promoções ativas não aplicam descontos automaticamente |
| 6 | Pedidos | Aprovação de pedido não gera venda/lançamento financeiro automaticamente |
| 7 | Compras | Recebimento de nota não dá entrada no estoque automaticamente |
| 8 | Vales | Sem mecanismo de consumo de saldo (status 'usado' nunca é setado) |

### Performance
| # | Módulo | Problema |
|---|--------|---------|
| 9 | PDV (finalizar venda) | N+1 queries para atualizar estoque — um UPDATE por produto no carrinho |
| 10 | Categorias | Count de produtos por categoria feito em JS após buscar todos os registros |

### Menor / Informativo
| # | Módulo | Observação |
|---|--------|------------|
| 11 | Financeiro | Limite de 200 registros na listagem sem paginação |
| 12 | Produtos | Limite de 200 registros na listagem sem paginação |
| 13 | Configurações | Campos moeda e timezone salvos mas não lidos/aplicados em nenhum módulo |
| 14 | Catálogo | Usa `createClient()` com RLS em vez de `createServiceClient()` como os demais |
| 15 | Dashboard | Atalho "Chat com IA" leva para `/painel/chat` — verificar se página existe |

---

## 19. Relatórios (`/painel/relatorios`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Aba "Financeiro" | Lançamentos do período com totais A Receber / A Pagar / Saldo | Filtra `lancamentos` por `data_vencimento` no intervalo, calcula totais | ✅ |
| Aba "Vendas" | Vendas do período com total, qtd e ticket médio | Filtra `vendas` por `created_at`, mostra tabela com status | ✅ |
| Aba "Estoque" | Inventário atual com valor total (qtd × preço) | Join `estoque` + `produtos` + `depositos`, calcula valor em estoque | ✅ |
| Campo "De" (data início) | Filtrar por data de início | Input date, default = 1º do mês | ✅ |
| Campo "Até" (data fim) | Filtrar por data de fim | Input date, default = hoje | ✅ |
| Botão "Filtrar" | Aplicar filtro de período | Reload com `?aba=&de=&ate=` | ✅ |
| Exportar CSV/PDF | Gerar arquivo para download | Não implementado | ❌ |
| Gráficos / visualizações | Evolução financeira, vendas por período | Não implementado — apenas tabelas | ❌ |
| Relatório por categoria | Vendas agrupadas por categoria | Não implementado | ❌ |
| Relatório por forma de pagamento | Receita por forma de pagamento | Não implementado | ❌ |
| CMV / margem bruta | Custo da mercadoria vendida e margem | Não implementado — `preco_custo` existe mas não cruza com vendas | ❌ |
| Comparativo mês a mês | Evolução entre períodos | Não implementado | ❌ |

**Limitações:** Aba Estoque não respeita filtro de datas (snapshot atual). Aba Financeiro filtra por `data_vencimento`, não por `data_pagamento`. Sem paginação na aba estoque (limite implícito 200).

---

## 20. Chat com IA (`/painel/chat`)

| Elemento | O que deveria fazer | O que faz | Status |
|----------|--------------------|-----------| -------|
| Interface de chat | Enviar mensagens para IA, receber respostas | Página existe; usa `@anthropic-ai/sdk` (presente em node_modules) | ⚠️ |

---

## Resumo Executivo

### Bugs Críticos (corrigir primeiro)
1. **Dashboard A Receber/A Pagar incorretos** — calculados sobre `limit(5)` lançamentos → `app/painel/page.tsx:29-31`
2. **Produtos sem imagem na listagem** — `imagem_url` ausente do SELECT → `app/painel/produtos/page.tsx:18`

### Integrações Faltando (maior impacto comercial)
1. Vales de crédito como forma de pagamento no PDV
2. Tabelas de preço aplicadas por cliente no PDV
3. Promoções com efeito real no checkout
4. Nota de entrada dando entrada automática no estoque
5. Aprovação de pedido gerando lançamento financeiro

### Módulos Funcionalmente Completos
Operação PDV/Caixa · Clientes · Empresas · Formas de Pagamento · Depósitos · Categorias · Movimentação de Estoque · Pedidos (CRUD) · Promoções (CRUD)

*Atualizado em 2026-06-17 | Branch: trabalho-noturno | Método: análise estática do código-fonte (TSX + actions.ts)*
