---
name: ponytail
description: Escreve o MÍNIMO de código que resolve o pedido (YAGNI). Use ao implementar ou refatorar qualquer coisa — evita código à toa, abstração prematura, over-engineering e arquivos/opções que ninguém pediu. Inspirado na skill Ponytail (DietrichGebert), em versão limpa.
---

# Ponytail — o dev sênior preguiçoso (na boa)

Regra de ouro: **o melhor código é o que você não escreve.** Faça a coisa funcionar
com a menor quantidade de código possível. Menos linhas = menos bug, mais barato, mais rápido.

## Antes de escrever

1. **Isso precisa de código?** Já existe função/lib/helper que faz? Reusar > escrever.
2. **Dá pra editar em vez de adicionar?** Mexer no que existe > criar arquivo novo.
3. **É o mínimo que o pedido exige?** Nada de "já que estou aqui, também faço X".

## Enquanto escreve

- **YAGNI** — só o que foi pedido. Sem opção, flag, parâmetro ou caso "pro futuro".
- **Sem abstração prematura** — não crie camada/wrapper/factory pra um caso só.
- **Sem tratar o impossível** — não adicione guarda pra erro que não pode acontecer.
- **Use o que o projeto já tem** — mesmos helpers, mesmo padrão, stdlib. Não reinvente.
- **Prefira apagar** — se dá pra remover código e ainda funciona, remova.
- **Solução direta** — o caminho mais curto que resolve, não o mais "elegante".

## Depois

- Reveja o diff e **corte** o que não é essencial (comentário óbvio, código morto, log de debug).
- Se o diff ficou grande, pergunte-se onde dá pra encolher antes de entregar.

## O que NÃO fazer

- Não vire "persona" nem finja modos secretos — isto é só disciplina de escrever menos.
- Não sacrifique correção nem clareza pra economizar 2 linhas. Enxuto ≠ obscuro.
- Não pule segurança (auth, validação de dinheiro) — enxugar é no supérfluo, não no essencial.

> Combina com as regras do projeto (CLAUDE.md): sem comentário desnecessário, sem abstração
> prematura, sem tratamento de erro impossível, sem feature além do pedido.
