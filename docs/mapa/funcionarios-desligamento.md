# Funcionários: admissão, desligamento e o que o app faz sozinho

> Como o vínculo de trabalho funciona do clique ao banco. Regra de código em
> `AGENTS.md`; aqui é o comportamento do sistema.

## Desligar não é apagar

Perfil de pessoa **nunca é apagado**. Vendas (`vendas.vendedor_id`), batidas de
ponto (`pontos.usuario_id`), banco de horas e salários pagos apontam para ele —
apagar deixaria esse histórico sem dono. E o histórico é o que prova quem vendeu
o quê e quando (comissão, meta, ponto).

Desligar é fazer a pessoa **sair de tudo que é de gente trabalhando**,
mantendo o registro:

| O que | Como fica depois do desligamento |
|---|---|
| Login | bloqueado (`data_demissao` vencida barra no `/api/auth/login`) |
| Folha de salário | fora — `gerarFolha` ignora quem tem demissão vencida |
| Escala | fora — turnos desativados, pessoa não aparece na grade |
| Espelho de ponto (RH) | fora da lista da equipe |
| Falta automática | não gera (`lib/faltas.ts` já respeitava a data) |
| Salário e vale-transporte | zerados no cadastro |
| Histórico (vendas, ponto, banco de horas, salários pagos) | **fica** |
| Cadastro em `pessoas` | **fica** — vira cliente se ainda deve fiado |

## Como se desliga (um ato, não seis)

Tela **Usuários → pessoa → Data de demissão**, e salvar. É só isso.

O que o app faz na hora de salvar, quando a data é **até hoje**
(`lib/vinculo.ts` → `vinculoEncerrado`):

- `ativo = false`
- `salario = 0` e `clt_vale_transporte = 0`
- escalas do perfil com `ativo = false`
- a grade de horários do formulário **não** é recriada

Antes disso, desligar era uma sequência manual (marcar a data, desmarcar ativo,
zerar salário, zerar vale, apagar a escala) que ninguém garantia: esqueceu um
passo e o desligado continuava entrando na folha.

## Recontratação

Apagar a data de demissão, marcar **ativo** e salvar de novo a grade de
horários. O histórico volta com a pessoa — nada foi perdido.

## Data futura (aviso prévio)

Demissão com data à frente **não** desliga: a pessoa continua trabalhando e
entrando na folha até a data. Quando o dia chega, as telas de escala e RH já a
ignoram pela data, e o login barra, mesmo que ninguém abra o cadastro de novo.

## Vínculos sem data de demissão

- **MEI** usa `data_contrato_fim` (fim do contrato de serviço), que não é
  desligamento — o contrato é renovado todo mês. Quem para de prestar serviço é
  desativado no campo "ativo".
- **Autônomo (RPA)** só tem início de combinado, sem fim.

## Onde isso mora no código

- `lib/vinculo.ts` — `vinculoEncerrado(data, hoje)`, a regra única.
- `app/painel/usuarios/actions.ts` — `atualizarPerfil` aplica o desligamento.
- `app/painel/financeiro/actions.ts` — `gerarFolha` não gera pra desligado.
- `app/painel/escala/page.tsx` e `app/painel/rh/page.tsx` — fora da lista.
- `lib/faltas.ts` — não gera falta pra quem já saiu.
- `app/painel/lembretes/actions.ts` — pagamento recorrente não lança pra desligado.
- `lib/contabilidade.ts` — folha do DRE sem desligado.
- `app/api/auth/login/route.ts` — barra o login.
- Teste: `test/logica.test.ts`, casos "vinculo:".

---

# Ponto e horas: um caminho, e o que muda por vínculo

## Um caminho só para bater ponto

Existe **um** jeito de bater ponto: o RPC `bater_ponto`
(`supabase/migrations/2026-11-12-ponto-um-caminho-so.sql`). O widget do painel
("Iniciar/Parar") e a tela Meu Perfil chamam a mesma função — a regra não é uma
por tela.

O RPC:

- valida a **sequência** (o estado é sempre a última batida do dia em São Paulo):

  | Batida | Só passa se |
  |---|---|
  | entrada | está fora (nenhuma batida no dia, ou a última é saída) |
  | pausa | está em operação (última é entrada ou retorno) |
  | retorno | está na pausa (última é pausa) |
  | saída | está em operação ou na pausa |

- trava **clique duplo** com `pg_advisory_xact_lock` por usuário. Duas abas
  clicando "entrada" juntas gravavam duas entradas (bug de 25/08) — a segunda
  agora espera e responde "Você já está em operação."

Depois de uma saída bem-sucedida, `lib/ponto-do-dia.ts` (`aposBatida`) fecha o
dia: dobra de feriado (×2) e recálculo do banco de horas
(trabalhado − escalado). **Antes isso só acontecia pelo Meu Perfil** — quem saía
pelo widget do painel perdia o atraso/hora extra do dia.

Verificação rodável: `node scripts/teste-ponto-sequencia.mjs` (usa usuário de
mentira e apaga o que gravou).

## Conferência de horas (`RH → Conferência de horas`)

Uma linha por pessoa, por mês: **previsto** (soma da escala) · **trabalhado**
(soma dos blocos do ponto) · **diferença** · **saldo no banco de horas**.
Serve para combinar o valor do serviço e a cobertura do mês seguinte. Não paga,
não desconta, não gera dívida.

O dia que ficou aberto (entrou e não saiu) não conta como trabalhado — ele
aparece como **⚠ Sem saída** no espelho do dia.

## O que muda por vínculo

| Vínculo | Atraso | Falta | Hora extra | Dobra de feriado |
|---|---|---|---|---|
| CLT | sim | sim | sim | sim |
| Estágio | sim | sim | **não** (Lei 11.788/2008) | **não** |
| MEI | sim | sim | sim | sim |

**MEI no banco de horas é decisão do dono** (12/11/2026), não recomendação
técnica. O risco: hora extra, atraso e falta são institutos de CLT — registrados
para um MEI, funcionam como prova de controle de jornada em ação de
reconhecimento de vínculo. O dono optou por manter o controle de horas neste ano
e montar uma estrutura própria de MEI em 2027 (item 9 de
`docs/passagem-de-turno.md`). Quem for mexer nisso depois: a decisão é dele, e a
conferência de horas é o que ele usa no dia a dia.

## O que o RH apaga e o que ele não apaga

O recálculo do banco (`lib/banco-horas.ts`) apaga **só o que ele mesmo criou**:
`motivo in ('hora_extra','atraso')` **e** `criado_por is null`. O que o master
lança à mão (RH → Lançar hora) tem autor gravado e é preservado — antes, um
"Atraso" lançado à mão desaparecia na próxima saída da mesma pessoa no mesmo dia.
