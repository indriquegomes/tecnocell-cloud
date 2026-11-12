# Funcionários — estão ligados entre as telas?

> Auditoria de 12/11/2026 (madrugada). Fonte: `perfis` (quem tem login e salário),
> `pessoas` (cadastro), `lancamentos` categoria `Salários` e `pontos` (batida de ponto).
> Nada aqui foi inventado: cada linha é confronto de banco contra banco.

## Quantos são

**17 perfis** sem contar o master. Dois deles são de treino
(`TREINAMENTO — Petrópolis` e `TREINAMENTO — Teresópolis`) e ficam fora da folha por regra
do sistema — não precisam de cadastro.

## Como cada um aparece

| Funcionário | Ativo | Vínculo | Cadastro | Salário nov | Com vínculo | Dias com ponto em nov |
|---|---|---|---|---|---|---|
| Brunna Furtado Gonçalves | sim | mei | ok | 4 | 4 | 8 |
| Erick Alves de Mattos | sim | mei | ok | 4 | 4 | 0 |
| Giovane Rego da Silva | sim | mei | ok | 1 | 1 | 0 |
| Isaac Bento Morelli | sim | mei | ok | 4 | 4 | 0 |
| Isabella Beatriz Ferreira de Assumpcao | sim | clt | ok | 1 | 1 | 8 |
| Isabella Pereira Bulhões | **não** (demitida 21/10) | clt | ok | 0 | 0 | 0 (última em 20/10) |
| João Vítor Maximiano França | sim | autonomo | ok | 1 | 1 | 0 |
| Leticia de Oliveira Amaro | sim | clt | ok | 1 | 1 | 6 |
| Lucas da Silva Mello | sim | mei | ok | 1 | 1 | 0 |
| Maria Eduarda Kappler da Silva | sim | mei | ok | 4 | 4 | 6 |
| Maria Julia de Souza Ferreira Carvalho | sim | estagio | ok | 1 | 1 | 8 |
| Mariana Vila Real Castelli | sim | mei | ok | 4 | 4 | 7 |
| Nikollas Bernardo Leocadio | sim | mei | ok | 4 | 4 | 0 |
| Rodrigo Carvalho de Rezende Junior | sim | clt | **criado nesta auditoria** | 1 | 1 | 7 |
| Vitória Ranyelle de Paiva Silva | sim | clt | ok | 1 | 1 | 7 |

> A coluna de ponto conta **dias com entrada** de 03/11 a 11/11. Os perfis de treino e os
> MEI/autônomos que não usam o ponto aparecem com 0 — isso é uso, não erro.

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
- **Isabella Pereira Bulhões** estava com vínculo CLT e salário modelo, mas o perfil está
  **inativo** desde a demissão (21/10/2026, rescisão de R$ 6.640,48 paga em 30/10). Ela já
  tinha saído de todas as telas de trabalho (`perfis.ativo = false` barra folha, escala,
  falta e login), e os resquícios foram limpos: salário e vale-transporte zerados, escalas
  desativadas. **Não dá para apagar o perfil**: 468 vendas e 50 batidas de ponto apontam
  para ele. Ela continua no app **só como cliente**, porque deve **R$ 128,80** de fiado
  (dois lançamentos de 64,40 de 13/09).

## Ponto: bate, sim

A primeira leitura deste documento dizia "ninguém bate ponto" e estava **errada** — a
consulta olhava uma coluna que não existe em `pontos`. O dado real:

- **Outubro:** 956 batidas. **Novembro até 11/11:** 207 batidas, de 8 pessoas.
- Todo dia útil tem entrada, pausa, retorno e saída: 03/11, 04/11, 05/11, 06/11, 07/11,
  09/11, 10/11 e 11/11. A última saída registrada foi 11/11 às 19h26.

O que fazia parecer vazio: a tela **RH / Equipe** só sabia mostrar **o dia de hoje**. De
madrugada, ou antes das 8h, ela abria zerada — todo mundo "Fora", nenhuma batida — e dava
a impressão de módulo morto. Agora a tela tem seletor de dia (setas ← → e campo de data,
com "Voltar pra hoje"), e num dia passado quem ficou sem saída aparece como
**⚠ Sem saída** em vez de "Trabalhando". Corrigir batida pela tela de um dia passado
também grava a batida no dia certo, não em hoje.
