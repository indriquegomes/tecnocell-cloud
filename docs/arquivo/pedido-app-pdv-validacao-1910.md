# Pedido do App no PDV — validação de 19/10/2026

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

Ambiente de código: checkout temporário em `D:\projetos\tecnocell-pdv-safe-1910`, baseado no `main` remoto `21fa150` e nas alterações locais preservadas do checkout em E:. O E: indicou `Full Repair Needed` e erro CRC; não foi usado para novo build.

## Conferência inicial de produção

- Projeto Supabase: TECNOCELL.CLAUD (`rbjwbfekkhebaschiqda`), Chrome Tecnocell Corp.
- Antes da aplicação, `pedidos_app_atendimentos` tinha apenas `pedido_id`, `unidade` e `confirmado_em` obrigatório.
- Assinaturas instaladas de `finalizar_venda`, `finalizar_venda_com_desconto_item`, `cancelar_pedido_app` e `validar_operador_pedido_app` conferidas contra a chamada preparada.
- Formas ativas: cartão crédito/débito, dinheiro, fiado, outros, Pix e vale-crédito. Vale-crédito ficou excluído deste atendimento até haver suporte transacional explícito.
- `maquinas_cartao` tem `nome`, taxas de débito/crédito e máximo de parcelas; `perfis` tem permissões e cargo.
- Nenhuma venda, cobrança, baixa ou pedido foi executado nesta conferência.

## Migração em produção — 20/10/2026

- O titular autorizou a aplicação em TECNOCELL.CLAUD. O SQL de `supabase/migrations/20261019_pedido_app_pdv_atomico.sql` foi executado no SQL Editor do Chrome Tecnocell Corp, envolto em `begin`/`commit`; o painel retornou `Success. No rows returned`.
- Pré-verificação: 0 colunas novas e 0 funções novas. Pós-verificação: 2 colunas (`encaminhado_em`, `venda_id`), 4 funções e 2 gatilhos. `authenticated` não tem `EXECUTE` em `finalizar_pedido_app_pdv`.
- O arquivo executado tinha SHA-256 `C2793FA04C20132B84FE633303D9A84916B592ABC14B633EB4DF7F1DA6568AD6`. Foi aplicado manualmente no SQL Editor; reconciliar o histórico de migrations antes de qualquer `db push` futuro.
- A aplicação não envolveu venda real, pagamento, caixa ou baixa de estoque. O fluxo novo continua inativo na interface até publicação do Cloud e ativação de `PEDIDOS_APP_PDV_ENABLED`.

## Provas locais

- `node --test e2e/pedido-app-pdv-pglite.cjs e2e/pedidos-app-guards.cjs`: 26/26 passaram. O teste de SQL usa PGlite e finalizador fictício; cobre venda única, repetição, rollback depois da criação da venda, isolamento de loja/cliente, estoque, vínculo, caixa, fiado pendente, taxa de cartão e autorização de preço. O histórico de venda cancelada também foi testado. Não substitui ensaio com o RPC real.
- `node --test e2e/pedido-impressao.cjs e2e/pedido-retorno-login.cjs`: 6/6 passaram para a ficha antiga e o retorno ao pedido após login.
- `tsc --noEmit` e `npm run build`: concluídos com saída 0 no D: após as últimas alterações.
- O novo fluxo está atrás de `PEDIDOS_APP_PDV_ENABLED`; sem publicação e sem essa variável, a versão publicada segue no fluxo antigo.

## Ativação e ensaio pendentes

1. Publicar Cloud com a variável de ativação após revisão da versão candidata. Conferir o alias público.
2. Ensaiar com pedido, valor, unidade e forma de pagamento concretos autorizados pelo titular; comparar venda, caixa, estoque e situação do App antes/depois.
3. Conferir cupom de 80 mm na prévia. Impressão física foi adiada pelo titular.
4. Sincronizar este registro ao Obsidian após reparo seguro do E:.

Não marcar como homologação financeira em produção até concluir os passos 1–3.

## Atualização posterior — 20/10/2026: publicado, interface rejeitada

Esta atualização substitui os pontos acima que ainda indicavam publicação/ativação pendente.

- PR #6 integrado ao main em `ea25049f6acfd7c2a554ae66b2e58a4eeac3277d`; deploy `A8CzC1Bdg43jjxEisUxnz14rkh7E` Ready e associado a `tecnocell-cloud.vercel.app`.
- `PEDIDOS_APP_PDV_ENABLED=true` configurada para Production e Preview. O domínio público mostra Atender no PDV.
- 32 testes locais, TypeScript local/GitHub e build local/Preview passaram. A revisão automatizada do Claude falhou na execução do serviço e não concluiu a revisão.
- O titular rejeitou o componente separado `PedidoAppPDVClient`: deve usar o `PDVClient` e o cupom existentes. A correção não foi implementada até este registro.
- Pedido de teste `183f3200-819d-46f4-ae02-a5eaa64bd2d5`, Petrópolis, R$ 135,00: apenas encaminhado. Banco consultado: pendente/pendente, confirmado_em NULL, venda_id NULL. Não foi concluída venda nesta execução; não havia caixa aberto e nenhuma forma de pagamento foi selecionada.
- A migração aplicada manualmente ainda não está registrada como versão 20261019 no histórico remoto; reconciliar antes de db push.
- Relatório completo: `docs/relatorio-situacao-app-cloud-pagamento-20261020.md`. Não usar E: nesta continuidade.


## Roteiro vigente para homologação — correção local de 20/10/2026

