# Conciliação Pix — diagnóstico e correção local (20/10/2026)

## Implantação retomada — banco confirmado em produção

Acesso voltou no Chrome TECNOCELL. Base remota de registrar_devolucao conferiu com MD5 105c08d1e80ecae93fd321b936c429d1; assinatura e proprietário postgres conferidos. Versão/colunas estavam ausentes. SHA-256 local correspondeu ao autorizado.

Migration 20261020123000 aplicada pelo SQL Editor do projeto rbjwbfekkhebaschiqda, com verificação adicional do hash dentro da transação. Histórico registrado na mesma transação com fonte SQL completa. Pós-verificação: quatro colunas, uma versão, RPC e helper com hashes esperados, helper privado. Nenhum db push.

Hashes da venda #8414, devolução e dois lançamentos permaneceram idênticos antes/depois, excluindo somente novas colunas NULL. Sem backfill, nova venda ou alteração financeira histórica. Provas locais: conciliacao-banco-aplicado-20261020.png e conciliacao-historico-antes/depois-20261020.txt.

Código será publicado somente após esta confirmação do banco. Conferência de Operação/X/Z em leitura segue após deploy Ready.


## Implantação autorizada — bloqueio de acesso na retomada

Titular autorizou banco primeiro, depois commit/push/deploy e conferência somente em leitura da #8414. SHA-256 local reconferido e corresponde exatamente ao autorizado: AAE4B4D1E7F27B9C3A98215B2EB5EB8E5104AE3EF4AEC1FD856C91CA3D2B4EE6.

CUA falhou na inicialização com `failed to write kernel assets ... os error 3`, inclusive após reset. A inicialização documentada de `@oai/sky` via node_repl teve a mesma falha. A CLI Supabase 2.121.0 retornou `AccessTokenRequiredError`; nenhuma sessão CLI ou conexão de banco está configurada neste checkout. Nenhum conector Supabase recusado foi usado.

A definição remota atual NÃO pôde ser lida. Por isso, nenhuma migration, reparo de histórico, commit/push ou deploy desta correção foi executado, preservando banco primeiro. A #8414 não foi alterada nem foi criada venda. Produção e alerta atual não foram revalidados nesta tentativa.

Consulta de compatibilidade pronta em `docs/preflight-conciliacao-pix-20261020.sql`. MD5 normalizado do corpo base local de registrar_devolucao: `105c08d1e80ecae93fd321b936c429d1`. Ao restabelecer o navegador TECNOCELL, consultar assinatura/corpo/proprietário/permissões e comparar; não aplicar cegamente se a definição divergir. A autorização existente continua válida; falta acesso, não nova confirmação.


Escopo autorizado: investigar/corrigir localmente e executar testes, TypeScript e build. Sem nova venda, aplicação de migration, deploy ou alteração remota nesta rodada. Nenhuma automação criada, conforme orientação mais recente.

## Diagnóstico comprovado no código

1. **Entrada:** `finalizar_pedido_app_pdv` delega ao finalizador normal. O lançamento automático sem conta é intencional: `lib/saldos-contas.ts` soma `pagamentos_venda`, usando `forma_conta_loja` e depois `formas_pagamento.conta_destino_id`. Preencher também o receber automático duplicaria o saldo. `lojas.conta_padrao_id` não é a regra desse cálculo; não usar por suposição.
2. **Devolução:** o caminho simples Pix da RPC não recebia conta; somente o caminho dividido gravava `p_reembolsos[].conta_id`. O fallback de saldos antigos descontava da primeira conta do tipo, sem loja. A devolução também não persistia o caixa/split real, então o fechamento não tinha a saída Pix associada ao turno.
3. **Caixa/alerta:** Operação somava pagamentos originais; tratava abate de fiado e devolução em dinheiro, mas não reembolso Pix. A venda fica historicamente concluída após devolução, por isso o filtro de vendas concluídas não removia o alerta. Cancelamento e devolução não são equivalentes no status da venda.

## Correção preparada

- Migration LOCAL `supabase/migrations/20261020123000_conciliacao_pix_devolucoes.sql`: preserva o corpo do RPC normal de devolução e acrescenta resolução Pix por forma/loja (ou conta explícita do F9), vínculo do lançamento à devolução e registro atômico de caixa, abate e split do reembolso. Sem novo lançamento ou estorno de estoque adicional. Helper privado, sem novo EXECUTE público.
- Não altera o finalizador App ou preenche a conta do receber automático. Conta explicitamente escolhida no reembolso dividido permanece; configuração ausente conserva NULL. Contas inativas ou destinos ambíguos impedem a transação inteira; não escolhe conta por nome.
- `lib/saldos-contas.ts`: reembolso legado usa a mesma rota da loja quando há destino único; sem informação suficiente não desconta de uma conta arbitrária. Reembolso já com conta continua descontando uma vez.
- `lib/devolucoes-caixa.ts`: leitura compartilhada por caixa aberto e Z, limitada à loja/período/caixa do reembolso. Guarda os valores originais da venda e abate somente a fatia Pix efetivamente reembolsada. Pix de venda antiga pode gerar saldo Pix negativo no turno da saída; gaveta permanece intacta. Leitura com erro interrompe a apresentação em vez de esconder estorno.
- `app/painel/pdv/operacao/page.tsx` e `OperacaoClient.tsx`: entrada original preservada, saída Estorno PIX e líquido calculados para operação, X e Z. Aviso explícito de legado sem split quando não é seguro inferir Pix. Legado simples pago, sem fiado/vale, pode ser reconhecido em leitura (inclui o caso #8414), sem modificar registros históricos.
- `lib/pix-pendentes.ts`: filtra canceladas/integralmente devolvidas ANTES de casar comprovantes. Integral é comprovada por quantidades de cada produto, acumulando devoluções concluídas; parcial mantém exigência do comprovante original.

## Validação

- Regressão de saldo reproduzida antes da correção: reembolso de loja B descontava R$ 135,00 da conta A. Passou após usar rota da loja.
- Suíte completa: **267/267 aprovados**, zero falhas/cancelados/ignorados. Inclui componente real do PDV, actions, SQL real no PGlite, página real do caixa com fronteiras de dados simuladas, saldo entre unidades, F9, rollback, parcial/integral, turno distinto e leitura financeira com erro.
- TypeScript final: saída 0. `npm run build` final: saída 0 (compilação, tipos e geração de páginas concluídas).
- PGlite não comprova concorrência entre conexões reais. Nenhuma nova homologação financeira em produção, extrato bancário ou impressão física nesta rodada.

## Implantação futura

Aplicar somente após revisão da definição instalada de `registrar_devolucao` contra a base da migration (origem: `2026-09-19_lancamento-devolucao-perda-loja.sql`); preservar mudanças remotas posteriores se houver. Aplicar incremental ANTES do deploy, pois a leitura depende das novas colunas. Não executar db push geral. Sem backfill automático dos lançamentos da venda #8414. Validar o estado histórico em leitura após liberação; não criar outra venda por padrão.

SHA-256 da incremental local: `AAE4B4D1E7F27B9C3A98215B2EB5EB8E5104AE3EF4AEC1FD856C91CA3D2B4EE6`. Logs desta rodada: `testes-conciliacao-pix-20261020.log`, `typescript-conciliacao-pix-20261020.log`, `build-conciliacao-pix-20261020.log`.
