# Tecnocell — situação do App, Cloud e pagamento

**Rodada atual — somente local:** diagnóstico e correção de conciliação Pix preparados; 267/267 testes, TypeScript e build aprovados. Ver [CONCILIACAO-PIX-20261020.md](CONCILIACAO-PIX-20261020.md). Migration nova não aplicada e código não publicado. Produção continua na versão homologada anteriormente. Nenhuma nova venda ou automação nesta rodada.

## Publicação e teste real — estado vigente em 20/10/2026

Main `26b789c` publicado; Vercel produção Ready (`BNPyjK68cGSMUjiwGQJw5Gjwn5CV`). Alias público usa PDV oficial com banner. Venda #8414 Pix R$ 135,00 e devolução integral realizadas pelo fluxo normal. Estoque PETRÓPOLIS LOJA restaurado a 3/1/2; pedido cancelado/pagamento pendente; uma venda vinculada; receber/pagar pagos de R$ 135,00, líquido zero. Caixa existente com abertura R$ 200,00 preservado. Fiado permaneceu desabilitado.

**Limites encontrados:** conta_id nulo nos lançamentos; Operação ainda mantém #8414 no total bruto e aviso de Pix sem comprovante após devolução. Compensação nominal provada; conciliação bancária e tratamento do fechamento ainda precisam revisão. Não houve transferência bancária externa, impressão física, F9 real ou validação visual Android. Não declarar homologação irrestrita.

IDs, horários, saldos e provas detalhadas em [STATUS-PDV-20261020.md](STATUS-PDV-20261020.md). Esta atualização substitui os estados históricos abaixo de versão não publicada e teste financeiro não executado.

**Estado vigente, nova rodada de testes:** consulte [STATUS-PDV-20261020.md](STATUS-PDV-20261020.md). Suíte repetida: 252/252; TypeScript e build saída 0. Banco atualizado; produção autenticada ainda mostra tela paralela antiga. Cliente do pedido está com permite_fiado=false; não executar fiado/F9 nessa condição. Preflight real feito, sem movimentação financeira. Registro abaixo preserva histórico.

## Atualização remota confirmada — 20/10/2026 (nova tentativa)

O controle do Chrome TECNOCELL voltou após reinicialização da ferramenta. Esta atualização substitui o bloqueio de navegador registrado anteriormente.

- Projeto conferido no SQL Editor: TECNOCELL.CLAUD (`rbjwbfekkhebaschiqda`), produção.
- As cinco funções originais conferiram com o arquivo local por hash normalizado; colunas, restrições e dois gatilhos originais também conferiram.
- Somente a versão `20261019`, ausente do histórico, foi registrada em `supabase_migrations.schema_migrations` pelo SQL Editor. Foi reconciliação de metadados, equivalente ao repair; não houve execução do comando CLI nem reaplicação do SQL original.
- `20261020040612_pedido_app_devolucao_integral.sql` aplicada e registrada no histórico na mesma transação. SHA-256: `86322DFA5B149404535D5FA2CAAA915EAD3BE8987702D16BE4F3C72AE3425E29`. Não reaplicar. Não houve db push geral.
- Pós-verificação: **2 versões registradas; 4 funções com hashes conferidos; 4 funções sem EXECUTE para anon/authenticated; 3 gatilhos habilitados e inicialmente diferidos; 0 vendas vinculadas ao pedido de teste** `183f3200-819d-46f4-ae02-a5eaa64bd2d5`.
- Prova: [captura do SQL Editor](pdv-banco-verificado-20261020.png).
- Código local permanece sem commit/push/deploy. Homologação financeira real ainda pendente; nenhum caixa, recebimento, estoque ou reembolso foi movimentado nesta tentativa. Publicar a correção antes do teste real e seguir o roteiro, usando os dados operacionais fornecidos pelo operador.

Data: 20/10/2026. Relatório técnico para pesquisa e continuidade.

**Estado mais recente:** correção local implementada no D:, 252/252 testes e TypeScript aprovados. Build final aprovado (saída 0); histórico remoto reconciliado e incremental aplicada conforme atualização acima. Deploy da aplicação e homologação financeira ainda pendentes. A seção 12 atualiza o diagnóstico histórico abaixo.

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


