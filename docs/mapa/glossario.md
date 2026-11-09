# Glossário — um nome oficial por processo

> **Regra:** quando o app, o banco e a conversa usam nomes diferentes para a
> mesma coisa, este arquivo diz qual é o nome oficial. Nome novo só entra aqui.
> A coluna "também aparece" existe para você reconhecer o sinônimo antigo — não
> para usá-lo em tela, código ou documento novo.

## Dinheiro e caixa

| Nome oficial | O que é | Também aparece como | O que o banco grava |
|---|---|---|---|
| **Retirada** | Dinheiro que sai da gaveta (pagamento, troco a banco, depósito) | sangria, "sangria/retirada" | `movimentos_caixa.tipo = 'retirada'` (lançamento com categoria `Sangria / Retirada`) |
| **Reforço** | Dinheiro que entra na gaveta fora de venda (troco inicial, troca de nota) | suprimento, "entrada de caixa" | `movimentos_caixa.tipo = 'reforco'` |
| **Recebimento** | Dinheiro que entra na gaveta por venda paga | — | `movimentos_caixa.tipo = 'recebimento'` |
| **Gaveta** | O dinheiro físico do caixa aberto | caixa (quando fala do dinheiro) | `tipo = 'dinheiro'` — PIX e cartão **não** entram na gaveta |
| **Fechamento de caixa** | A contagem que fecha um caixa aberto | conferência, acerto | `caixas.status = 'fechado'` |
| **Fechamento do mês** | Trava o mês da loja e congela caixa e estoque | congelamento | `fechamentos_mes` |

## Cliente, dívida e crédito

| Nome oficial | O que é | Também aparece como | No banco |
|---|---|---|---|
| **Cliente** | Cadastro de quem compra (pessoa ou empresa) | pessoa, freguês | `pessoas` com `tipo = 'cliente'` |
| **Fornecedor** | Cadastro de quem vende para a loja | pessoa | `pessoas` com `tipo = 'fornecedor'` |
| **Fiado** | Venda sem pagamento agora: vira dívida do cliente | crediário, "A Receber", F9 (a quitação) | `lancamentos.tipo = 'receber'`; pagamento `status = 'pendente'` |
| **Vale-crédito** | Saldo que o cliente tem na loja e usa como pagamento | vale, crédito, "créditos de clientes" | `creditos_clientes`; `formas_pagamento.tipo = 'vale_credito'`; `pagamentos_venda.status = 'vale'` |
| **Devolução em crédito** | Devolução em que o dinheiro fica como saldo | crédito na conta, "credito_conta" | `devolucoes.tipo_credito = 'credito_conta'` |

## Mercadoria que volta

| Nome oficial | O que é | Também aparece como | No banco |
|---|---|---|---|
| **Devolução** | Cliente devolve peça e recebe dinheiro/PIX/crédito | troca (quando é do cliente) | `devolucoes` (RPC `registrar_devolucao`) |
| **Troca com fornecedor** | Peça com defeito que sai da loja e vai para o fornecedor (garantia) | garantia, "troca SP", troca | `trocas` (status `aberta` → `enviada` → volta) |
| **Estorno** | Desfazer um lançamento financeiro já gravado | reversão, cancelamento de pagamento | `lancamentos.status = 'cancelado'` |
| **Cancelamento** | Anular a venda inteira (não é devolução) | — | `vendas.status = 'cancelada'` (RPC `cancelar_venda`) |
| **Reembolso** | O dinheiro que volta para o cliente | devolução em dinheiro | `devolucoes.tipo_credito` = `dinheiro`, `pix`, `credito_conta`, `sem_reembolso`, `cancelamento_fiado` |

## Estoque e compras

| Nome oficial | O que é | Também aparece como | No banco |
|---|---|---|---|
| **Depósito** | Lugar físico onde a peça está (estoque ou loja) | estoque, local | `depositos` (nome no padrão `PETRÓPOLIS LOJA`, `PETRÓPOLIS ESTOQUE`, `TERESÓPOLIS …`) |
| **Loja** | A unidade do negócio (Petrópolis / Teresópolis) | unidade, filial | `lojas` |
| **Movimentação** | Toda entrada/saída de peça do estoque | movimento | `movimentacoes_estoque` (RPC `movimentar_estoque`) |
| **Nota de entrada** | Compra de mercadoria do fornecedor | compra, nota fiscal, NF | `notas_entrada` (+ `itens_nota_entrada`) |
| **Encomenda** | Cliente pede peça que a loja não tem | pedido de encomenda | `encomendas` |
| **IMEI / série** | Número único do aparelho | série, serial | `series` / `imeis` |
| **Serviço** | Item que não controla estoque (mão de obra) | — | `produtos.servico = true` |

