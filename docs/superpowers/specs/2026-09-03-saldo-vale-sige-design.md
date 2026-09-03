# Saldo de Vale SIGE — Design

## Objetivo

Importar saldo de vale-crédito do SIGE para o TecnoCell sem criar vendas, apagar dados ou salvar campos sensíveis do cadastro SIGE.

## Fonte confirmada

- Lista: `POST https://apiapp.sigecloud.com.br/v3/pessoas/pessoas`.
- Saldo: `POST https://apiapp.sigecloud.com.br/v2/pessoa/GetPessoaPDV`.
- Campo: `SaldoValeCredito`.

`/v3/pessoas/pessoas` não contém o saldo de vale e traz campos que não devem ser copiados, como `Senha` e `Salt`.

## Fluxo

1. `puxa-clientes.mjs` pagina a lista de pessoas.
2. Para cada cliente, chama `GetPessoaPDV` com identificador exibido pelo PDV.
3. Salva somente `id`, `nome`, `cpfCnpj` e `saldoValeCredito` em `Clientes-AAAA-MM-DD.json`.
4. `carregar-vales.mjs` aceita `cpfCnpj` e `CNPJ_CPF`, localiza pessoa no TecnoCell e aplica somente diferenças positivas/negativas pelo mecanismo atual idempotente.

## Segurança e falhas

- Nunca gravar objeto bruto do SIGE no JSON.
- Nunca imprimir token, CPF completo ou resposta bruta.
- Falha de consulta individual entra como pulada; não interrompe lote nem grava saldo como zero.
- Nenhuma exclusão, venda, baixa de fiado ou movimento de caixa.

## Verificação

- Teste local valida normalização de CPF/CNPJ e formato limpo do JSON.
- Execução em SIGE informa total consultado, com saldo, pulados e arquivo gerado.
- Carregador informa upserts e clientes sem correspondência no TecnoCell.
