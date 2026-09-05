# Mensagem após devolução

## Objetivo

Após concluir uma devolução, oferecer mensagem pronta para copiar e enviar pelo WhatsApp do cliente.

## Fluxo

1. Operador conclui devolução.
2. Sistema gera vale-crédito ou cancela o fiado ainda não pago.
3. Tela de sucesso mostra `Copiar mensagem`.
4. Se cliente tiver WhatsApp, mostra também `WhatsApp`.
5. Mensagem usa dados confirmados da operação, nunca valores digitados apenas no navegador.

## Mensagem — vale-crédito

```text
Olá, #CLIENTE#! 😊

Geramos vale-crédito de #VALOR#, referente ao produto #PRODUTO# da venda nº #NÚMERO#.

Crédito disponível para próxima compra.

#TecnocellBrasil
```

## Mensagem — cancelamento de fiado

```text
Olá, #CLIENTE#! 😊

Registramos devolução do produto #PRODUTO#, da venda nº #NÚMERO#.

Dívida de #VALOR# foi cancelada. Saldo atualizado.

#TecnocellBrasil
```

## Regras

- `#VALOR#` usa valor efetivo devolvido ou abatido.
- `#PRODUTO#` lista todos os produtos afetados quando houver mais de um.
- Tipo `credito_conta` usa mensagem de vale-crédito.
- Tipo `cancelamento_fiado` usa mensagem de cancelamento da dívida.
- Outros tipos de reembolso não mostram mensagem de vale ou cancelamento de fiado.
- Botão WhatsApp aparece somente com telefone válido.
- Copiar mensagem funciona mesmo sem telefone cadastrado.

## Verificação

- Teste unitário dos dois textos e múltiplos produtos.
- Teste de interface dos botões após sucesso.
- Confirmar que nenhum botão aparece quando operação falha.
