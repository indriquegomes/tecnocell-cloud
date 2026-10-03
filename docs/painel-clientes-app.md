# Cadastros do app

App e SaaS usam o mesmo projeto Supabase. O painel `/painel/clientes-app` usa a conexão de serviço já configurada no SaaS; não exige um segundo projeto nem variáveis `CLIENTES_APP_*`.

Um funcionário com permissão `clientes` analisa o cadastro, busca a pessoa já cadastrada no SaaS pelo nome ou CPF/CNPJ, seleciona a correspondência e clica em **Vincular e aprovar**. A ação grava `pessoa_id` e `status = aprovado` no mesmo cadastro. Não há vínculo automático por nome, e-mail ou CPF, pois homônimos e dados divergentes podem associar contas erradas.

O app só deve registrar pedidos para contas aprovadas. A migration `2026-09-24-00-cadastros-clientes.sql` do app define `pessoa_id` como referência a `pessoas.id`; a RPC `criar_pedido_app` grava esse vínculo no pedido. Antes de habilitar pedidos em produção, testar com uma conta real aprovada e conferir o pedido no banco e no painel.
