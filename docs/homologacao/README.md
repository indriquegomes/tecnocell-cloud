# Ambiente Tecnocell de testes

Alvo exclusivo: Supabase gzetgvbzsinulxgxtflg e Vercel tecnocell-cloud-testes (prj_YQDFt6bVg7iefS6Sy6aB3UwmDX0x). Arquivos abaixo são evidência/baseline, não migrations para reaplicar em bancos existentes.

- baseline-testes-20261102.sql: estrutura obtida de catálogos da origem em READ ONLY, sem dados de negócio, usuários, arquivos, chaves, jobs ou valores Vault. 101 tabelas, 142 rotinas próprias, 323 constraints, 209 índices, 60 policies, duas views e oito sequences. SHA256 E90DA41BC4DD7D6785DFD37FF78137BA1E3BBD39CE2E199F89159B3361124B61.
- seed-ficticios-20261102.sql: duas unidades, dois produtos, saldos, dois clientes e um operador de TESTE; requer as três contas fictícias já provisionadas no Auth. Guarda impede reaplicar em destino populado. Nomes de cidade preservam chaves fixas do App; razão social/endereço/estoque/contas identificam TESTE e não têm contatos reais.

Baseline validado em PGlite descartável: paridade de nove seções e igualdade exata das definições de rotinas/views. Aplicado somente no projeto novo; 142 hashes de definição remotos conferem com origem após preservar quebras de linha na transmissão. Triggers gerenciados de Auth/Storage e event triggers não duplicados. Defaults de supabase_admin mantidos; defaults postgres e ACLs de tabela/coluna/rotina restaurados. Publicação existente supabase_realtime recebeu somente estoque e produtos.

Auth testes: Site URL https://tecnocell-cloud-testes.vercel.app, redirects específicos de callback/redefinição Cloud e tecnocelltestes://. Google desabilitado; nenhum email/SMS enviado na criação de contas. Senhas aleatórias ficam exclusivamente em arquivo local protegido fora do repositório.

Validação remota: três logins aprovados; catálogo anônimo só fictício; cada cliente lê só seu cadastro; nenhum perfil interno acessível aos clientes; alteração de status pelo cliente recusada; atualização permitida do cadastro pendente aprovada; pedido aprovado, idempotência e isolamento entre clientes; cliente pendente não cria pedido.

Dados e permissões seguem estrutura efetiva da origem. Encomendas, feriados e pix_aliases têm RLS desabilitado na origem; views são definer. Esta entrega não altera produção nem representa auditoria/correção global da segurança da loja. Só dados fictícios são permitidos neste alvo.
