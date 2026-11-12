# Funcionários — estão ligados entre as telas?

> Auditoria de 12/11/2026 (madrugada). Fonte: `perfis` (quem tem login e salário),
> `pessoas` (cadastro), `lancamentos` categoria `Salários` e `pontos` (batida de ponto).
> Nada aqui foi inventado: cada linha é confronto de banco contra banco.

## Quantos são

**17 perfis** sem contar o master. Dois deles são de treino
(`TREINAMENTO — Petrópolis` e `TREINAMENTO — Teresópolis`) e ficam fora da folha por regra
do sistema — não precisam de cadastro.

## Como cada um aparece

| Funcionário | Ativo | Vínculo | Cadastro | Salário nov | Com vínculo | Ponto |
|---|---|---|---|---|---|---|
| Brunna Furtado Gonçalves | sim | mei | ok | 4 | 4 | 0 |
| Erick Alves de Mattos | sim | mei | ok | 4 | 4 | 0 |
| Giovane Rego da Silva | sim | mei | ok | 1 | 1 | 0 |
| Isaac Bento Morelli | sim | mei | ok | 4 | 4 | 0 |
| Isabella Beatriz Ferreira de Assumpcao | sim | clt | ok | 1 | 1 | 0 |
| Isabella Pereira Bulhões | **não** | clt | ok | 0 | 0 | 0 |
| João Vítor Maximiano França | sim | autonomo | ok | 1 | 1 | 0 |
| Leticia de Oliveira Amaro | sim | clt | ok | 1 | 1 | 0 |
| Lucas da Silva Mello | sim | mei | ok | 1 | 1 | 0 |
| Maria Eduarda Kappler da Silva | sim | mei | ok | 4 | 4 | 0 |
| Maria Julia de Souza Ferreira Carvalho | sim | estagio | ok | 1 | 1 | 0 |
| Mariana Vila Real Castelli | sim | mei | ok | 4 | 4 | 0 |
| Nikollas Bernardo Leocadio | sim | mei | ok | 4 | 4 | 0 |
| Rodrigo Carvalho de Rezende Junior | sim | clt | **criado nesta auditoria** | 1 | 1 | 0 |
| Vitória Ranyelle de Paiva Silva | sim | clt | ok | 1 | 1 | 0 |

## O que estava errado e foi corrigido

1. **Rodrigo Carvalho de Rezende Junior** — funcionário CLT de Teresópolis **sem cadastro
   em pessoas**. O salário dele era lançado sem vínculo, então a dívida não aparecia em
   nenhuma ficha. Cadastro criado (tipo `cliente`, o mesmo formato dos outros funcionários
   na base) e o salário de 1.621,00 ligado.
2. **Três salários de novembro sem `pessoa_id`** — Mariana Vila Real Castelli (611,54),
   Giovane Rego da Silva (765,00) e Lucas da Silva Mello (798,00). Ligados ao cadastro.
   Total religado: **3.795,54 em 4 lançamentos**.

Depois disso: **nenhum salário de novembro sem vínculo** e **nenhum funcionário ativo sem
cadastro** (fora os dois de treino, que não precisam).

## O que apareceu e não é erro

- **Nenhum cadastro duplicado** entre os funcionários.
- **Nenhum nome em Salários que não seja de um perfil** — não existe "funcionário fantasma"
  recebendo salário sem login.
- **Isabella Pereira Bulhões** está com vínculo CLT e salário cadastrado, mas o perfil está
  **inativo** e ela não tem salário lançado em novembro. Se ela saiu, o certo é zerar o
  salário ou marcar o desligamento — hoje ela só não entra na geração da folha.

## O que precisa de decisão

**Ninguém bate ponto.** O módulo Ponto existe, tem tabela (`pontos`), mas os 16 perfis ativos
estão com **zero batida**. Duas leituras possíveis:

- o módulo não é usado na prática e pode ser desligado do menu; ou
- é usado e as batidas estão sendo feitas em outro lugar (papel, planilha), e aí falta
  lançar.

Só o dono sabe qual é. Enquanto não decidir, o módulo continua no ar sem dado.
