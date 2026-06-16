# Relatório: Financeiro e Estoque — Estado Atual vs. Sistema Completo

Data: 2026-06-16 | Branch: `trabalho-noturno`

Este relatório compara o que está implementado nos módulos Financeiro e Estoque com o que um sistema de gestão comercial completo deveria oferecer, e prioriza o que implementar a seguir.

---

## Módulo Financeiro

### O que existe hoje

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Lançamentos manuais (A Receber / A Pagar) | ✅ Implementado | Criar, editar, excluir |
| Marcar lançamento como pago | ✅ Implementado | Muda `status='pago'` |
| Filtro por tipo (receber/pagar) | ✅ Implementado | Via query param |
| Busca por texto | ✅ Implementado | `ilike` em descrição e pessoa_nome |
| Criação automática ao finalizar venda no PDV | ✅ Implementado | `finalizarVenda` cria lancamento do tipo 'receber' |
| Resumo no dashboard | ⚠️ Parcial | Calcula apenas sobre os 5 últimos lançamentos |
| Listagem limitada a 200 registros | ⚠️ Limitado | Sem paginação |
| Filtro por período de data | ❌ Ausente | |
| Filtro por status (pendente/pago/vencido) | ❌ Ausente | |
| Vencidos (alertas de atraso) | ❌ Ausente | |
| Lançamentos recorrentes | ❌ Ausente | |
| Categorias de lançamento (receita/despesa por tipo) | ❌ Ausente | |
| Fluxo de caixa (projeção futura) | ❌ Ausente | |
| Relatório DRE simplificado | ❌ Ausente | |
| Conciliação bancária | ❌ Ausente | |
| Múltiplas contas bancárias/caixas | ❌ Ausente | |
| Exportação para planilha | ❌ Ausente | |
| Vinculação com compras (notas de entrada) | ❌ Ausente | Compra não gera lancamento automaticamente |
| Vinculação com pedidos aprovados | ❌ Ausente | Aprovação de pedido não gera lancamento |

### O que falta (por prioridade)

#### Alta prioridade — impacto imediato no dia-a-dia

1. **Filtro por data de vencimento / período**
   - Hoje não há como ver "o que vence esta semana" ou "o que ficou para trás"
   - Implementação: dois campos de data no form de filtro, query com `.gte('data_vencimento', inicio).lte('data_vencimento', fim)`

2. **Alertas de vencido**
   - Qualquer lançamento com `data_vencimento < hoje` e `status != 'pago'` está vencido
   - Implementação: coluna de status calculado na listagem (`vencido` quando `data_vencimento < hoje`)
   - Destaque visual em vermelho para vencidos

3. **Filtro por status de pagamento**
   - "Mostrar apenas pendentes", "Mostrar apenas pagos", "Mostrar apenas vencidos"
   - Implementação: select de status com opções pendente/pago/vencido

4. **Correção do dashboard**
   - Cards "A Receber" e "A Pagar" devem usar queries separadas, sem `limit(5)`
   - Implementação: queries adicionais no `DashboardPage` para somar todos os pendentes

#### Média prioridade — melhoria importante

5. **Paginação da listagem**
   - 200 registros sem scroll/paginação é limitante para operação longa
   - Implementação: paginação por offset (`rangeFrom/rangeTo` do Supabase) ou paginação cursor-based

6. **Criação automática de lançamento ao receber compra**
   - Quando uma nota de entrada é marcada como "recebida", deveria criar um lançamento do tipo 'pagar'
   - Implementação: na action de receber nota, inserir lancamento com valor da nota e fornecedor

7. **Categorias de lançamento**
   - "Vendas", "Compras de mercadoria", "Aluguel", "Folha de pagamento", "Impostos"
   - Permite relatórios por categoria (DRE simplificado)
   - Implementação: coluna `categoria` em lancamentos + filtro + agrupamento

#### Baixa prioridade — funcionalidade avançada

8. **Lançamentos recorrentes**
   - Despesas fixas mensais (aluguel, internet, salários)
   - Implementação: campo `recorrente` + `periodicidade` + job para criar automaticamente

9. **Fluxo de caixa projetado**
   - Gráfico mostrando entradas e saídas previstas pelos próximos 30/60/90 dias
   - Requer filtro por data e bom volume de dados históricos

10. **Exportação CSV/Excel**
    - Implementação: route handler que busca dados e retorna como CSV

---

## Módulo Estoque

