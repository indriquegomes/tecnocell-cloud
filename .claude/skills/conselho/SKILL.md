---
name: conselho
description: "Conselho de IAs — submete UMA pergunta a vários modelos Claude (Opus, Sonnet, Haiku, Fable) via subagentes, cada um dá sua opinião, eles se avaliam anonimamente, e um Chairman sintetiza a resposta final. Adaptação do llm-council (Karpathy) para o Claude Code. Use para decisões de peso: arquitetura, diagnóstico difícil, escolher entre caminhos, revisar uma ideia por vários ângulos."
trigger: /conselho
---

# /conselho — Conselho de IAs

Inspirado no [llm-council do Karpathy](https://github.com/karpathy/llm-council). Em vez de UMA opinião, você recebe várias e uma síntese honesta das concordâncias e divergências.

O llm-council original usa OpenRouter para chamar GPT-5.1, Gemini, Claude e Grok. Aqui a adaptação usa os **modelos Claude disponíveis via Agent tool** (Opus, Sonnet, Haiku, Fable) como os "conselheiros" — sem custo externo, dentro do seu Claude Code.

## Como usar

```
/conselho <sua pergunta ou decisão>
```

Exemplos:
- `/conselho devo adicionar deposito_id à tabela vendas agora ou deixar o fallback?`
- `/conselho qual a melhor forma de tornar a devolução transacional?`
- `/conselho revisar esta ideia: mover o cálculo de promoção para o RPC`

## Regras

- **Um assunto por vez.** O conselho delibera sobre UMA pergunta.
- **Custo/tempo:** cada rodada lança 3–4 subagentes. É mais caro e lento que uma resposta normal — use quando a decisão justifica.
- **Modelos são os conselheiros.** Se um modelo não estiver disponível, siga com os que houver (mínimo 2).
- Passe ao conselho **todo o contexto necessário** no prompt (arquivos, restrições, o que já foi tentado) — os subagentes começam do zero, não veem esta conversa.

## Fluxo (3 estágios)

### Estágio 1 — Primeiras opiniões
Lance os conselheiros **em paralelo** (todas as chamadas do Agent tool numa única mensagem), um por modelo, cada um com a MESMA pergunta e contexto:

- `Agent(subagent_type: "claude", model: "opus",  prompt: <pergunta + contexto + "Responda de forma direta e fundamentada, assumindo posição clara.">)`
- `Agent(subagent_type: "claude", model: "sonnet", prompt: <mesma>)`
- `Agent(subagent_type: "claude", model: "haiku",  prompt: <mesma>)`
- `Agent(subagent_type: "claude", model: "fable",  prompt: <mesma>)`

Colete as respostas. Rotule-as **anonimamente** como Conselheiro A, B, C, D (não revele qual modelo é qual ainda — evita viés na avaliação).

### Estágio 2 — Revisão cruzada
Lance outra rodada em paralelo. A cada conselheiro, dê as respostas dos OUTROS (anonimizadas, sem a dele) e peça:
> "Aqui estão respostas de outros conselheiros à mesma pergunta. Avalie precisão e profundidade de cada uma, aponte erros ou pontos fortes, e ranqueie da melhor para a pior. Seja crítico e específico."

Colete os rankings/críticas. (Se quiser economizar, este estágio é opcional — diga ao usuário que pulou.)

### Estágio 3 — Chairman
Você (modelo atual) age como Chairman. Com todas as opiniões + as revisões, produza a resposta final:

1. **Recomendação** — a resposta/decisão, clara e direta.
2. **Consenso** — no que os conselheiros concordaram.
3. **Divergências** — onde discordaram e por quê (isto costuma ser o mais valioso).
4. **Ressalvas** — riscos ou condições que mudam a recomendação.

No fim, revele quais modelos foram A/B/C/D, para o usuário calibrar confiança.

## Nota

Este conselho é de modelos da **mesma família (Claude)**, então tende a concordar mais que um conselho multi-provedor (GPT+Gemini+Grok). A divergência real vem mais das diferenças de tamanho/capacidade (Opus vs Haiku) e do estágio de revisão crítica. Para verdadeira diversidade de provedores, seria preciso o app original (llm-council) com OpenRouter — este é o equivalente prático dentro do Claude Code.
