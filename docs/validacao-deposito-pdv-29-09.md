# Validação manual da autorização de depósito no PDV

Alteração local: finalizarVenda verifica no servidor a loja do depósito e lojas_permitidas do perfil antes da RPC que registra a venda. As alterações preexistentes de aprovação de clientes permanecem preservadas. Referência Obsidian substituta autorizada pelo titular em 29/09/2026: relatório completo de retomada e plano conjunto de venda integrada transferidos.

Executar primeiro em ambiente de teste com dados controlados. Não executar operações de venda em produção sem definição da mercadoria, quantidade, pagamento e autorização desse lançamento.

1. Criar funcionário de teste ativo com permissão pdv e acesso só à loja A. Preparar produto com estoque nos depósitos de A e B e caixa aberto nas duas lojas.
2. Enviar uma tentativa de finalizarVenda com sessão do funcionário e depósito de B, mesmo alterando o identificador no navegador. Esperado: mensagem de falta de permissão; nenhuma nova venda, baixa, pagamento ou lançamento em B.
3. Repetir com depósito inexistente ou sem loja. Esperado: bloqueio antes da RPC, sem alteração de estoque ou caixa. Esse bloqueio pode revelar cadastros legados incompletos; corrigir o vínculo legítimo do depósito, sem desativar a guarda.
4. Em ambiente isolado, simular falha de leitura do depósito/perfil, perfil ausente e lojas_permitidas inválido. Esperado: bloqueio; não tratar erro de consulta como liberação de todas as lojas.
5. Usar depósito de A com caixa fechado. Esperado: bloqueio de caixa fechado e nenhuma venda.
6. Abrir caixa de A e finalizar uma única venda autorizada com o produto de teste e pagamento efetivamente recebido ou modalidade pendente legítima. Esperado: uma venda, baixa da quantidade exata, pagamentos e lançamentos no caixa da loja correta.
7. Repetir com perfil autorizado a todas as lojas (lojas_permitidas null ou []). Esperado: mantém a regra atual do PDV; depósito ainda deve existir e ter loja.
8. Conferir ausência de permissão pdv/sessão expirada. Esperado: recusa antes da venda.

Não foi executado este roteiro contra backend real. A guarda não implementa idempotência de vendas nem integra pedidos_app; esses pontos permanecem pendentes.
