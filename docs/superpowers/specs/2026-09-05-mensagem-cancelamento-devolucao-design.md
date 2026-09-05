# Mensagem após devolução e cancelamento

## Objetivo

Após gerar vale-crédito ou cancelar devolução, oferecer mensagem pronta para copiar e enviar pelo WhatsApp do cliente.

## Fluxo

1. Operador conclui devolução ou cancelamento.
2. Sistema atualiza devolução e vale-crédito.
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

## Mensagem — cancelamento

```text
Olá, #CLIENTE#! 😊

Devolução do produto #PRODUTO#, da venda nº #NÚMERO#, foi cancelada.

Vale-crédito de #VALOR# relacionado também foi cancelado. Saldo atualizado.

#TecnocellBrasil
```

## Regras

- `#VALOR#` usa valor efetivo do vale-crédito relacionado.
- `#PRODUTO#` lista todos os produtos afetados quando houver mais de um.
- Cancelamento sem vale relacionado omite frase sobre vale-crédito.
- Vale já utilizado bloqueia cancelamento e explica motivo; nenhuma mensagem de cancelamento é oferecida.
- Botão WhatsApp aparece somente com telefone válido.
- Copiar mensagem funciona mesmo sem telefone cadastrado.

## Verificação

- Teste unitário dos dois textos e caso sem vale.
- Teste do bloqueio para vale utilizado.
- Teste de interface dos botões após sucesso.
- Confirmar que nenhum botão aparece quando operação falha.
