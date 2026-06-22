# Comparativo PDV: SIGE Cloud × TecnoCell — Checklist de trabalho

> Objetivo: deixar o PDV da TecnoCell tão otimizado quanto o do SIGE, **com nosso
> toque** e melhorias. Trabalhar pouquinho por pouquinho, testando cada item.
> Base: 4 telas do PDV do SIGE (Nova Venda, Grid de pagamento, Detalhe do pagamento, Carrinho).

## ✅ O que JÁ temos (igual ou melhor que o SIGE)

| Recurso | TecnoCell | Obs |
|---|---|---|
| Busca de produto (nome/código) | ✅ | igual |
| Carrinho (nome, qtd, unit, total, remover) | ✅ | igual |
| Total da venda | ✅ | igual |
| Seletor de Loja/Estoque (topo) | ✅ | = "TECNOCELL ▾" do SIGE |
| Seletor de Tabela de preço (topo) | ✅ | = "Preço Padrão ▾" do SIGE |
| Forma de pagamento | ✅ (dropdown) | SIGE usa grid visual bonito (ver falta #2) |
| Cliente na venda | ✅ (dropdown) | SIGE tem busca por nome/CPF (ver falta #6) |
| Desconto | ✅ (em R$) | falta % (ver falta #12) |
| Finalizar venda | ✅ | igual |
| ⭐ Calculadora de taxa de cartão (TON/Pagbank) | ✅ | **o SIGE NÃO tem — nosso diferencial** |

## ❌ O que FALTA (que o SIGE tem)

| # | Recurso | Onde no SIGE | Tamanho |
|---|---|---|---|
| 1 | ~~Stepper visual (3 telas)~~ **DESCARTADO** — decisão do dono: manter TUDO em **tela única** (já é assim na TecnoCell; mais rápido que as 3 telas do SIGE) | — | — |
| 2 | ~~**Grid visual de formas de pagamento**~~ ✅ **FEITO** — botões coloridos com ícone na tela única | tela 2 | Médio |
| 3 | ~~**Pagamento misto** (várias formas na mesma venda)~~ ✅ **FEITO** — múltiplas formas por venda, taxa por linha, fiado cria lançamento A Receber | tela 3 | — |
| 4 | ~~**Troco** (valor recebido − total)~~ ✅ **FEITO** — aparece ao escolher Dinheiro | tela 3 | Pequeno |
| 5 | ~~**Contador "Quantidade Total de Itens"**~~ ✅ **FEITO** — no Resumo da Venda | tela 1/4 | Pequeno |
| 6 | ~~**Busca de cliente por Nome OU CPF/CNPJ**~~ ✅ **FEITO** — barra de cliente compacta no topo | tela 1/4 | Médio |
| 7 | ~~**Quantidade editável**~~ ✅ **FEITO** — input editável no carrinho | tela 4 | Pequeno |
| 8 | ~~**Atalhos de teclado**~~ ✅ **FEITO** — F2 buscar, F8 finalizar, Esc fechar + rodapé de atalhos | rodapé | Médio |
| 9 | ~~**Buscar Vendas**~~ ✅ FEITO (modal) → **REVISAR**: remover botão feio do topo, trocar o modal por uma aba/página de histórico por cliente (o que foi vendido pra aquela pessoa, botão direto da venda) | tela 1 | Médio |
| 10 | **Cashback** (mostrar/usar saldo de cashback do cliente) | telas 2/4 | Grande → **grupo** |
| 11 | ~~**Código do produto no carrinho**~~ ✅ **FEITO** — "código · nome" no carrinho | tela 4 | Pequeno |
| 12 | ~~**Desconto em %** (além de R$)~~ ✅ **FEITO** — toggle R$/% no Resumo | tela 3 | Pequeno |
| 13 | **Aba de config de máquinas de cartão** (cadastrar máquina/parcelas/taxas; hoje hardcoded no PDV) | nosso diferencial | Médio — ver config-maquinas-cartao (memória) |

## 🖥️ Telas dos atalhos do PDV (SIGE) — métrica

Telas/modais que os atalhos de teclado abrem no PDV do SIGE (ver item #8 Atalhos):

| Atalho | Tela do SIGE | O que faz | O que temos hoje | Status |
|---|---|---|---|---|
| **F1** | **Consultar Produtos** | Modal com **ficha completa** do produto: preço de venda, **saldo no depósito**, marca, **preço mínimo**, **imagem**, prateleira, categoria, nº NFe, código de barras + botão "Add. Item" | Busca inline mostra nome/saldo/preço, mas **sem a ficha detalhada** (preço mínimo, imagem, prateleira, categoria) | ⚠️ parcial — falta a ficha |
| **F3** | **Buscar orçamentos e pedidos** | Carregar um orçamento/pedido salvo dentro do PDV | `/painel/pedidos` existe, mas **não** carrega no PDV | ❌ falta integrar |
| **F9** | **Crediário** | Gestão de dívidas/fiado: parcelas, **juros**, vencimento, atraso, "a cobrar", botão Pagar | ✅ **FEITO** — modal F9 completo: filtro, 4 cards de métricas, tabela com checkbox + pagar individual, status Vencido/A vencer, Subtotal + botão Pagar em lote | ✅ feito |
| **Ctrl+F11** | **Consulta de Vendas Faturadas** | Lista vendas feitas (código, cliente, valor, NFC-e, imprimir) | `/pdv/operacao` e `/relatorios` mostram vendas | ❌ parcial = item #9 |

> Observações:
> - **Crediário (F9)** é o "fiado de verdade" com juros e parcelas — conecta com
>   PROPOSTA_PAGAMENTO_MISTO.md e com o lançamento "A Receber". É item grande → grupo.
> - **Consulta de Vendas Faturadas** envolve **NFC-e** (emissão fiscal), que ainda não
>   temos — ver itens "NF-e" do roadmap de Vendas.

## 🎨 Visual / "nosso toque"
- [ ] Revisar **cores** do PDV (pedido do dono — confirmar paleta desejada)
- [ ] Aplicar identidade TecnoCell

## Ordem sugerida (rápidos primeiro, alto impacto)
1. Contador de itens (#5) + Código no carrinho (#11) + Quantidade editável (#7) — rápidos
2. Troco (#4) + Desconto % (#12)
3. Grid visual de pagamento (#2) + Stepper (#1)
4. Atalhos de teclado (#8)
5. Buscar Vendas (#9)
6. Grandes (grupo): Pagamento misto (#3), Cashback (#10)
