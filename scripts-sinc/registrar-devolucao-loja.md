# Patch de loja em registrar_devolucao (via MCP)

A função `registrar_devolucao` NÃO tem o corpo versionado em migration — foi
aplicada via MCP em 26/08 (reembolso misto + conta por reembolso) e 06/09
(desconto geral). Recriar a partir de migration antiga reverte essas correções.

## Passo a passo

1. Puxe o corpo atual (11 argumentos, com `p_reembolsos`):

```sql
select pg_get_functiondef('public.registrar_devolucao'::regproc);
```

2. No bloco `declare`, adicione:

```sql
  v_loja_id  uuid;
```

3. Logo depois que `v_deposito` estiver resolvido (depois do fallback
   "nenhum depósito cadastrado"), adicione:

```sql
  select loja_id into v_loja_id from depositos where id = v_deposito;
```

4. Em TODO `insert into creditos_clientes` (o reembolso `credito_conta`, que
   com reembolso misto pode estar DENTRO do loop de `p_reembolsos`), inclua a
   coluna `loja_id`:

```sql
    insert into creditos_clientes (pessoa_id, pessoa_nome, valor, tipo, descricao, devolucao_id, loja_id)
    values (..., v_loja_id);
```

5. Aplique via MCP (como foi feito em 26/08) e confira:

```sql
select pg_get_functiondef('public.registrar_devolucao'::regproc) ~ 'v_loja_id';
```

## Por que não foi automatizado

- O corpo real só existe no banco (via MCP), não em arquivo.
- Reproduzir de migration antiga = regressão de desconto geral + reembolso misto
  + conta por reembolso, e cria sobrecarga-fantasma.
