# Auditoria TecnoCell — 6 de setembro de 2026

Escopo: revisão de código no commit `ae7450b`, consultas de metadados do banco de produção e teste de leitura anônima da API. Nenhuma alteração no banco ou publicação. Esta revisão não certifica todo o SaaS: navegação autenticada não foi concluída porque a conexão com a aba expirou; subagentes falharam por limite de uso.

## Achados prioritários

### Crítico — histórico de reclassificação exposto em produção

`public.reclassificacoes_forma` tem RLS desabilitado. O catálogo do Postgres confirma privilégios SELECT, INSERT, UPDATE e DELETE para `anon` e `authenticated`. GET anônimo da API REST, usando somente a chave pública, respondeu HTTP 200 com uma linha (consulta restrita a `id`, limite 1). Não foram testadas escritas.

Correção proposta: habilitar RLS e restringir concessões/políticas conforme os consumidores autorizados; preservar RPCs e ações gerenciais. Confirmar depois que leitura anônima não retorna registros. O fato de outras tabelas terem RLS habilitado não comprova que suas políticas estejam corretas.

### Crítico — item novo recebe desconto integral na branch ainda não publicada

`app/painel/pdv/PDVClient.tsx:774` inicializa `desconto_tipo='final'` e `desconto_valor=0`. O helper em `lib/pdv-calculos.ts` interpreta esse zero como preço final explícito. Reprodução executada: `aplicarDescontoItem(100, 'final', 0)` retorna desconto 100 e preço final 0. Afeta todos os itens novos e itens recarregados com esse estado inicial.

Correção proposta: distinguir ausência de edição de preço zero explícito; testar o estado inicial real do carrinho. O build e os nove testes anteriores passaram, mas não cobriam essa integração. O commit não deve ser publicado assim.

### Alto — devolução parcial distribui desconto por peça incorretamente

`app/painel/devolucoes/DevolucoesClient.tsx:272` calcula rateio pelo preço bruto. A nova RPC preserva preço bruto e desconto unitário individual. Exemplo: dois itens de R$100, primeiro vendido por R$50 e segundo por R$100. Total R$150: o rateio atual atribui R$75 a cada devolução, em vez de R$50/R$100.

Correção proposta: usar o valor líquido de cada item (`total_item / quantidade`) como base, rateando apenas desconto geral remanescente. Verificar também validação do servidor. Achado de fluxo de código; nenhuma devolução real foi criada.

### Alto — F9 parcial não impede repetição da mesma operação

`supabase/migrations/2026-09-06_pdv_desconto_item_recebimento_lote.sql` trava as linhas, mas não identifica a operação por chave idempotente. Dívida de R$100 com duas chamadas iguais de R$20 permanece pendente após a primeira: a segunda pode cobrar outros R$20. A trava impede sobrepagamento, mas não duplicação quando ainda há saldo. Além disso, sem caixa aberto, a função atualiza dívidas e simplesmente não cria movimento de caixa.

Correção proposta: chave de operação única e regra explícita para ausência de caixa. Testar concorrência e repetição após falha de rede em ambiente isolado antes de publicar.

### Médio — chat fornece totais financeiros incompletos

`app/api/chat/route.ts` limita lançamentos a 100, soma `valor` sem descontar `valor_pago` e apresenta quantidade da amostra de 50 produtos como total. O contexto pode levar a IA a apresentar saldo incorreto mesmo obedecendo aos dados fornecidos.

Correção proposta: agregação do saldo líquido e contagens no banco, com escopo de loja apropriado; identificar amostras como amostras.

### Médio — proteção de custo da IA limitada por instância

`app/api/chat/route.ts` usa Map em memória, por IP, com reinício em cold start. Não valida tamanho/quantidade de mensagens nem aplica orçamento persistente nessa rota. Isso não comprova abuso ocorrido, mas limita a proteção oferecida em múltiplas instâncias.

Correção proposta: validar entradas e aplicar limite persistente de uso/custo adequado ao chat público.

## Interface — revisão com emil-design-eng

| Antes | Depois proposto | Motivo |
| --- | --- | --- |
| Campo de preço vazio equivale a zero | Vazio preserva preço; edição explícita altera | Padrão previsível no balcão |
| Select/input de desconto sem nome acessível no trecho novo | Rótulos associados ao produto | Uso por teclado e leitor de tela |
| Total do F9 pode divergir do digitado após limitar ao saldo | Mostrar claramente total efetivamente distribuído | Evitar dúvida antes do recebimento |

O CSS já contém tratamento de movimento reduzido. Não foi sugerida animação para atalhos frequentes do PDV.

## Verificações e limites

- Build e nove testes passaram na etapa anterior deste mesmo commit; isso não substitui testes de integração financeira.
- Proxy remove headers de identidade enviados pelo cliente e valida sessão com Supabase no fluxo inspecionado.
- A rota de clientes do PDV delega autenticação ao carregador; não foi feita certificação de todas as ações e permissões.
- Busca restrita a padrões comuns de tokens/chaves privadas em app, lib, scripts-sinc e .github não encontrou correspondências. Não é uma varredura completa de segredos no histórico.
- Não foram encontrados `.env`/`.env.local` versionados na busca realizada. Isso não comprova ausência de outros arquivos contendo credenciais.
- Não foram realizados CRUD, testes de escrita anônima, disparos de IA pagos ou alterações em dados de clientes.

Prioridade: fechar exposição do banco; corrigir e testar branch do PDV antes de publicar; depois ampliar smoke autenticado, permissões por cargo/loja e testes de devolução/caixa.
