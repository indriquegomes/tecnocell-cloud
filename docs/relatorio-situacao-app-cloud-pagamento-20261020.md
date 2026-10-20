# Tecnocell — situação do App, Cloud e pagamento

Data: 20/10/2026. Relatório técnico para pesquisa e continuidade.

## 1. Resumo executivo

O aplicativo Android e o ERP Tecnocell Cloud usam o mesmo backend Supabase TECNOCELL.CLAUD, referência `rbjwbfekkhebaschiqda`. Não foi constatada uma desconexão geral entre os sistemas: cadastro, aprovação e pedidos já atravessaram os dois sistemas. A integração financeira ainda não está homologada.

O erro atual de implementação é concreto: ao clicar em “Atender no PDV”, a rota do PDV renderiza uma interface nova (`PedidoAppPDVClient`) em vez de carregar o pedido no componente já existente (`PDVClient`). A tela separada tem pagamento e impressão próprios. O titular rejeitou essa solução. A correção ainda não foi implementada.

O fluxo desejado é: pedido do App chega ao Cloud; funcionário abre o pedido no PDV normal; confere a forma de pagamento no fluxo existente; conclui a venda; o pedido recebe a referência da venda; imprime pelo cupom normal do PDV. Não criar outra tela de caixa ou outro cupom.

## 2. Ambientes e versões

- Cloud público: https://tecnocell-cloud.vercel.app
- Repositório: https://github.com/indriquegomes/tecnocell-cloud
- PR publicado: https://github.com/indriquegomes/tecnocell-cloud/pull/6
- Merge em `main`: `ea25049f6acfd7c2a554ae66b2e58a4eeac3277d`.
- Deploy de produção: `A8CzC1Bdg43jjxEisUxnz14rkh7E`, estado Ready; domínio público associado, conferido no Vercel.
- Checkout de trabalho: `D:\projetos\tecnocell-pdv-safe-1910`; branch `codex/app-pdv-1910`, HEAD local `534a22f`. Esse HEAD é anterior ao merge do PR, mas contém as alterações publicadas.
- Regra atual do titular: trabalhar no D:, não usar E:. E: apresentou CRC/Full Repair Needed.
- Flags: `PEDIDOS_APP_PDV_ENABLED=true` salva no Vercel para Production e Preview. O gerenciamento de pedidos está liberado em Production e a interface nova foi observada no domínio público.
- Nenhum APK novo foi gerado nesta rodada. A validação Android financeira segue pendente.

## 3. Integração já existente

Contratos preservados: `cadastros_clientes`, vínculo `pessoa_id`, `pedidos_app`, criação por `criar_pedido_app`, atendimento por unidade em `pedidos_app_atendimentos`.

No histórico desta conversa estão registrados cadastro/confirmação por e-mail, aprovação legítima no Cloud, pedido recebido/confirmado/cancelado nos dois sistemas, isolamento entre contas e recuperação web de senha concluída com novo login no APK. Esses registros não equivalem à homologação do novo atendimento financeiro.

Na rodada atual foi observado diretamente que o Cloud autenticado lista o pedido, mostra suas peças e valores e abre o atendimento da unidade correta. O menu Aplicativo contém Autorizar clientes e Pedidos do App.

O vínculo comercial entre cliente do App e pessoa da loja deve usar `cadastros_clientes.pessoa_id`. Ele não deve confundir cadastro comercial com perfil de funcionário. Há também um achado anterior de identidade Auth compartilhada entre o usuário de funcionário “joao” e o e-mail usado pelo titular no App; isso explica a possibilidade de uma troca de senha afetar ambos. A separação dessas identidades ainda precisa de investigação própria; não houve separação nem alteração automática de senhas nesta rodada.

## 4. Banco publicado

Migração aplicada manualmente no SQL Editor do projeto correto, com autorização do titular: `supabase/migrations/20261019_pedido_app_pdv_atomico.sql`.

Arquivo SHA-256: `C2793FA04C20132B84FE633303D9A84916B592ABC14B633EB4DF7F1DA6568AD6`.

Verificação real após aplicação:

