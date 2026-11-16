# Troca com fornecedor — tutorial para quem atende e para quem fecha

> Para quem lança a peça com defeito, cobra o fornecedor e dá entrada na volta.
> Não precisa entender de sistema: é só seguir a ordem. Se algo não estiver igual
> ao descrito aqui, **não lance** — chame o responsável.

## O que é

Peça com defeito sai do estoque e vai para o fornecedor consertar, trocar ou
devolver o valor. Enquanto está com ele, **a peça não é estoque seu** — ela está
fora, e o app controla isso na aba **Estoque → Trocas**.

Duas coisas nunca podem se misturar:

- **A peça voltar** (estoque) — é mercadoria entrando de novo.
- **O valor ser abatido na dívida** (dinheiro) — é o fornecedor descontando da
  conta que a loja tem com ele.

Uma troca pode ter só a primeira, só a segunda, ou as duas.

## Passo 1 — a peça sai (no balcão)

Pela **devolução** (peça do cliente com defeito que vai para o fornecedor), o
sistema já cria a linha na aba Trocas. Se for peça da loja, use
**+ Lançar troca na mão**: busque a peça pelo nome, informe a quantidade e de
qual depósito saiu.

A peça sai do estoque no mesmo instante, com o **custo do dia da saída** — esse
custo é o que vale até o fim, mesmo que o preço de compra mude depois.

## Passo 2 — o dono diz de quem é

Cada linha tem o campo **fornecedor**. Só o responsável preenche: é ele que sabe
para onde a peça foi. **Troca sem fornecedor não dá para cobrar** — ela aparece
no painel em vermelho.

Depois de entregar a peça, aperte **Enviei**. A linha passa a **No fornecedor**.

## Passo 3 — a peça volta: "✓ Chegou do fornecedor"

Aperte o botão verde e responda **o que voltou**:

| Opção | Quando usar |
|---|---|
| **Voltou a mesma peça** | o fornecedor consertou ou mandou o mesmo modelo |
| **Voltou outra peça** | mandou modelo diferente (aí você **busca qual** é a peça que chegou) |

As duas dão entrada **no PETRÓPOLIS ESTOQUE** (o fundo), sempre — não importa de
qual loja a peça saiu. Se a sua loja precisar dela, o responsável transfere do
fundo para a loja depois.

Se a peça que voltou for **diferente e mais barata**, o app compara o valor:

| Diferença | O que acontece |
|---|---|
| até **R$ 100** | entra normal, sem perda — é diferença de modelo, não é prejuízo |
| acima de **R$ 100** | registra a perda da diferença, com o valor exato |

## Passo 4 — os outros dois desfechos

- **Abatido na nota** — o fornecedor não devolveu a peça, mas descontou o valor
  na dívida. Digite o valor que ele abateu. **Não é perda**: esse valor compra
  outras peças dele.
- **Virou perda** — o fornecedor recusou e a peça não volta. O custo vira despesa
  de perda no resultado do mês. Só use com o responsável de acordo.

## Onde olhar sempre

Na aba Trocas, o painel **"Onde está o dinheiro"** mostra, por fornecedor, quantas
peças estão com ele, quanto valem e há quantos dias a peça mais antiga está fora.
Vermelho acima de 30 dias = hora de cobrar.

## As três regras que não se quebram

**1. Peça que sai para troca NUNCA sai como venda.** Se sair como venda, o
faturamento sobe e o estoque mente.

**2. A volta é sempre no PETRÓPOLIS ESTOQUE.** Nunca direto no estoque da loja.
Loja pede por transferência — é o caminho que deixa rastro.

**3. Toda troca fecha com um desfecho.** Ou voltou (mesma peça/outra peça), ou foi
abatida na dívida, ou virou perda. Linha "No fornecedor" parada é dinheiro sem
notícia.

## Exemplo

Peça: frontal iPhone 15 Pro Max OLED DD, saiu com custo R$ 250,00 em 05/11 para o
**H2O FORNECEDOR**.

- **Voltou a mesma peça** → aperte "Chegou do fornecedor", escolha "Voltou a
  mesma peça". Entra 1 unidade no **PETRÓPOLIS ESTOQUE**, custo R$ 250,00, sem
  perda. Se a loja precisar, transfere.
- **Voltou modelo equivalente de R$ 220,00** → escolha "Voltou outra peça" e
  busque qual veio. Diferença de R$ 30,00 (dentro dos R$ 100): entra o modelo
  novo, sem perda, com a diferença anotada.
- **Fornecedor devolveu R$ 180,00 em crédito na dívida** → "Abatido na nota",
  valor 180,00. A peça não volta ao estoque; R$ 70,00 viram perda da diferença.
- **Fornecedor recusou** → "Virou perda". R$ 250,00 viram despesa de perda.
