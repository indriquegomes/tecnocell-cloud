# Execução —48h após quitação e OS manual

Base b450904; branch codex/halloween-quitacao-os-20261023; alterações originais do checkout preservadas. Skill executing-plans aplicada; revisão independente única ao final.

Ruling: worktree Git local dentro do diretório administrativo do checkout seguro — ferramenta nativa aponta para o contexto E: anteriormente indisponível, sem opção de selecionar este repositório D:; não acessar E:. Nenhuma alteração da branch/index original.

Ruling: evidência temporal insuficiente fica pendente para conferência autorizada, nunca usa updated_at ou meia-noite. O histórico de crédito tem formato local sem offset e será interpretado explicitamente em America/Sao_Paulo.

Ruling: recebimentos selecionados só comprovam uma origem por campanha; reemissões herdam a mesma prova. Para OS, origem da loja é depósito da OS e recebimentos devem corresponder; ausência de vínculo de loja exige regularização pelo fluxo existente.

Ruling: instalação de colunas novas é nullable para tickets legados, sem apagar testes nem mudar validade antiga. Funções novas privadas com wrappers administrativos invoker e require_staff.

Pendências: estoque/logística dos brindes continuam fora desta implementação. Nenhuma ativação automática ou publicação sem aviso.

## Verificações de 23/10

- PGlite: regressões de cupons e financeiro; quitação tardia; prazo imutável; OS manual; recebimentos divididos, insuficientes e reutilizados; OS fora do período; dia divergente e horário futuro; cancelamento; autorização; devolução única de reserva finita; recebimento lançado tardiamente.
- PostgreSQL17.11 real, banco local halloween_test em127.0.0.1:55439: mesma suíte e duas conexões simultâneas. Automático/manual resulta em um original; giro duplo retorna mesmo vale; resgate/reemissão tem um vencedor; disputa gera55P03 em3s; SET LOCAL externo limita a instrução em10s.
- TypeScript completo: next typegen seguido de tsc --noEmit --pretty false --incremental false, concluído sem erros.
- Módulo público: node e2e/halloween-public-flow.cjs, passou.
- Formulário administrativo: node e2e/halloween-payment-review.cjs, passou; isto verifica comportamento, sem substituir homologação visual.

Ruling: Docker Desktop falhou por ausência da chave SOFTWARE\Docker Inc.\Docker Desktop. Usado ZIP oficial EDB PostgreSQL17.11 (https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616), extraído dentro de .git/halloween-local-pg e executado apenas em loopback, sem instalar serviço nem modificar o Docker/Registro. Dados locais fictícios nunca enviados à empresa.

Ruling: timeout de10s definido somente nos wrappers RPC halloween_*; PostgREST documenta hoisting de statement_timeout (https://postgrest.org/en/stable/references/transactions.html). O teste SQL local prova o limite configurado antes da instrução; a adoção dessa configuração pelo PostgREST real continua pendente de validação, sem alegação de prova de produção.

Consulta visual autenticada no domínio definitivo confirmou campanha pausada, zero giros reais e quantidades dos dois brindes emzero. A versão nova ainda não foi aplicada/publicada. A primeira leitura do navegador funcionou, mas digitar a consulta seguinte no SQL Editor voltou a atingir timeout; nenhuma consulta foi executada por essa tentativa.

## Revisão independente final e correções

Revisor independente gpt-6-astra examinou a branch inteira e apontou três problemas importantes, sem críticos. Os três foram reproduzidos antes de corrigir:

- Final: fixed cancelamento financeiro concorrente ao resgate — teste real com duas conexões falhou permitindo resgate; locks compartilhados curtos na origem, pagamentos e recebimentos agora esperam a alteração e recusam o benefício. Teste RED→GREEN.
- Final: fixed alteração posterior da cronologia — mudança de data do recebimento e criação da OS deixavam prova válida. Agora a prova compara snapshot financeiro e horário original, sem renovar vencimento e sem invalidar vale apenas por campanha pausada ou prazo de giro decorrido. Teste RED→GREEN.
- Final: fixed resposta assíncrona de outra campanha — teste de operação manual/desativação do seletor falhou. Agora o formulário compartilha ocupação com o pai e refresh descarta resposta de campanha antiga. Teste com RPC adiada RED→GREEN.

Final: Ruling: hoisting de timeout no PostgREST real exige chamada pelo gateway da empresa; teste SQL local é evidência distinta. Manter como critério pendente, sem mudar configurações globais. Custo se ignorado: consultas podem ultrapassar10s.
Final: Ruling: aceite de celular/computador nas duas lojas e logística/estoque dependem da operação; não afirmar aceite humano com testes automatizados. Custo se ignorado: lançar campanha sem produto/logística confirmados.
Final: Ruling: rotinas antigas do ERP continuam fora da alteração. Gatilhos reais consultados: definir_loja_lancamento, limpar_obs_cobranca, atualizar_pagamento_pedido_app, reconferir_reversao_pedido_app e atualizar_cancelamento_venda_pedido_app. A promoção limita contenção, mas não afirma impossibilidade de deadlock. Custo: disputas exigem repetir a operação.

Nenhum achado menor adiado pelo revisor. Cobertura percentual e lint: N/A, sem ferramentas configuradas para estes componentes; os testes de comportamento/regressão foram executados, sem inventar métricas.

## Homologação no banco real com reversão

Navegador recuperado por uma nova aba. Consulta somente leitura: PostgreSQL17.6, campanha real active=false, stock_confirmed=false, tickets=0; migração ausente; lista de gatilhos financeiros compatível com a inspeção estática.

Arquivo completo da migração seguido de regressões APENAS da promoção foi executado com ROLLBACK no banco real. Resultado: PASS migration real + promotion-only regression; transaction rolled back. Não foram criadas vendas, pagamentos, recebimentos ou OS fictícias na empresa. Selecionada internamente sessão de funcionário já autorizado, sem persistir identidade nem alterar permissões.

A colagem inicial pelo fill do editor Monaco concatenou a consulta anterior e falhou em sintaxe antes de executar DDL. Conteúdo foi substituído por colagem normal e conferido por copiar/colar (igualdade integral de40447 caracteres com normalização CRLF). UTF-8 preservado. Só o arquivo integral conferido foi executado com sucesso.