- Colunas `encaminhado_em` e `venda_id`; vínculo único de venda e FK para `vendas`.
- `confirmado_em` aceita NULL para distinguir encaminhamento de conclusão.
- Funções novas: `encaminhar_pedido_app_pdv`, `finalizar_pedido_app_pdv`, `atualizar_pagamento_pedido_app`, `atualizar_cancelamento_venda_pedido_app`.
- `cancelar_pedido_app` foi substituída para impedir cancelamento simples quando há venda vinculada.
- Gatilhos `pagamento_pedido_app_f9` e `cancelamento_venda_pedido_app` instalados.
- A nova finalização não está liberada para execução direta por `authenticated`; o acesso passa pelo servidor Cloud e sua autorização.

A função de conclusão foi projetada para bloquear o pedido, revalidar unidade/cliente/depósito/caixa/estoque/pagamento, reutilizar `finalizar_venda_com_desconto_item`, vincular a venda ao caixa e ao pedido e confirmar a unidade na mesma transação. Uma repetição deve retornar a venda existente. Essa intenção foi testada de forma isolada, mas não foi comprovada com uma venda real usando o finalizador instalado.

A migração foi aplicada pelo SQL Editor e não consta como versão `20261019` no histórico `supabase_migrations.schema_migrations`, conforme leitura real. Reconciliar o histórico antes de qualquer futuro `db push`. Não reaplicar o arquivo às cegas nem marcar migrações antigas como aplicadas sem conferência.

## 5. Falha exata da interface

Em `app/painel/pdv/page.tsx`, a presença de `pedidoApp` causa retorno antecipado de `PedidoAppPDVClient`. Isso impede o uso do `PDVClient` normal nesse atendimento.

O componente novo reproduz seleção de depósito, pagamentos, cartões, parcelas, troco e impressão. Essa duplicação não atende ao requisito do titular e pode divergir das regras do PDV comum.

O cupom do componente novo também é próprio. Embora consulte a venda, ele não reutiliza a renderização completa do cupom normal. Não foi comprovada equivalência com código de rastreio, link e demais elementos exigidos pelo titular. Testes da ficha antiga de 80 mm não validam esse cupom novo.

A correção deve remover o desvio de interface, carregar o pedido no PDV existente, preservar cliente/peças/quantidades/preços, impedir mistura com carrinho em andamento e manter a finalização protegida contra duplicidade. O PDV comum deve continuar com comportamento normal para vendas que não vêm do App.

## 6. Pagamento e F9

Pedido recebido não representa dinheiro recebido. Encaminhar ao PDV também não registra pagamento nem aceita financeiramente a venda.

O requisito é selecionar a forma de pagamento no PDV normal. Dinheiro/Pix/cartão só devem constar como recebidos conforme operação real do caixa; selecionar Pix não comprova recebimento bancário. Não foi entregue um gateway ou confirmação automática de Pix nesta etapa.

Fiado/recebimento futuro deve produzir a obrigação a receber no mecanismo já existente do Cloud. O F9 é usado no PDV para consultar/receber esses lançamentos. Imprimir pedido ou confirmar disponibilidade, isoladamente, não cria essa dívida.

A nova função e o gatilho pretendem refletir a quitação posterior no status de pagamento do App. Ainda falta comprovar o ciclo real de fiado no F9, quitação e atualização no App. Não afirmar que todo pedido pendente já aparece no F9.

Depois de uma venda vinculada, o cancelamento deve seguir o procedimento de venda/devolução do PDV, com seus efeitos financeiros e de estoque, e não o cancelamento simples do pedido.

## 7. Pedido de teste atual e estado financeiro

Pedido autorizado pelo titular para teste: `183f3200-819d-46f4-ae02-a5eaa64bd2d5`, criado em 19/10, Petrópolis. Três itens, uma unidade de cada:

1. Acabamento analógico Xbox 360 cinza, kit com 2: R$ 47,00.
2. Adesivo interior PlayStation PS5: R$ 41,00.
3. Acabamento analógico PlayStation PS4, kit com 2: R$ 47,00.

Total: R$ 135,00. O titular confirmou que é pedido de teste e permitiu utilizá-lo em uma venda de teste com movimentação financeira/estoque.

O pedido foi apenas encaminhado ao atendimento. Resultado real consultado no banco: `status=pendente`, `status_pagamento=pendente`, `encaminhado_em` preenchido, `confirmado_em=NULL`, `venda_id=NULL`. Não houve conclusão de venda por esta execução.

