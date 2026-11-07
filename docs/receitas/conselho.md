# Receita — Conselho de IAs (`/conselho`)

Opiniões independentes de provedores **diferentes**, e o coordenador (DeepSeek)
entrega uma decisão única. Uma opinião só raramente é o que se quer numa decisão
de peso.

**Versão oficial:** multi-provedor (Codex + Claude Code + Antigravity). A versão
antiga, só com modelos Claude, foi aposentada — não usá-la.

## Quando ativar

Só quando o dono escrever `/conselho` ou em risco crítico (decisão de
arquitetura, diagnóstico difícil, regra de negócio, segurança, financeiro,
caminhos de implementação concorrentes).

## Rodada inicial

Enviar **em paralelo** a mesma pergunta e somente o contexto relevante para:

- `subagent_codex` — lógica, backend, TypeScript, Supabase, SQL, segurança.
- `subagent_claude_code` — arquitetura, ideias, regras de negócio, revisão
  crítica.
- `antigravity` — frontend, usabilidade, testes visuais, Playwright.

Cada prompt é **autossuficiente** (o subagente não vê esta conversa), pede
posição clara em até 300 palavras e **proíbe alterar arquivo ou sistema
externo**. Se um provedor falhar, seguir com no mínimo dois e avisar qual faltou.

## Decisão econômica

- Dois ou mais concordando e tema sem risco crítico → encerrar após a primeira
  rodada.
- Divergência relevante, ou risco em financeiro/estoque/caixa/autenticação/
  segurança/banco → segunda análise **somente** com os agentes discordantes.
- `/conselho completo` → todos recebem as respostas anônimas dos demais, fazem
  revisão cruzada e classificam as opções.

Não repetir leitura do repositório entre agentes: incluir no prompt trechos e
fatos já levantados pelo coordenador.

## Resposta final (nesta ordem)

1. **Recomendação**
2. **Consenso**
3. **Divergências**
4. **Riscos**
5. **Próximo passo**

Identificar quais provedores participaram. **Não inventar** participação nem
consenso. Mudança em financeiro/estoque/caixa/banco/autenticação que sair daqui
continua exigindo revisão independente e a palavra-chave do dono (seção 2 do
`AGENTS.md`).
