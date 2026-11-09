# Mapa do sistema — como o TecnoCell funciona

> **Status: em construção (06/11/2026).**
> Este é o lugar do "como funciona": telas, fluxos, tabelas, quem pode o quê.
> Regras (autorização, trava de deploy, padrões de código) **não** moram aqui —
> elas ficam no `AGENTS.md` da raiz.

## O que vai aqui (e o que não vai)

| Vai para `docs/mapa/` | Não vai |
|---|---|
| Como cada módulo funciona, do clique ao banco | Regra de trabalho, autorização, trava de deploy |
| Quais telas existem e o que cada uma faz | Receita de tarefa (isso é `docs/receitas/`) |
| Quais tabelas e RPCs cada fluxo usa | Número de um mês fechado (`docs/registros/`) |
| Quem pode ver/fazer o quê (cargos) | Assunto encerrado (`docs/arquivo/`) |

## Já existe

- `glossario.md` — **um nome oficial por processo** (retirada, fiado, vale,
  devolução, troca, depósito…). Consultar antes de nomear tela, campo ou
  documento novo.
- `metas-e-comissao.md` — as quatro fontes de configuração de meta e comissão,
  como a tela Financeiro → Comissão calcula e as fragilidades conhecidas.

## Fila de escrita (sugestão de ordem)

1. **Visão geral** — os 8 módulos e como o dinheiro anda entre eles.
2. **Vendas e PDV** — do carrinho ao `finalizar_venda` (pagamento misto, fiado,
   vale, devolução).
3. **Estoque** — depósitos por loja, IMEI, movimentação, trocas, encomendas.
4. **Financeiro** — contas a pagar/receber, categorias, fechamento de mês,
   comissão.
5. **Clientes e fiado** — cadastro, limite, cobrança, quitação.
6. **Ordens de serviço** — da abertura ao recebimento.
7. **Permissões** — cargos, o que é master-only, como criar permissão nova.
8. **Integrações** — Mercado Livre, bot de comprovantes, WhatsApp, IA.

## Regra de ouro

Uma informação mora em **um** lugar. Se precisar citar outra parte do mapa,
coloque um link — não copie o texto.
