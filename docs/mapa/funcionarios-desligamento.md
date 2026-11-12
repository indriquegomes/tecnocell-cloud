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
- `app/api/auth/login/route.ts` — barra o login.
- Teste: `test/logica.test.ts`, casos "vinculo:".