### O que existe hoje

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Visualização por produto/depósito | ✅ Implementado | Tabela com quantidade por produto e depósito |
| Filtro por depósito | ✅ Implementado | Select de depósito |
| Busca por produto | ✅ Implementado | `ilike` em nome |
| Cards: Em estoque / Baixo / Zerado | ✅ Implementado | Limites: >3 / 1-3 / 0 |
| Movimentação manual (entrada/saída/ajuste) | ✅ Implementado | `registrarMovimento` com upsert |
| Baixa automática ao finalizar venda no PDV | ✅ Implementado | `finalizarVenda` debita estoque |
| Múltiplos depósitos | ✅ Implementado | Tabela `estoque` é (produto_id, deposito_id) |
| Histórico de movimentações | ❌ Ausente | Não existe tabela ou log de movimentos |
| Estoque mínimo / ponto de reorder | ❌ Ausente | |
| Alerta automático de estoque baixo | ❌ Ausente | Só card no dashboard, sem alerta configurável |
| Transferência entre depósitos | ❌ Ausente | |
| Entrada automática ao receber nota de compra | ❌ Ausente | Nota recebida não atualiza estoque |
| Custo médio ponderado | ❌ Ausente | Não rastreado por movimentação |
| Relatório de giro de estoque | ❌ Ausente | |
| Inventário / contagem física | ❌ Ausente | |
| Código de barras / SKU scanning | ❌ Ausente | Existe campo `codigo` mas sem leitor integrado |
| Reserva de estoque para pedidos em aberto | ❌ Ausente | |

### O que falta (por prioridade)

#### Alta prioridade

1. **Histórico de movimentações**
   - Sem log, é impossível rastrear por que o estoque de um produto mudou
   - Implementação: tabela `movimentacoes_estoque` com `produto_id, deposito_id, tipo, quantidade, motivo, created_at, referencia_id`
   - A cada movimentação manual ou por venda, inserir um registro
   - Página `/estoque/historico` ou aba na página de ajuste

2. **Entrada automática ao receber nota de compra**
   - Quando uma nota de entrada muda status para 'recebida', os produtos devem dar entrada no estoque
   - Implementação: na action de receber nota, buscar `itens_nota` e fazer upsert no estoque com entrada

3. **Estoque mínimo por produto**
   - Campo `estoque_minimo` na tabela `produtos`
   - Card/listagem de produtos abaixo do mínimo
   - Implementação: campo no cadastro de produtos + filtro no módulo de estoque

#### Média prioridade

4. **Transferência entre depósitos**
   - Mover mercadoria do depósito principal para o PDV
   - Implementação: formulário de transferência que gera duas movimentações (saída do origem, entrada no destino)

5. **Reserva de estoque para pedidos**
   - Quando pedido é aprovado, reservar itens para evitar venda dupla no PDV
   - Implementação: coluna `reservado` em estoque, subtrair do disponível no PDV

6. **Alerta configurável de reorder**
   - "Me avise quando X produto cair abaixo de Y unidades"
   - Implementação: campo `estoque_minimo` (ver item 3) + banner de alerta no dashboard

#### Baixa prioridade

7. **Custo médio ponderado**
   - Rastrear o custo real de cada unidade em estoque
   - Necessário para DRE e análise de margem precisa
   - Implementação complexa — requer recálculo a cada entrada

8. **Relatório de giro de estoque**
   - Quais produtos vendem mais, quais ficam parados
   - Requer histórico de movimentações (item 1)

---

## Plano de Implementação Sugerido (Roadmap)

### Sprint 1 — Corrigir o que está errado (1-2 dias)
Bugs encontrados na auditoria — sem novas features, só correções:

1. **Dashboard A Receber/A Pagar** — query separada sem limit (30 min)
2. **Produtos — imagem_url no select** — add campo ao select (5 min)
3. **PDV — N+1 no estoque** — upsert em lote (1 hora)

### Sprint 2 — Financeiro básico completo (2-3 dias)
Tornar o módulo financeiro útil no dia-a-dia:

4. Filtro de data de vencimento no Financeiro
5. Destaque visual de lançamentos vencidos
6. Filtro de status (pendente/pago/vencido)
7. Corrigir dashboard para buscar todos os pendentes

### Sprint 3 — Estoque com rastreabilidade (2-3 dias)
Tornar o estoque confiável:

8. Tabela `movimentacoes_estoque` + log em todas as operações
9. Campo `estoque_minimo` nos produtos
10. Entrada automática ao receber nota de compra

### Sprint 4 — Integração PDV avançado (3-4 dias)
Completar o ciclo de venda:

11. Vales de crédito como forma de pagamento no PDV
12. Tabelas de preço aplicadas ao selecionar cliente no PDV
13. Aprovação de pedido → criação automática de venda + lançamento

### Sprint 5 — Relatórios e exportação (2-3 dias)
Visibilidade gerencial:

14. Paginação na listagem de financeiro e produtos
15. Exportação CSV do financeiro
16. Relatório de giro de estoque (requer sprint 3)

---

## Estimativa de Esforço Total

| Sprint | Esforço | Impacto |
|--------|---------|---------|
| Sprint 1 (bugs) | ~2h | Alto — corrige dados incorretos |
| Sprint 2 (financeiro) | ~2 dias | Alto — módulo principal mais útil |
| Sprint 3 (estoque) | ~2 dias | Alto — rastreabilidade |
| Sprint 4 (PDV avançado) | ~3 dias | Médio — funcionalidades premium |
| Sprint 5 (relatórios) | ~2 dias | Médio — visibilidade |

**Total estimado:** ~10 dias de desenvolvimento para sistema financeiro/estoque completo.