Antes de finalizar, foi constatado que Petrópolis não tinha caixa com status `aberto`. A forma de pagamento não foi selecionada e o botão Concluir e imprimir não foi acionado. A execução foi interrompida após a rejeição da tela separada. Não abrir caixa automaticamente nem presumir recebimento.

Saldos medidos em PETRÓPOLIS LOJA, por produto: `63e11c5359a9c815ccd58a69`: 3; `642c518427740d8d3ff8ac67`: 1; `658099a7b942995b8d1b5ddc`: 2. Em PETRÓPOLIS ESTOQUE os três saldos eram zero. São uma fotografia anterior ao teste, não garantia de saldo atual.

## 8. Testes e limites da evidência

- 32 testes locais passaram na versão candidata: guardas de autorização, carregamento por unidade, encaminhamento, chamada de conclusão, SQL isolado, ficha antiga e retorno após login.
- TypeScript local e `npm run build` passaram depois de incorporar as mudanças recentes do main.
- TypeScript no GitHub e deploy Preview passaram; produção ficou Ready.
- A revisão automatizada do Claude no GitHub falhou por erro da execução do serviço, sem produzir uma revisão concluída. Não considerar esse check aprovado.
- O teste financeiro PGlite usa um finalizador fictício. Prova o comportamento da integração no cenário simulado, não a compatibilidade completa com o finalizador real instalado.
- Abrir o pedido no atendimento foi comprovado no Cloud real. Uma venda real, recebimento F9, cancelamento da venda, baixa/restauração de estoque e impressão pelo PDV existente ainda não foram comprovados nesta integração.
- Impressão física de 80 mm foi adiada pelo titular.

## 9. Próxima implementação necessária

1. Usar o `PDVClient` existente para o pedido do App, removendo a tela paralela e o cupom paralelo.
2. Reaproveitar preenchimento e travas do PDV; preservar carrinho existente e impedir mistura de vendas.
3. Na conclusão do PDV, encaminhar a origem App ao mecanismo transacional já preparado, preservando autorização, vínculo e idempotência. Não usar finalização genérica como alternativa silenciosa.
4. Usar o cupom normal, incluindo rastreio/link conforme implementação existente, e identificar a origem Aplicativo e o pedido.
5. Revalidar testes e build, publicar a correção autorizada e conferir a tela com o titular.
6. Com caixa aberto e forma de pagamento definida, concluir o pedido de teste e comparar venda, pagamentos, lançamentos, caixa, estoque e estado do App. Testar repetição e reimpressão sem duplicar venda.
7. Cancelar pelo procedimento correto do PDV e conferir os efeitos de reversão. Testar fiado/F9 em cenário identificado próprio, caso não coberto pelo primeiro pagamento.

## 10. Perguntas para o sistema de pesquisa

- Qual é a menor adaptação para importar um pedido imutável para o estado do PDV existente sem duplicar tela, cálculo ou impressão?
- Como preservar a transação única pedido/unidade/venda/caixa ao usar os componentes atuais e garantir idempotência entre abas e respostas perdidas?
- Como o finalizador real cria pagamentos e lançamentos a receber, e como o F9 altera esses registros? Mapear com código/SQL, não por suposição.
- O cupom existente contém rastreio/link e pode ser reutilizado integralmente com identificação da origem App?
- Quais efeitos de cancelamento/devolução já existem sobre estoque, pagamentos e caixa, e como refletir isso no pedido sem dupla reversão?
- Como tratar pedido de várias unidades e pagamento parcial sem declarar o pedido inteiro pago antes da hora?

## 11. Restrições e pendências separadas

Preservar design aprovado do App e dados/alterações locais. Não alterar preços nem fundir identidades automaticamente. Não tratar uma aprovação comercial como autorização de funcionário. Segredos administrativos permanecem no servidor. Há exposição de chave administrativa registrada anteriormente e rotação adiada pelo titular; nenhuma credencial deve ser incluída neste relatório ou enviada ao sistema de pesquisa. Google Play, domínio/SMTP, rastreamento de entrega e melhorias futuras de Perfil permanecem fora desta correção imediata.

Este relatório não declara homologação financeira nem liberação pública. O código publicado contém uma interface que o titular rejeitou e aguarda correção.
