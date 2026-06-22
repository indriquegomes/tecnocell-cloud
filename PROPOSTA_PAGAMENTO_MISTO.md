# Proposta: Pagamento Misto (Split de Pagamento) no PDV

> **Status:** Aguardando aprovação do grupo
> **Data:** 2026-06-22
> **Tipo:** Alteração de grau alto (estrutural — mexe no banco de dados e em 4 telas)

---

## 1. O que o cliente pediu

Permitir que uma única venda seja paga com **mais de uma forma ao mesmo tempo**. Exemplo:

- Venda de **R$ 300,00**
  - R$ 100,00 em **Dinheiro**
  - R$ 150,00 em **Cartão de Crédito**
  - R$ 50,00 em **Crédito Loja (Fiado)** → fica devendo

---

## 2. Por que não funciona hoje

A tabela `vendas` guarda **uma única** forma de pagamento:

```
vendas: [ id, total, forma_pagamento_id (UMA só), pessoa_id, status, ... ]
```

Não existe nenhuma tabela que registre pagamentos divididos. O fiado também não é
tratado: hoje **toda** venda é lançada como `status: pago` na hora, mesmo a fiado
(ver `app/painel/pdv/actions.ts:92`).

---

## 3. O que precisa mudar

### 3.1. Banco de dados — nova tabela

```sql
create table pagamentos_venda (
  id                 uuid primary key default uuid_generate_v4(),
  venda_id           uuid references vendas(id) on delete cascade,
  forma_pagamento_id text references formas_pagamento(id),
  valor              numeric(12,2) not null,
  taxa               numeric(12,2) default 0,   -- só cartão
  maquina            text,                       -- 'ton' | 'pagbank' (só cartão)
  parcelas           int default 1,              -- só cartão crédito
  status             text default 'pago',        -- 'pago' | 'pendente' (fiado)
  created_at         timestamptz default now()
);
```

A coluna `vendas.forma_pagamento_id` continua existindo (compatibilidade), preenchida
com a forma principal ou um valor `MISTO`.

### 3.2. PDV (`app/painel/pdv/PDVClient.tsx`)

Trocar o select único de forma de pagamento por uma **área de pagamentos**:

```
┌─ Pagamentos ───────────────────────────────┐
│ [Dinheiro          ▾] [R$ 100,00]      [x]  │
│ [Cartão de Crédito ▾] [R$ 150,00]      [x]  │
│   └ TON · 3x · taxa +R$ 15,57               │
│ [Crédito Loja(Fiado)▾][R$  50,00]      [x]  │
│                                  [+ adicionar]│
├─────────────────────────────────────────────┤
│ Total venda:        R$ 300,00               │
│ Somado:             R$ 300,00 (+R$15,57 taxa)│
│ Faltam / Troco:     R$ 0,00                 │
└─────────────────────────────────────────────┘
```

Regras:
- Soma das partes **pagas + fiado** deve fechar com o total
- Se houver parte "Crédito Loja (Fiado)" → **exige cliente** selecionado
- Taxa de cartão aplicada **só sobre o valor daquela parte**
- Dinheiro pode exceder (gera troco)

### 3.3. `finalizarVenda` (`app/painel/pdv/actions.ts`)

- Receber um **array de pagamentos** em vez de um `forma_pagamento_id` único
- Gravar uma linha em `pagamentos_venda` por forma
- Para cada parte **paga** → lançamento `pago` (entra no caixa)
- Para a parte **fiado** → lançamento `pendente` + nome do cliente + vencimento
  (cai em **Financeiro → A Receber**)

### 3.4. Telas que leem `forma_pagamento_id` (precisam adaptar)

- `app/painel/pdv/operacao/page.tsx` — resumo do caixa por forma
- `app/painel/relatorios/page.tsx` — relatório de vendas

---

## 4. Tamanho e risco

| Item | Tamanho | Risco |
|---|---|---|
| Nova tabela `pagamentos_venda` | Estrutural | Baixo (tabela nova, não mexe nas existentes) |
| Reescrever UI de pagamento do PDV | Grande | Médio (é a tela mais usada) |
| Reescrever `finalizarVenda` | Médio | Médio (lógica financeira) |
| Adaptar relatórios/operação | Médio | Baixo |

**Backup já existe:** git tag `backup-pre-alteracoes-2026-06-22` + pasta `_backups/2026-06-22/`.

---

## 5. Decisões que o grupo precisa tomar

1. **Pagamento parcial do fiado depois:** o cliente pode pagar a dívida em partes
   (hoje o botão "Pago" é tudo-ou-nada)? Se sim, é trabalho extra.
2. **Troco em dinheiro:** registrar o troco em algum lugar ou só exibir na tela?
3. **Nome da forma na venda:** quando for misto, gravar `MISTO` ou a forma de maior valor?
4. **Limite de formas por venda:** alguma trava (ex.: máx. 3 formas)?

---

## 6. Já entregue (não depende desta proposta)

- ✅ Calculadora de taxa de cartão (TON/Pagbank, 1x–10x) — feita em 2026-06-22
- ⏳ Limpeza da lista de formas de pagamento — em execução
