# Plano: Registrar Loja/Depósito na Venda (visão de sistema interligado)

> **Status:** Aguardando aprovação do grupo
> **Data:** 2026-06-22
> **Tipo:** Alteração estrutural (banco + várias telas) — grau alto
> **Origem:** Limitação detectada na Fase 2 do PDV (seletor de loja). O débito de
> estoque já sai do depósito certo, mas a venda **não registra de qual loja saiu**.

---

## 1. Por que isso importa

Hoje, ao vender, o estoque baixa do depósito correto (Fase 2 ✅). Mas como a venda
não guarda o depósito, é **impossível responder** perguntas básicas do dia a dia:

- Quanto a loja de **Petrópolis** vendeu hoje vs **Teresópolis**?
- Qual o **ticket médio** por loja?
- O **caixa** de cada loja bate?

O pedido do dono foi explícito: **"o sistema é todo interligado"** — então não basta
adicionar uma coluna; precisamos enxergar a cadeia inteira.

---

## 2. Mapa de interligação (como está HOJE)

```
  PRODUTO ──< ESTOQUE >── DEPÓSITO        (estoque por loja ✅)
                              │
                              │  ← elo que FALTA
                              ▼
  CLIENTE ──< VENDA >── ITENS_VENDA        (venda NÃO sabe a loja ❌)
                │
                ├─ gera ─> LANÇAMENTO       (solto: sem venda_id, sem loja ❌)
                │
                └─ (por data) ─> CAIXA      (caixa global, não por loja ❌)
```

**3 elos quebrados:** Venda↔Loja, Lançamento↔Venda/Loja, Caixa↔Loja.

---

## 3. Mudanças por camada

### Camada 1 — Banco de dados
- `alter table vendas add column deposito_id text references depositos(id)`
- (Decisão) `alter table caixas add column deposito_id ...` — se o caixa for por loja
- (Decisão) `alter table lancamentos add column venda_id ...` — para ligar receita à venda/loja
- **Corrigir o `schema.sql`** (ver risco abaixo)

### Camada 2 — PDV (gravação)
- `app/painel/pdv/actions.ts` → `finalizarVenda` grava `deposito_id` na venda
  (o valor já existe no client desde a Fase 2; é só passar adiante)

### Camada 3 — Operação do Caixa (`app/painel/pdv/operacao/page.tsx`)
- Mostrar vendas **agrupadas por loja**
- (Decisão) Se o caixa virar por loja: abrir/fechar caixa **por depósito**

### Camada 4 — Relatórios (`app/painel/relatorios/page.tsx`)
- Filtro e coluna de **loja** nas vendas
- Totais e ticket médio **por loja**

---

## 4. Decisões

### ✅ Já decididas (pelo dono, 2026-06-22)

- **Sublojas JÁ EXISTEM no banco:** a coluna `depositos.empresa` já agrupa os
  depósitos por loja (TECNOCELL PETRÓPOLIS, TECNOCELL TERESÓPOLIS, TECNOCELL MACAÉ).
  → Não criar estrutura nova; **aproveitar o campo `empresa`** como "Loja".
  Ver [[sublojas-multiloja]].
- **Caixa = POR LOJA + VISÃO GLOBAL.** Cada loja abre/fecha o seu caixa; existe
  uma tela consolidada somando todas as lojas. → `caixas` ganha vínculo de loja
  (`empresa_id` ou `deposito_id`); a Operação passa a ser por loja + um painel geral.

- **PDV — pré-seleção por login (híbrido).** O estoque da loja do usuário logado
  vem **pré-selecionado** (prioridade), mas ele **pode trocar** para outro estoque
  (não bloqueia entre lojas). Ver "Modelo de acesso" abaixo.

### Modelo de acesso (logins por loja) — decidido pelo dono

- 🔑 **Login PRINCIPAL (gerente/dono):** cria/gerencia os sub-logins; acessa todas as
  lojas e estoques; tem a visão global (caixa consolidado).
- 🏬 **Sub-login por loja** (ex.: Petrópolis, Teresópolis): vinculado a 1 loja
  (`empresa`). No PDV, o depósito da sua loja vem pré-selecionado; pode vender de
  outro estoque se precisar.
- Implicação técnica: usar Supabase Auth (já existe) + **nova tabela de perfis**
  (`user_id → empresa/loja + papel`) + tela do login principal para criar sub-logins
  (Admin API com service role). Permissões via RLS ou regra de app.
- Tamanho: **grande** (camada de auth/autorização multiloja). Candidato a fase própria.

### ⏳ Ainda pendentes

1. **Lançamento financeiro ligado à venda?**
   Hoje o lançamento da venda é solto. Ligar (`venda_id`) permite rastrear receita
   por loja e por venda — mas mexe na lógica financeira.
3. **Vendas antigas (19 já registradas):** ficam com loja "não informada" ou
   atribuímos uma loja padrão retroativa?
4. **"Loja Principal" / "ESTOQUE GERAL"** (depósitos sem empresa real): são lojas
   válidas ou lixo de cadastro pra esconder?

---

## 5. Fases sugeridas (da menor pra maior)

| Fase | Entrega | Tamanho |
|---|---|---|
| **A** | `vendas.deposito_id` + gravar no PDV + exibir nos relatórios | Pequeno |
| **B** | Filtros/agrupamento por loja em Relatórios e Operação | Médio |
| **C** | Caixa por loja (abertura/fechamento por depósito) | Grande |
| **D** | Lançamento financeiro vinculado à venda/loja | Médio |

> Recomendação: começar pela **Fase A** (resolve 80% da dor — saber quanto cada
> loja vendeu — com risco mínimo).

---

## 6. Risco importante descoberto: `schema.sql` desatualizado

O arquivo `supabase/schema.sql` **não reflete o banco real**. Faltam nele:
`vendas`, `itens_venda`, `caixas`, `vales_credito`, `tabelas_preco`,
`itens_tabela_preco`, e as colunas `ativo` (formas_pagamento) / `descricao` (depositos).

**Impacto:** se alguém recriar o banco a partir do `schema.sql`, perde tudo isso.
Vale corrigir o `schema.sql` junto com este trabalho.

---

## 7. Relação com outras propostas

- [[PROPOSTA_PAGAMENTO_MISTO]] — também mexe em `vendas`/`lancamentos`; se as duas
  forem aprovadas, vale fazer as mudanças de banco **juntas** (uma migração só).
