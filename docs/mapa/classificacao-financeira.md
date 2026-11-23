# Classificação financeira — a régua única do dinheiro

Toda linha do Financeiro (`lancamentos`) recebe uma **categoria**. Esta é a régua que
diz o que cada grupo significa no resultado — para que o DRE, o fechamento e as abas
do dono leiam a mesma coisa.

> Regra de ouro: **a categoria diz o que a linha é, não quando ela vence.** Data e
> periodicidade ficam nas colunas de data. Subcategoria responde "que tipo dentro da
> categoria".

## 1. Operacional (despesa da loja)

Sai do resultado do mês, sem ressalva.

| Categoria | Exemplos |
|---|---|
| Aluguel · Energia/Luz · Contabilidade · Impostos · **Jurídico** · **Tarifas bancárias** | contas fixas e custo de existir |
| Combustível · Alimentação · Manutenção · Limpeza · Transporte · Serviços · **despesas loja** · **Outras despesas** · Gastos em São Paulo · Confraternização · Saúde · Motoboy | custo do dia |
| **Perda** (quebra de caixa, troco errado) | dinheiro que sumiu da gaveta |
| **Perda de troca** (peça que o fornecedor não troca, avaria) | custo de peça virando prejuízo |
| Uso interno (peça consumida pela loja) | saiu do estoque sem venda |
| Frete / Entrega (transportadora ou entregador terceirizado) | — |

## 2. Folha (dinheiro para pessoa que trabalha)

Também sai do resultado, mas é bloco próprio: quem olha "quanto custa a equipe" lê
aqui, sem se misturar com aluguel.

- **Salários** — subcategorias: Adiantamento · Rescisão · Hora extra · Comissão ·
  **Bônus** · **Vale transporte**
- **Comissão** (regra de metas)
- **Freelancer** (diária / por serviço)

## 3. Não-operacional (dinheiro do dono e dívida)

Não é despesa da loja — é distribuição ou dívida. Aparece no relatório, mas fora do
resultado operacional.

| Categoria | O que é |
|---|---|
| **Pró-labore** | pagamento fixo do dono: **4.000 Petrópolis + 2.000 Teresópolis**, dia 30 (custo de existir, mas pago ao dono) |
| **Retirada do sócio** | retirada, conta pessoal e gasto particular do dono — distribuição |
| **Dívida parcelada** | parcela de dívida (ex.: Isabela Ponciano Câmara) |

## 4. Contra-receita (dinheiro que volta ao cliente)

Reduz o que entrou; **não é gasto novo**.

- **Devolução ao cliente** — reembolso de compra (desistência, defeito, peça errada).
  A forma do dinheiro (PIX, dinheiro, crédito) é a coluna Forma, não a categoria.
- **Estorno de crédito** — crédito do cliente corrigido/estornado.
- **Desconto concedido** — desconto/abatimento dado na cobrança do fiado.
- **Perda com fiado** — dívida antiga que se desistiu de receber.
- **Estorno** — desfazer uma passada no cartão/PIX.

## 5. Estoque (não é despesa)

Compra de mercadoria **não** é despesa: é estoque. Virou custo (CMV) quando a peça é
vendida. Categorias reconhecidas: `Mercadoria`, `Fornecedor / Mercadoria`,
`fornecedor/mercadoria` (grafias antigas continuam valendo para não reinterpretar mês
fechado). Toda linha de mercadoria deve ter **fornecedor ligado pelo cadastro
(`pessoa_id`)**, não só pelo nome — a dívida e o abatimento filtram por id.

## 6. Particular do dono (fora da loja)

`Particular` — contas da vida do dono (Casa · Condomínio · Energia/Água · Escola ·
Saúde · Carro · Cartão · Pessoal · Outros). Vive na aba **`/painel/particular`**
(master) e é paga com o **Pró-labore**. Não entra em nenhum relatório da loja.

A conta é:

```
pró-labore do mês − contas particulares pagas = sobra para retirar
```

## Onde cada coisa mora

- Catálogo das categorias e subcategorias: `lib/financeiro-setores.ts` (é o que a tela
  usa para sugerir — categoria que não está lá não nasce no lugar certo).
- Números do mês: `scripts/conferir-mes.mjs <AAAA-MM>`.
- Devolução mal fechada: `scripts/conferir-devolucoes-sem-lancamento.mjs <AAAA-MM>`.
- Dinheiro em espécie: `scripts/conferencia-caixa.mjs <de> <ate>`.
