# Pedido do App no PDV — validação de 19/10/2026

Ambiente de código: checkout temporário em `D:\projetos\tecnocell-pdv-safe-1910`, baseado no `main` remoto `21fa150` e nas alterações locais preservadas do checkout em E:. O E: indicou `Full Repair Needed` e erro CRC; não foi usado para novo build.

## Conferência de produção, somente leitura

- Projeto Supabase: TECNOCELL.CLAUD (`rbjwbfekkhebaschiqda`), Chrome Tecnocell Corp.
- `pedidos_app_atendimentos` tem apenas `pedido_id`, `unidade` e `confirmado_em` obrigatório. A migration desta entrega ainda não foi aplicada.
- Assinaturas instaladas de `finalizar_venda`, `finalizar_venda_com_desconto_item`, `cancelar_pedido_app` e `validar_operador_pedido_app` conferidas contra a chamada preparada.
- Formas ativas: cartão crédito/débito, dinheiro, fiado, outros, Pix e vale-crédito. Vale-crédito ficou excluído deste atendimento até haver suporte transacional explícito.
- `maquinas_cartao` tem `nome`, taxas de débito/crédito e máximo de parcelas; `perfis` tem permissões e cargo.
- Nenhuma venda, cobrança, baixa, pedido ou alteração SQL foi executada nesta conferência.

## Provas locais

- `node --test e2e/pedido-app-pdv-pglite.cjs e2e/pedidos-app-guards.cjs`: 26/26 passaram. O teste de SQL usa PGlite e finalizador fictício; cobre venda única, repetição, rollback depois da criação da venda, isolamento de loja/cliente, estoque, vínculo, caixa, fiado pendente, taxa de cartão e autorização de preço. O histórico de venda cancelada também foi testado. Não substitui ensaio com o RPC real.
- `node --test e2e/pedido-impressao.cjs e2e/pedido-retorno-login.cjs`: 6/6 passaram para a ficha antiga e o retorno ao pedido após login.
- `tsc --noEmit` e `npm run build`: concluídos com saída 0 no D: após as últimas alterações.
- O novo fluxo está atrás de `PEDIDOS_APP_PDV_ENABLED`; sem migration e sem essa variável, a versão publicada segue no fluxo antigo.

## Ativação e ensaio pendentes

1. Revisar e autorizar especificamente a migration `20261019_pedido_app_pdv_atomico.sql` no projeto correto. Ela adiciona vínculo único com a venda, funções de encaminhamento/conclusão, guarda de cancelamento e sincronização de pagamento F9.
2. Publicar Cloud com a variável de ativação somente após a migration e o build final. Conferir o alias público.
3. Ensaiar com pedido, valor, unidade e forma de pagamento concretos autorizados pelo titular; comparar venda, caixa, estoque e situação do App antes/depois.
4. Conferir cupom de 80 mm na prévia. Impressão física foi adiada pelo titular.
5. Sincronizar este registro ao Obsidian após reparo seguro do E:.

Não marcar como homologação financeira em produção até concluir os passos 1–4.