Este roteiro substitui o ensaio da tela paralela. Não há autorização para usar E:; perfil externo correto é Tecnocell Corp. A impressão nativa atual usa o layout existente de 58 mm; a ficha antiga de 80 mm é outra rotina e seus testes não provam impressão física do PDV.

### Portões locais

- [x] Excluir componente/cupom paralelos e renderizar sempre PDVClient.
- [x] Provar hidratação, preços e carrinho ocupado (aceitar/recusar), limpeza ao desvincular, isolamento de operador, IMEI e consulta/reimpressão.
- [x] Provar dinheiro/troco, Pix manual, cartão parcelado/taxa e fiado no componente real com rede fictícia.
- [x] Rodar SQL real dos finalizadores, F9, cancelamento e devolução no PGlite; testar rollback e várias unidades.
- [x] Suíte conjunta: 252/252. TypeScript: saída 0.
- [x] Build final após últimas alterações: saída 0 (105 páginas geradas).

### Histórico e migration remotos — depois dos portões locais

1. Confirmar no navegador autenticado **TECNOCELL.CLAUD**, ref `rbjwbfekkhebaschiqda`. Não usar outro projeto nem o conector recusado.
2. Ler histórico `supabase_migrations.schema_migrations` para versões `20261019` e `20261020040612`; conferir colunas, permissões, funções e gatilhos instalados contra os arquivos locais. Não copiar credenciais.
3. A migration `20261019_pedido_app_pdv_atomico.sql` tem SHA-256 `C2793FA04C20132B84FE633303D9A84916B592ABC14B633EB4DF7F1DA6568AD6`. Se instalada integralmente e ausente do histórico, reconciliar SOMENTE `20261019` com `supabase migration repair --status applied 20261019`, em CLI ligada ao projeto correto. No SQL Editor, registrar somente essa versão após a mesma conferência. Não fazer db push geral nem marcar versões antigas sem conferir.
4. Aplicar somente a incremental `20261020040612_pedido_app_devolucao_integral.sql`, uma vez, verificando se ainda não existe. Confirmar os quatro helpers/gatilhos e que `anon`/`authenticated` não ganharam EXECUTE. Registrar a nova versão no histórico se a aplicação for manual.
5. Revisar/preservar diff e documentos, publicar a versão corrigida no fluxo autorizado e comprovar alias público servindo PDVClient. Deploy Ready sozinho não prova fluxo financeiro.

### Pedido e operador — antes de qualquer venda

- Pedido autorizado: `183f3200-819d-46f4-ae02-a5eaa64bd2d5`, Petrópolis, três itens/uma unidade cada, R$ 135,00 (47 + 41 + 47).
- Confirmar vínculo comercial, fiado já liberado legitimamente e permissões do operador para PDV/F9/Devolução. Se não permitido, parar a parte financeira e informar; não alterar cadastro/permissões para forçar teste.
- Revalidar se já existe venda. Se existir, consultar/reimprimir e reconciliar o que já ocorreu; não criar outra venda.
- Fotografar saldos atuais dos produtos `63e11c5359a9c815ccd58a69`, `642c518427740d8d3ff8ac67`, `658099a7b942995b8d1b5ddc` em PETRÓPOLIS LOJA e PETRÓPOLIS ESTOQUE.
- Operador abre/confere caixa de Petrópolis com saldo real e informa forma de quitação e reembolso. Não assumir abertura zero ou dinheiro recebido.

### Ciclo autorizado e provas

1. Abrir o pedido no PDV oficial; conferir cliente, três itens, preço total, banner e depósito PETRÓPOLIS LOJA. Confirmar proteção de qualquer atendimento de balcão existente.
2. Fechar R$ 135,00 em Crédito Loja (Fiado) no pagamento normal. Registrar uma única venda, atendimento vinculado, caixa, pagamentos, lançamento a receber e saldos. Esperado: uma unidade baixada de cada produto somente em PETRÓPOLIS LOJA; App confirmado com pagamento pendente.
3. Reabrir, repetir solicitação e reimprimir: mesmo venda_id, nenhuma nova venda/baixa/dívida. Conferir origem/referência/link no cupom normal; fechar impressão não desfaz venda.
4. Consultar F9; operador informa recebimento. Quitar pelo mecanismo normal e comprovar lançamento pago, movimento/conta corretos e App pago. Repetição da operação de recebimento não duplica entrada.
5. Tentar cancelamento simples: deve bloquear por recebimento já existente. Fazer **Devolução integral**, itens reaproveitáveis/OK, ao depósito PETRÓPOLIS LOJA, com reembolso escolhido pelo operador. Não forçar cancelar_venda diretamente nem apagar dados.
6. Comprovar uma unidade restaurada por produto, estorno/reembolso na conta/caixa correto, conservação do histórico e pedido cancelado/pagamento pendente. O vínculo permanece e impede outra venda. Não aplicar estorno manual duplicado.
7. Comparar antes/depois por IDs, totais e eventos; não registrar dados pessoais/segredos. Anotar separadamente navegador, backend real e Android. Sem acesso ao APK, não declarar status visual do Android validado.

Estado desta rodada: preparação local; nenhum passo financeiro acima foi executado. Concorrência real entre conexões e impressão física continuam pendentes de homologação.

Bloqueio atual: ferramentas CUA e node_repl não inicializam (kernel assets, os error 3); perfil/login do Tecnocell Corp não pôde ser inspecionado. Nenhuma aplicação ou reconciliação remota feita. Usar `docs/pdv-app-preflight.sql` após restabelecer a ferramenta.
