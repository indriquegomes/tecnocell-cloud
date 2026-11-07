# Relatório final — outubro/2026 (auditoria e cruzamento)

Tudo abaixo é **leitura** do banco e dos arquivos. Nada foi lançado, alterado ou apagado.
Fontes: app (Supabase), papel de fornecedores (PDF), imobilizado do grupo de WhatsApp,
conferência PIX (validada no banco), extrato PagBank (CSV), contagem de dinheiro do dono.

---

## 0. Correção das minhas próprias contas

Meu primeiro levantamento dizia **5.900 vendas · R$ 501.823,87**. Errado — paginação incompleta
(a mesma armadilha que já mordeu este projeto antes). Rodei três vezes com contagem exata:

| | Valor correto |
|---|---|
| Vendas concluídas de outubro | **5.942** |
| Total vendido | **R$ 506.509,63** |

A diferença era R$ 4.685,76 em 42 vendas que minha primeira leitura não pegou.

---

## 1. Números oficiais de outubro

| | |
|---|---|
| Vendas concluídas | 5.942 · **R$ 506.509,63** |
| Pagamentos pendentes (fiado) | R$ 425.268,26 (4.958 linhas) |
| Pagamentos pagos na hora | R$ 66.262,37 (868) |
| Pagamentos em vale-crédito | R$ 14.818,61 (234) |
| **Total que entrou** (venda paga + fiado recebido) | **R$ 355.600,23** |
| Fiado recebido | R$ 289.337,86 (1.953 movimentos) |

## 2. O que fechou (conferido e sem erro)

| Item | Conferência |
|---|---|
| **Dinheiro da gaveta** | `fechamento − abertura` dos 85 caixas × fluxo calculado: Pet **−R$ 19,10** · Tere **+R$ 5,50**. O app fecha com ele mesmo no centavo. |
| **Dinheiro em mãos** | Pet R$ 32.163 × calculado R$ 32.926,30 (dif. 1,6%) · Tere R$ 27.000 × R$ 26.420,50 (dif. 1,6%) |
| **Contagem do dinheiro** | diferença de R$ 763,30 e R$ 579,50 = exatamente os pagamentos em espécie não lançados |
| **Conferência PIX** | reproduzida no banco: 1.904 comprovantes · R$ 258.996,55 — igual ao relatório do dono |
| **Estoque 30/09** | papel R$ 455.129,14 × app R$ 449.124,75 (1,1% e 1,6%) |
| **Estoque 23/10** | papel R$ 450.837,20 × app na mesma data (2,8% e 3,0%) |
| **Notas de entrada** | 56 notas, soma dos itens = valor_total em **todas**; **zero duplicadas** |
| **Vendas** | zero venda sem linha de pagamento; 1 cancelada |

## 3. Erros e falhas (ordenados por dinheiro)

### E1 — Devoluções: 1.898 no mês · R$ 150.328,62 — **NÃO É ERRO** (era eu que li errado)
- "teste" **não é dado de treino**: é o `id` do motivo **"Pediu pra testar"** (`lib/motivos.ts`), que aparece como **primeira opção** da lista de motivos no registro de devolução.
- Significado: o lojista levou a peça para testar no aparelho e trouxe de volta. É operação normal de loja que vende peça para assistência técnica.
- **1.198 registros · R$ 97.166,29** com esse motivo (64% do valor devolvido) — 1.843 unidades voltaram ao estoque e 417 foram para troca.
- Provas de que são reais: todas apontam venda existente, cliente existente e produto existente; **nenhuma devolução passa do total da venda**; nenhuma venda tem devolução somada acima do total; dos R$ 51.092,42 de crédito gerado, **R$ 50.371,78 (98,6%) foram usados** pelos clientes.
- O que continua sendo número de gestão (não erro): **30% do valor vendido voltou como devolução** no mês. Vale acompanhar, não corrigir.

### E2 — Pagamento a fornecedor: **R$ 33.811,02 não lançados** (PIX comprovado)
| Fornecedor | PIX real | Lançado | Falta |
|---|---|---|---|
| H2O | R$ 121.640,24 | R$ 100.706,22 (inclui "H2") | R$ 20.934,02 |
| ADL | R$ 26.919,15 | R$ 20.709,25 | R$ 6.209,90 |
| ZL | R$ 13.904,00 | R$ 12.572,70 | R$ 1.331,30 |
| INOVA | R$ 15.145,40 | R$ 9.908,60 | R$ 5.236,80 |
| PLANETA | R$ 255,00 | R$ 156,00 | R$ 99,00 |
- **Cadastro duplicado:** "H2O FORNECEDOR", "H2O" e "H2" aparecem como nomes diferentes → o mesmo fornecedor em 2–3 fichas. Junta ou o relatório por fornecedor mente.
- **Proposta:** lançar os 33.811,02 com data do comprovante + unificar as fichas H2O (depois de autorização).

### E3 — R$ 25.700 pagos em espécie: **zero lançados**
Pet 9.600 (13/10) + 6.200 (28/10) · Tere 5.900 (13/10) + 4.000 (28/10). Dono: são **outros fornecedores**, que entram no app mais à frente.

### E4 — Mercadoria: **R$ 88.158,96** de diferença app × papel
App (5 fornecedores, outubro) R$ 259.101,96 × papel "comprado" R$ 170.943,00.

**Dois testes feitos depois (madrugada):**
- **0 de 56 notas** têm valor igual a um PIX do dia → nota não é cópia de pagamento.
- **1.562 de 1.765** itens de nota têm preço unitário igual ao **custo** do cadastro; **nenhum** bate com o preço de venda; soma das notas R$ 290.437,18 × R$ 291.548,89 a custo cadastrado (0,4%).

