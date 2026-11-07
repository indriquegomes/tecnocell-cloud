# Cadastros do aplicativo no Cloud — 05/10/2026

## Impacto e escopo

Implementação sobre main atual (base inicial `560a9aa`, atualizada para `ea04011`), em checkout isolado. Acrescenta Cadastros → Aplicativo e uma seção Aplicativo na ficha existente de Pessoas. Mantém o formulário, compras, crédito, estilo, menu e cálculos existentes. Não inclui alterações de PDV, pedido, pagamento ou estoque dos backups anteriores.

A prévia HTML aprovada é uma referência de fluxo, não um layout a substituir o Cloud. A versão real usa componentes e classes do projeto.

## Autorização

Menu, rota, leitura da ficha, busca, comprovação e alterações de status exigem a permissão existente `clientes`. A verificação da action ocorre antes de criar o cliente de serviço. Não é criada permissão de funcionário nem concedido acesso administrativo ao cliente.

As ações usam os estados reais pendente/aprovado/bloqueado. O controle independente “Solicitar pedidos” da demonstração não foi implementado porque não existe regra correspondente no servidor. Aprovação exige pessoa ativa, sem bloqueio `nao_vender`, e não aceita trocar uma conta já vinculada para outra pessoa. O cadastro de Pessoas não é sobrescrito.

## Pré-requisito de publicação

Revisar `supabase/migrations/2026-10-05-vinculo-unico-conta-app.sql` e conferir previamente possíveis duplicatas de `pessoa_id`. O índice único impede dois operadores de vincular a mesma pessoa a contas diferentes simultaneamente. Se já houver duplicatas, a criação do índice falha, sem apagar/mesclar dados.

Essa migration foi apenas preparada. Não foi aplicada no banco real. Não liberar a aprovação em produção sem confirmar o índice no ambiente real. Publicação e teste com operador autenticado ainda dependem desse pré-requisito e da configuração legítima do ambiente.

Proteção de lançamento: todas as alterações de status/vínculo ficam bloqueadas por padrão no servidor. Após confirmar o índice e a validação autenticada, habilitar `CADASTROS_APP_GERENCIAMENTO_ENABLED=true` no ambiente autorizado. Não altera as variáveis existentes do SaaS; a leitura da área funciona sem essa flag. Não habilitado nesta sessão.

## Validação

Verificação isolada: `node --test e2e/clientes-app-guards.cjs`. Usa o código real das actions com backend simulado, sem consultar/gravar banco. Cobre autorização, conta inválida, falta de vínculo, pessoa inativa/bloqueada, duplicidade, vínculo existente, erros e gravação restrita a status/vínculo.

Resultado nesta máquina: 14 cenários aprovados; TypeScript aprovado; build de produção aprovado com configuração fictícia/local, sem credenciais de produção. O build emitiu avisos de conexão das integrações existentes porque não havia backend local, mas terminou com exit 0. Chromium verificou o componente real no PainelShell existente: lista, análise, bloqueio de aprovação sem vínculo, filtros, vazio, falha de busca com texto preservado, link da ficha e ausência de overflow em 390 px. Fixture temporária removida antes do commit.

Roteiro autenticado, após publicação autorizada:

1. Funcionário sem `clientes`: menu oculto e actions recusadas, sem gravação.
2. Funcionário autorizado: fila/lista, busca, filtros, vazio, conta ausente e análise legíveis em desktop/390 px.
3. Pessoa inativa, bloqueada ou já vinculada: aprovação recusada.
4. Pessoa correta: vincular e aprovar; ficha mostra a conta e app mostra situação atualizada. Não enviar pedido automaticamente.
5. Bloquear/voltar para análise: preservar vínculo e histórico; ficha atualiza.
6. Duas aprovações concorrentes para a mesma pessoa: somente uma conta vinculada, conferida no banco após índice aplicado.
7. Falha de rede: seleção e busca preservadas para nova tentativa.
8. Comprovação com link temporário: permitida somente a funcionário autorizado, sem expor caminhos arbitrários.

Os testes isolados não comprovam permissões efetivas da conta do titular, schema instalado ou funcionamento autenticado em produção.
