# Contas do dinheiro e o caminho do PIX

Regra do dono (26/10/2026, confirmada de novo em 25/11/2026). Fonte oficial:
`docs/registros/2026-10/CONTEXTO-FINANCEIRO.md`. Se algum documento antigo disser
outra coisa, vale este.

## A conta é UMA

- **Uma conta só**, usada pelas duas lojas (Petrópolis e Teresópolis): no app é a
  **PagBank** (a única conta bancária ativa). Está cadastrada com todas as
  informações de conta.
- **Não existe conta bancária "da loja"**. Loja tem **caixa** (gaveta) e **cofre**;
  banco é um só.
- As contas antigas desativadas (`PIX`, `PIX Teresópolis`, `PagBank Teresópolis`,
  `TON`, `VALE CREDITO`) são sobra de configuração. Não usar, não "reativar" para
  separar PIX por loja.

## O caminho do dinheiro

```
cliente paga PIX (à vista ou parcela do fiado)  →  a conta única (PagBank)
        ↓
paga fornecedor (H2O, ADL, ZL, INOVA…) e despesa fixa (folha, aluguel, contas)
        ↓
não fica saldo parado: é dinheiro de PASSAGEM
```

Por isso a forma **PIX** aponta para a PagBank: qualquer PIX recebido, em qualquer
loja, encosta nessa conta — e o que sai (fornecedor, salário, conta fixa) sai dela.

## As duas exceções que NÃO passam pela conta

| Caso | Como é registrado |
|---|---|
| Cliente manda o PIX **direto ao fornecedor** (a loja abate a dívida) | forma `PIX do cliente ao fornecedor` — o dinheiro nunca entrou na conta, então não baixa saldo de banco |
| **Vale-crédito** | é saldo do cliente na loja, não dinheiro: não mexe em conta nem em gaveta |

## Consequência prática

- A tela **Contas** mostra **um** saldo de banco (não dá para ver "banco da loja X"):
  separar por loja exigiria abrir uma segunda conta de verdade e cadastrá-la.
- Número por loja existe para **venda, caixa, cofre e fiado** — não para banco.
- Antes de "consertar" um lançamento PIX de Teresópolis trocando a conta para uma
  "conta da loja": **não existe**. A resposta certa é a conta única.
