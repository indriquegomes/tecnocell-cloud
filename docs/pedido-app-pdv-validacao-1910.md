# Pedido do App no PDV — validação de 19/10/2026

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
