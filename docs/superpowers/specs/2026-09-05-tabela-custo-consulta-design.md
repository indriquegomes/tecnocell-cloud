# Tabela CUSTO para consulta no PDV

## Objetivo

Criar uma tabela de preço normal chamada `CUSTO`, dentro da tela existente **Tabelas de Preço**, para vendedores consultarem custos no PDV sem poder finalizar venda com ela.

## Modelo

- Adicionar `usa_preco_custo boolean not null default false` em `tabelas_preco`.
- Criar uma única tabela ativa `CUSTO` com `usa_preco_custo=true`.
- Criar índice único parcial para impedir duas tabelas de custo.
- Preencher `itens_tabela_preco` da CUSTO com todos os produtos ativos, usando `produtos.preco_custo` e `quantidade_minima=1`.
- Trigger mantém os itens da CUSTO sincronizados quando produto ativo é criado ou quando `preco_custo`/`ativo` muda.
- Produto inativado sai da CUSTO; produto reativado entra novamente.

## Interface

- Nenhuma aba ou rota nova.
- CUSTO aparece como card na tela existente **Tabelas de Preço**.
- CUSTO aparece no seletor existente do PDV para todos os usuários que já podem acessar PDV, mesmo quando o usuário possui lista restrita de tabelas de venda.
- Ao selecionar CUSTO, busca e carrinho usam os valores da tabela.
- Tela mostra aviso `Tabela CUSTO — somente consulta`.
- Botões de avançar/finalizar e salvar orçamento ficam bloqueados enquanto CUSTO estiver selecionada.

## Segurança

- Bloqueio visual não basta: `finalizarVenda` e `salvarOrcamentoPDV` recebem o ID da tabela e recusam tabelas com `usa_preco_custo=true`.
- Erro: `Tabela CUSTO é somente para consulta.`
- Regra não depende do nome da tabela; renomear CUSTO não remove bloqueio.
- Tabela CUSTO não aparece nos seletores de tabela padrão de loja, cliente ou usuário.
- CUSTO não participa de promoções.

## Manutenção

- Edição manual dos itens da CUSTO fica bloqueada; fonte única é `produtos.preco_custo`.
- Exclusão da CUSTO fica bloqueada.
- Demais tabelas continuam sem mudança.
- Migração é idempotente e não altera preços de venda, estoque ou histórico.

## Verificação

- Migração cria uma tabela CUSTO e um item por produto ativo.
- Soma dos itens CUSTO bate soma de `produtos.preco_custo` ativos.
- Alterar custo de produto atualiza item correspondente.
- Inativar/reativar produto remove/recria item.
- PDV carrega CUSTO e reprifica carrinho.
- Interface e server action impedem venda e orçamento.
- ATACADO1, ATACADO2 e Preço Padrão continuam vendendo normalmente.