## Venda e pedido

| Nome oficial | O que é | Também aparece como | No banco |
|---|---|---|---|
| **Venda** | Venda fechada no PDV | cupom, nota | `vendas` (RPC `finalizar_venda`) |
| **Pagamento da venda** | Cada linha de pagamento (venda mista tem várias) | forma de pagamento | `pagamentos_venda` — **é a verdade do pagamento** |
| **Orçamento / Pedido** | Venda ainda não fechada, guardada para depois | pedido, orçamento | `pedidos` (+ `itens_pedido`) |
| **Pedido do App** | Pedido feito pelo aplicativo do cliente | pedido app | `pedidos_app` (RPC `finalizar_pedido_app_pdv`) |
| **Comanda** | Papel que acompanha a venda | cupom, via | impressão |

## Pessoas que trabalham

| Nome oficial | O que é | Também aparece como | No banco |
|---|---|---|---|
| **Funcionário** | Quem trabalha na loja e tem login | usuário, perfil, vendedor | `perfis` (login) — cargo em `cargos` |
| **Cargo** | Conjunto de permissões | perfil de acesso | `cargos` (+ `permissoes`) |
| **Ponto** | Batida de entrada/saída | registro de ponto | `pontos` (`entrada`, `pausa`, `retorno`, `saida`) |
| **Banco de horas** | Horas somadas/descontadas do funcionário | horas | `banco_horas` |
| **Escala** | Horário previsto de cada pessoa | turno | `escalas`, `escala_excecoes` |
| **Motoboy** | Entregador (valor fixo ou por entrega) | entregador, "por entrega" | `perfis.motoboy_*` |
| **Vale transporte** | Ajuda de custo de transporte do mês | VT | `lancamentos` (categoria de funcionário) |
| **Rescisão** | Acerto final de quem sai | TRCT, acerto | `lancamentos` (Salários › Rescisão) |

## Pessoas

> **Regra:** pessoa sempre pelo NOME COMPLETO. Apelido ou abreviação de nome de
> pessoa é proibido em resposta, documento, comentário de código e texto de tela.
> Vale só para pessoas — siglas e nomes internos do código/banco ficam de fora.

| Nome completo | Papel | Apelido (proibido) | Observação |
|---|---|---|---|
| Indrique Gomes França | **Master / dono do sistema** | — | usuário `indrique`; **onde um documento ou comentário diz "o dono", é ele** |
| João Vítor Maximiano França | Coordenador de Operações | Vitor | ativo — usuário `joao`; titular do CNPJ 38.216.415; **já substituído** nos comentários (07/11/2026) |
| Isabella Beatriz Ferreira de Assumpção | Vendedora (Petrópolis) | Bia | ativa — cadastro em `perfis`, usuário `isabella.beatriz` |
| Isabela Ponciano Camara | Ex-sócia (não trabalha mais na loja) | Isa | todo "Isa" em comentário antigo é ela; **já substituído** em 07/11/2026 |
| Maria Eduarda Kappler da Silva | Vendedora (Petrópolis) | Duda | ativa — usuário `dudakappler`; já substituído nos comentários |
| Brunna Furtado Gonçalves | Vendedora (Petrópolis) | Bruna | ativa — usuário `brunna`; já substituído (o nome tem dois "n") |
| Mariana Vila Real Castelli | Vendedora (Petrópolis) | Mari | ativa — usuário `marianacastelli`; já substituído |

**Nenhum apelido desta tabela existe mais no código** (limpeza de 07/11/2026):
comentário e texto de tela passaram a usar o nome completo. Só `lib/chat-ia.ts`
mantém o de/para, de propósito — é o dicionário que faz o chat entender o
apelido antigo (exceção documentada no próprio arquivo e no CI).

**Onde está a equipe de hoje:** `perfis` (tela Usuários) — é a única fonte
verdadeira. Este glossário guarda só o de/para de apelidos; não é lista de RH.

## Como manter

- Nome novo aparece em tela ou no banco → acrescentar aqui na mesma rodada.
- Nome que cair em desuso → mover para a coluna "também aparece", não apagar.
- Este arquivo não guarda valor, número de mês nem senha — só nome e definição.