## 12. Correção local no PDV oficial — 20/10/2026

Base de trabalho: `D:\projetos\tecnocell-pdv-safe-1910`, HEAD inicial `3312d7f`, árvore inicialmente limpa. O main remoto foi consultado em leitura e apontava para `ea25049`; a diferença de conteúdo para HEAD era somente documentação. Nenhum arquivo do E: foi acessado nesta implementação.

- A rota sempre renderiza `PDVClient`. `PedidoAppPDVClient.tsx` foi excluído.
- O carregador entrega cliente comercial vinculado, depósitos autorizados, estoque e séries. Venda existente fica em consulta/reimpressão, sem novo carrinho vendável.
- Rascunho em sessionStorage por operador e aba, sem tokens; restauração antes da importação, confirmação para substituir atendimento ocupado e preservação ao recusar. Desvincular limpa cliente, peças, pagamentos e dados transitórios do atendimento.
- Cliente, unidade, itens, quantidade e preço contratados ficam travados. Promoção e tabela não recalculam o pedido; escolha de IMEI conserva a quantidade contratada. Depósito pode ser escolhido somente dentro da unidade autorizada, sem reduzir silenciosamente a quantidade.
- `finalizarVenda` recebe vínculo opcional, revalida cliente/itens/preços/depósito e despacha exclusivamente para `finalizar_pedido_app_pdv`. Erro jamais aciona finalizador genérico. A RPC instalada continua sendo a transação única de venda/estoque/caixa/vínculo.
- Cupom usa `montarCupomHTML` normal e consulta os dados persistidos da venda, incluindo referência de pedido/unidade na primeira e segunda vias. Mantém identificação normal da venda e acrescenta link autenticado de consulta no Cloud. Não foi criado rastreamento público de entrega.
- Limites já existentes da RPC específica preservados: retirada, sem vale-crédito e sem pagar-na-entrega. Esses controles ficam indisponíveis quando vinculados, para não aceitar dados que a RPC não grava. Dinheiro/troco, Pix manual, cartão/taxas/parcelas e fiado usam o motor de pagamento nativo. Vendas comuns mantêm seus recursos.
- Migration incremental local `20261020040612_pedido_app_devolucao_integral.sql`: gatilhos diferidos observam itens devolvidos e reconferem F9/cancelamento, encerrando o pedido apenas quando todas as unidades foram atendidas e revertidas. Devolução parcial não encerra; não há estorno próprio de estoque ou financeiro.

Verificação local: 252/252 testes passaram em uma execução conjunta, incluindo navegador com componente real e rede fictícia, guardas das actions, cálculos e SQL real dos finalizadores lido das migrations. O PGlite usa tabelas reduzidas de teste e serializa operações: não comprova concorrência em conexões PostgreSQL reais nem o corpo atualmente instalado em produção. Há cobertura de F9 parcial/integral, repetição, rollback, cartão, cancelamento pendente e devolução parcial/integral/múltiplas unidades. A action real de cancelamento recusa fiado já recebido, exigindo Devolução.

A primeira tentativa da regressão TypeScript via Node direto falhou por alias `@/`; repetida com `--import ./test/loader.mjs`, passou. Warnings existentes de `MODULE_TYPELESS_PACKAGE_JSON` foram mantidos; nenhuma alteração em package.json para escondê-los.

Não foram executados nesta etapa: suíte Playwright autenticada com dados reais, runners legados exclusivos de Linux (`/app`, `/scratch`, PostgreSQL binário), impressão física, venda/cobrança/reembolso reais, publicação ou alteração remota. TypeScript passou; build final aprovado (saída 0). O hash da migration 20261019 permanece igual ao aplicado manualmente; a consulta pelo conector recusado não revalidou o histórico remoto.


Bloqueio da etapa remota nesta execução: as duas ferramentas de controle do navegador falharam antes de selecionar o perfil Tecnocell Corp, com `failed to write kernel assets ... caminho não encontrado (os error 3)`. Não é evidência de logout. Banco, histórico remoto, produção e pedido real continuam sem alterações nesta execução. Preflight somente leitura atualizado em `docs/pdv-app-preflight.sql`; retomada deve primeiro restabelecer a ferramenta do navegador correto.
