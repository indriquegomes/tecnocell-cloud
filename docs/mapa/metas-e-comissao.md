# Metas e comissão — de onde cada número sai

> Escrito em 09/11/2026, depois de conferir a comissão de outubro contra a
> configuração e contra os lançamentos. Vale para o módulo Financeiro →
> Comissão, para o Painel do vendedor e para o relatório de comissão.

## Existem quatro fontes de configuração

| # | Fonte | Onde está | Quem escreve | Quem lê |
|---|---|---|---|---|
| 1 | `metas` + `metas_faixas` — rótulo, período, dias úteis, nº de pessoas, faixas com valor e prêmio | tabelas | tela **Metas** (`app/painel/metas`) | tela Metas, Painel (`app/painel/page.tsx`), RPC `dashboard_faturamento_metas` |
| 2 | `configuracoes.metas_comissao:<AAAA-MM>` — limiares das faixas, percentual de cada faixa e percentual da comissão | `configuracoes` (JSON) | **nenhuma tela** — gravado direto no banco | tela **Financeiro → Comissão** |
| 3 | `configuracoes.time_comissao` — lista de vendedoras que dividem, por loja | `configuracoes` (JSON) | **nenhuma tela** | tela **Financeiro → Comissão** |
| 4 | `configuracoes.pdv.comissao_percentual` — percentual da comissão, digitado como `0,5` = meio por cento | `configuracoes` (JSON) | tela **Configurações** | tela Financeiro → Comissão, Painel do vendedor, relatório de comissão |

As fontes 2 e 3 não têm tela. Mudar a escada do mês ou trocar quem divide a
comissão é operação de banco.

## Como a tela Financeiro → Comissão calcula

1. Lê `metas_comissao:<mês>`. Se não existir, mostra aviso e não calcula.
2. Soma a venda bruta das vendas concluídas do mês, por loja
   (`vendas.total` — que já vem líquido dos descontos).
3. Soma as devoluções **cujas vendas são daquele mês**, sem filtrar a data da
   devolução.
4. Faixa batida = a mais alta cujo limiar de venda bruta foi alcançado.
5. Prêmio da meta = **limiar da faixa batida × percentual da faixa**. A tela não
   usa o prêmio cadastrado em `metas_faixas`; ela recalcula pelo percentual. Hoje
   os dois batem porque foram montados assim (ver tabela de coerência abaixo).
6. Comissão = percentual de Configurações × (venda bruta − devoluções).
7. Divide prêmio e comissão por igual entre as vendedoras de `time_comissao[loja]`.
8. O botão de lançar cria uma conta a pagar por vendedora, categoria `Comissão`:
   meta vence no 5º dia útil do mês seguinte, comissão no dia 20 (ou no último dia
   útil antes dele).

## Coerência entre as fontes (conferida em 09/11/2026)

| Mês | Faixas nas tabelas (limiar / prêmio) | Percentual × limiar | Bate? |
|---|---|---|---|
| Out/26 Petrópolis | 240.000 / 240 · 260.000 / 780 · 285.000 / 1.425 · 310.000 / 3.100 | 0,1% · 0,3% · 0,5% · 1% | sim |
| Out/26 Teresópolis | 180.000 / 180 · 195.000 / 585 · 210.000 / 1.050 · 230.000 / 2.300 | idem | sim |
| Nov/26 Petrópolis | 250.000 / 250 · 270.000 / 810 · 295.000 / 1.475 · 320.000 / 3.200 | idem | sim |
| Nov/26 Teresópolis | 195.000 / 195 · 210.000 / 630 · 225.000 / 1.125 · 245.000 / 2.450 | idem | sim |

## As fragilidades conhecidas

| # | Fragilidade | Consequência |
|---|---|---|
| 1 | A escada de metas está em dois lugares (tabelas e JSON) | editar na tela Metas **não** muda o que a Comissão calcula |
| 2 | O time que divide a comissão não tem tela | trocar vendedora é operação de banco |
| 3 | ~~O percentual da comissão estava em dois lugares (`0.5` e `0.005`)~~ | **resolvido em 09/11/2026**: a tela de Comissão passou a ler Configurações; o JSON ficou só como reserva para mês antigo |
| 4 | Devolução sem data de corte | o valor da comissão de um mês muda com devolução registrada depois, sobre venda daquele mês. A data de pagamento (dia 20) é a data de corte na prática: o lançamento nasce como rascunho e deve ser recalculado antes da baixa |
| 5 | Venda bruta da meta inclui uso interno e venda importada do SIGE | hoje não há nenhuma das duas em out/nov, então não distorce — mas o filtro existe em outros relatórios e aqui não |

## O que não é problema

- O prêmio pago em 03/11 conferiu exatamente com a regra (outubro: Petrópolis
  Esmeralda 780 ÷ 3 = 260; Teresópolis Diamante 1.050 ÷ 3 = 350).
- Quem vendeu e não recebe comissão é decisão do dono: estagiária e pessoa
  desligada ficam fora do time; quem entra no time passa a receber do mês em que
  entrou.
