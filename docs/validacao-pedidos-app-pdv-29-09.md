# Validação manual de pedidos do App no PDV

Implementação local, ainda não liberada para o balcão. Validar em ambiente autorizado antes do uso real. Utilizar dados de QA, sem atribuir recebimento fictício a clientes reais.

1. Conferir no banco atual os tipos, relações e assinaturas do motor de venda, pagamentos, lançamentos, perfis e caixas. Revisar a migração `2026-09-29-pedidos-app-pdv.sql`; cadastrar aliases das unidades com IDs reais explícitos após autorização.
2. Com cliente pendente ou bloqueado, tentar faturar: deve falhar sem venda, movimento de estoque ou lançamento.
3. Com operador restrito à unidade A, abrir a lista e tentar IDs da unidade B, depósito B e caixa B: nenhum faturamento ou vazamento de itens de B deve ocorrer.
4. Criar pedido de QA com cliente aprovado, peça sem serial e estoque suficiente. Confirmar disponibilidade da unidade. Conferir preço, quantidade, pessoa, depósito e caixa abertos.
5. Selecionar dinheiro/Pix sem marcar recebimento: bloquear. Após recebimento real de QA, revisar e finalizar uma vez. Conferir uma venda, uma baixa correta, vínculo ao caixa e pagamentos pelo motor existente.
6. Repetir a mesma requisição e tentar dois envios concorrentes: retornar a mesma venda, sem nova baixa nem novo lançamento. Conferir diretamente os registros e saldo.
7. Alterar preço ou quantidade da requisição; mudar preço no catálogo; fechar caixa; retirar estoque; selecionar peça com serial: bloquear e preservar formulário, sem registros parciais.
8. Forçar falha no vínculo após o motor em ambiente isolado: toda venda, baixa e pagamentos devem reverter.
9. Em pedido com duas unidades, faturar A: B permanece pendente. Faturar B: status agrega ambas sem duplicar itens ou valores.
10. Faturar fiado: pagamento permanece pendente. Liquidar pelo fluxo financeiro existente e conferir atualização após recebimento; comprovante isolado não paga o pedido.
11. Cancelar antes de faturar com permissão para todas as unidades: cancelar sem venda. Após faturar, bloquear cancelamento por essa tela e usar o fluxo existente de devolução/cancelamento.
12. Testar erro de rede, Modificar e atualização após sucesso: manter seleções nos erros, permitir revisão e impedir segunda venda mesmo se a atualização da lista falhar.
13. Validar visualmente em 390 px e desktop: sem corte/rolagem horizontal, seletores e confirmação acessíveis. Navegador ainda não validado nesta sessão.

Resultados locais: 26 cenários SQL com fixture do motor em PGlite; 7 cenários React com actions simuladas; 13 guardas PDV; TypeScript aprovado. Esses resultados não substituem os passos acima no esquema e motor reais.

Leitura real em 29/09/2026, sem executar SQL: projeto TECNOCELL.CLAUD em `main Production`; `public.pedidos_app` existente e vazia (0 registros); `pessoa_id` é `text`. Assinaturas de `criar_pedido_app(jsonb,text)` e `finalizar_venda_com_desconto_item(jsonb,jsonb,text,numeric,text,text,jsonb,uuid,text,numeric,text,text)` conferidas no painel. Corpo do motor e execução da integração ainda pendentes. Nenhuma migration, venda ou gravação foi feita.

Mapeamento conferido no Table Editor real: o catálogo usa `Petrópolis` e `Teresópolis`. Loja Petrópolis `e41aa9ea-820d-44d2-a04a-2e4efc8b0946`; depósito de loja `63d9054d59a9c829747233d4` (`disponivel_app=true`). Loja Teresópolis `81791d01-dc4a-485c-bbb8-f2b4cda6731c`; depósito de loja `63e4dc8ede713ef765366d69` (`disponivel_app=true`). Os depósitos de estoque `d25c7649-0f96-4c80-a7d2-f7e9f5203506` e `666083c9e63f9e10ac7f3092` têm `disponivel_app=false`. A busca por `pedidos_app_` não mostrou tabelas da migração nova no painel. Inserir aliases com esses IDs na migração local exige autorização específica; não foi feito.

Alteração proposta para revisão após autorização: após criar `pedidos_app_unidades`, inserir somente `('Petrópolis', 'e41aa9ea-820d-44d2-a04a-2e4efc8b0946')` e `('Teresópolis', '81791d01-dc4a-485c-bbb8-f2b4cda6731c')`. Não mapear depósitos de estoque. A migration local ainda não contém esses inserts; sem eles, a validação de unidade rejeita os pedidos.
