# Recuperação web do Cliente

Implementação de 19/10/2026. Resultados de publicação e testes reais são registrados no diário de integração do Obsidian; este roteiro não comprova alterações do Supabase ou entrega de e-mail.

## Rotas

- `/cliente/recuperar-senha`: solicita e-mail de recuperação com destino explícito para a página do cliente.
- `/cliente/redefinir-senha`: valida um link de recuperação, pede nova senha e confirmação, salva e orienta o retorno ao aplicativo.
- `/login`: permanece sendo o login de funcionários.

## Separação de sessão

Cliente Supabase exclusivo, usando somente as variáveis públicas existentes. Sessão em memória, `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false` e storageKey próprio. Não utiliza o cliente SSR nem cookies do ERP. Após salvar a senha, encerra somente a sessão temporária com `scope: local`.

Links aceitos: fragmento do fluxo implicit com `type=recovery`, access token e refresh token, ou `token_hash` com `type=recovery`. Links PKCE iniciados no APK continuam sendo tratados pelo APK: esta página não possui o verificador privado gerado no celular. Links inválidos ou expirados oferecem uma nova solicitação web.

## Ativação após revisão e autorização

1. Publicar as páginas no Cloud.
2. Conferir no projeto oficial TECNOCELL.CLAUD a lista de destinos permitidos. Acrescentar a URL HTTPS exata `/cliente/redefinir-senha` no domínio publicado. Preservar a Site URL do ERP e os destinos nativos existentes.
3. Conferir o template de recuperação: respeitar o destino explícito do link; não substituir globalmente os destinos nativos/funcionários por esta página.
4. Solicitar um link pela página web com uma conta de teste controlada. O titular recebe o e-mail, abre o link, escolhe a senha e confirma o novo login no APK.
5. Com funcionário conectado em outra aba, confirmar que a recuperação não substitui sua sessão do Cloud. A recuperação de uma mesma identidade Auth pode ter efeitos próprios de revogação de sessão do Supabase; não usar a conta operacional como teste incidental.
6. Conferir tela em 390 px, campos após erro, olhos independentes, link expirado, falta de rede e nova tentativa.

## Menu

Conforme esclarecimento com imagem do titular, Aplicativo é uma seção recolhível do sidebar no mesmo nível de Estoque, Financeiro e Cadastros. Contém Autorizar clientes (`/painel/clientes-app`, permissão `clientes`) e Pedidos do App (`/painel/pedidos-app`, permissão `pdv`). Não fica dentro de Admin. A seção abre ao acessar uma das páginas e respeita permissões e badges existentes. A central adicional preparada no rascunho não faz parte desta entrega. Carrinhos ainda não enviados permanecem no aplicativo; a seção de pedidos gerencia somente pedidos enviados.

## Visual e regra de senha — 19/10/2026

Cabeçalho usa o símbolo original do aplicativo sobre branco e como marca-d'água no azul; textura clara pontilhada e detalhe laranja seguem a base visual aprovada. O nome digitado e textos de rodapé redundantes foram removidos.

O formulário usa o padrão do cadastro Android: pelo menos 8 caracteres, uma maiúscula, uma minúscula e um número. Não exige caractere especial. As quatro indicações aparecem abaixo de Nova senha, ficam verdes quando atendidas e participam da validação antes do envio. Isso é validação do formulário web; não altera a política do Supabase nem as outras telas.

Prévia Chrome em 390 px com Auth simulado: regras dinâmicas, olhos independentes, ausência de rolagem horizontal, recusa de senha fraca/confirmacão divergente e preservação dos campos conferidos. Captura: `evidencias/recuperacao-web-design-390.png` no diretório de integração.

## Verificação isolada

`node --test e2e/recuperacao-cliente.cjs`: valida separação das opções de sessão, links recovery, rejeição de links inválidos/expirados e regras de senha com Auth simulado. Não comprova entrega de e-mail ou alteração real de senha.