**Leitura:** as notas do app estão valorizadas a custo e são coerentes; a planilha do papel provavelmente **não contempla todas as compras do mês**. Falta só a conferência visual de 2 notas (15/10 nº 72 R$ 34.573,00 · 29/10 nº 97 R$ 27.187,00). Detalhe em `notas-detalhe-e-resultado.md`.

### E5 — H2O: PIX de **01/10 R$ 6.600,30** não existe no papel
Papel começa os pagamentos de H2O em 02/10. Dono: provável pagamento de dívida de setembro. **Não é erro** — é fronteira de mês.

### E6 — 44 vendas com soma de pagamentos ≠ total da venda
Diferença somada: **R$ 160,39**. Todas com centavos "quebrados" (ex.: #5820 total R$ 51,50 × pagamento R$ 50,00). O RPC trava divergência grande, mas deixa passar centavo.
**Proposta:** só registro — R$ 160 no mês não muda decisão.

### E7 — 305 despesas pagas **sem forma de pagamento** — R$ 19.018,52
Sem forma não se sabe se saiu da gaveta, do PIX ou do cartão. **Proposta:** preencher a forma (o dono decide quais).

### E8 — Formas de pagamento informais em despesa
`Outros` R$ 1.453,74 · `Vale Crédito` R$ 496,20 (5 lançamentos: despesa paga com crédito de cliente é suspeita) · `credito` R$ 50,00 · `pix` minúsculo R$ 130,50.
**Proposta:** normalizar para a lista oficial de formas.

### E9 — Transferência de R$ 74.338,29 para o CNPJ próprio
Folha lançada no app = R$ 42.343,17 (55 lançamentos). **Sobram R$ 31.995,12 sem explicação.** Se as duas coisas forem somadas como despesa, o mês é contado duas vezes.

### E10 — Isabela Ponciano — **corrigido, não falta nada**
Isa é **ex-funcionária**: tem uma dívida registrada no app em **10 parcelas de R$ 5.000** (R$ 3.500 Petrópolis + R$ 1.500 Teresópolis), mensais de 01/10/2026 a 10/10/2027. **Parcela 01 paga em 28/10 (R$ 5.000) e parcela 10 adiantada em 30/09.** O PIX de R$ 5.872,47 para ela em outubro **não é só parcela** — o excedente de R$ 872,47 é outra coisa, a confirmar.

### E11 — Fornecedor lançado que não tem PIX: R$ 3.935,91
Lançamentos "Fornecedor / Mercadoria" para nomes fora da lista dos 5 (ex.: Acessórios Fabio). Ou foram pagos em espécie, ou estão lançados sem saída de dinheiro.

### E12 — PIX recebido "sem extrato" — **não é falha, é conta minha errada**
Eu calculei PIX do app (R$ 260.379,70) − PagBank (R$ 76.407,59) = R$ 183.972,11 e chamei de buraco.
Errado: o **PagBank não é a conta que recebe PIX de cliente**. Ele recebe a transferência da empresa
(dia a dia igual ao PIX enviado ao CNPJ do João Vitor, 7 dias batendo no centavo) e liquida o cartão.
Quem recebe PIX de cliente é a conta da empresa — **não a Cora, que está desativada desde setembro**. Com o material atual não sabemos qual conta é.
O PIX recebido está conferido por dentro do app: baixas de fiado (caixa + vale) fecham em 1,25%.
Detalhe em `pix-forense.md`.

### E13 — Fiado em aberto: 300 notas · R$ 26.520,69 · **128 sem cliente ligado**
Fiados sem `pessoa_id` não aparecem no cadastro do cliente.

### E14 — Produtos
- 1 linha negativa de estoque (−8 unidades)
- 9 produtos com **preço de venda menor que o custo**
- 1 produto com estoque e custo zero
- Cadastro de custo OK no total (estoque a custo bate com a contagem em 1–3%)

### E15 — Não existe fechamento de setembro nem abertura de outubro
Decisão do dono: resolver só com o fechamento de outubro. O caixa inicial da tela mostra R$ 0 (cosmético).

---

## 4. Dinheiro — pode fechar

| Loja | Valor a digitar no "Fechar mês" |
|---|---|
| Petrópolis | **R$ 32.163,00** |
| Teresópolis | **R$ 27.000,00** |

## 5. Conta de mercadoria (para conferência, não depende de lançamento)

```
Estoque inicial 30/09 (contagem física) .... R$ 455.129,14
+ mercadoria lançada em outubro ............. R$ 290.437,18
− estoque final (app, ±3%) .................. R$ 459.594,41
= mercadoria consumida ...................... R$ 285.971,91  (56,5% da venda)
```

## 6. O que falta para 100%

1. Conferir **2 notas de H2O** contra a NF/pedido (E4) — o resto do material já está pronto em `notas-detalhe-e-resultado.md`.
2. Nomes dos fornecedores que recebem **espécie** (E3, R$ 25.700).
3. Natureza dos **R$ 31.995,12** da transferência ao CNPJ (E9).
4. Lançar **R$ 33.811,02** de pagamento a fornecedor (lista dia a dia em `falta-lancar-fornecedor.md`).
5. Dinheiro em mãos em **01/10** (só para fechar a conta do dinheiro no centavo).
6. Devoluções "teste": **nada a decidir** — é o motivo "Pediu pra testar", devolução normal.
6. Dinheiro em mãos em **01/10** (só para fechar centavo do dinheiro).
