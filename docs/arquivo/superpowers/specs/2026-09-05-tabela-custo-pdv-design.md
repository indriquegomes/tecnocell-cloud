# Tabela CUSTO no PDV

## Objetivo

Permitir que qualquer usuário do PDV consulte o custo atual dos produtos durante o trabalho diário, sem permitir venda pelo custo.

## Solução

Adicionar a opção virtual `CUSTO` ao seletor de tabelas do PDV. Ela não terá registro em `tabelas_preco` nem cópia em `itens_tabela_preco`; o preço exibido virá diretamente de `produtos.preco_custo`.

Ao selecionar `CUSTO`:

- buscas e itens do carrinho exibem `preco_custo`;
- todos os usuários podem consultar;
- finalização e salvamento de venda/orçamento ficam bloqueados;
- a tela informa: `Tabela CUSTO é somente consulta. Selecione uma tabela de venda.`

Ao voltar para Preço Padrão, ATACADO1 ou ATACADO2, o carrinho recalcula os preços pela tabela escolhida e volta a permitir venda.

## Regras de segurança

- `CUSTO` nunca é enviado como `tabela_preco_id`.
- Validação ocorre também no servidor; alterar o cliente não pode contornar o bloqueio.
- Produto sem `preco_custo` exibe custo zerado/indisponível, mas continua sem possibilidade de venda nessa visualização.

## Escopo

Alterar somente o fluxo do PDV e seus testes. Não criar tabela no banco, não duplicar custos e não mudar os importadores.

## Verificação

- CUSTO aparece para vendedor, administrador e master.
- Busca e carrinho usam `preco_custo`.
- Venda e orçamento são recusados no cliente e no servidor enquanto CUSTO estiver selecionado.
- Trocar para tabela de venda recalcula carrinho e libera finalização.
- Preço Padrão, ATACADO1 e ATACADO2 continuam funcionando.
