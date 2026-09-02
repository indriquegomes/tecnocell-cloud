# Orquestração Híbrida de Agentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor Codex, Claude Code e Antigravity ao DeepSeek Harness e aplicar roteamento híbrido com `/conselho` econômico.

**Architecture:** DeepSeek permanece agente principal. Provedores nativos Codex e Claude Code ficam no Host; ferramentas de delegação ficam em preset local copiado do preset `code`; Antigravity permanece plugin externo isolado por sandbox. Regras de roteamento ficam em `~/.dsh/AGENTS.md`.

**Tech Stack:** DeepSeek Harness, Codex CLI, Claude Code CLI, Antigravity CLI, YAML e Markdown.

## Global Constraints

- Não modificar código nem dados do TecnoCell.
- Não enviar segredos ou arquivos `.env` aos subagentes.
- Antigravity continua com `skipPermissions: false` e `sandbox: true`.
- Conselho rápido usa respostas de até 300 palavras.
- Conselho completo exige `/conselho completo` ou risco crítico.

---

### Task 1: Disponibilizar provedores oficiais

**Files:**
- Modify: `C:\Users\usuario\.dsh\profiles\web\package.json`
- Modify: `C:\Users\usuario\.dsh\profiles\web\pnpm-lock.yaml`

**Interfaces:**
- Produces: provedores Host `codex` e `claude-code`.

- [ ] **Step 1: instalar bundles oficiais**

```powershell
dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex @deepseek-ai/dsh-subagent-claude-code
```

Expected: ambos aparecem em `dependencies` e instalação termina sem erro.

- [ ] **Step 2: verificar CLIs nativos**

```powershell
Get-Command codex
Get-Command claude
```

Expected: dois executáveis encontrados.

### Task 2: Criar preset local híbrido

**Files:**
- Create: `C:\Users\usuario\.dsh\.agent-presets\tecnocell-hibrido\preset.yml`
- Create: `C:\Users\usuario\.dsh\.agent-presets\tecnocell-hibrido\agent.cordis.yml`
- Source: `C:\Users\usuario\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\config\agent-presets\code`

**Interfaces:**
- Consumes: provedores `codex` e `claude-code` da Task 1.
- Produces: ferramentas `subagent_codex` e `subagent_claude_code`.

- [ ] **Step 1: copiar preset `code` inteiro para `tecnocell-hibrido`**

Preservar todos os arquivos e alterar em `preset.yml`:

```yaml
name: TecnoCell híbrido
description: DeepSeek coordenando Codex, Claude Code e Antigravity.
```

- [ ] **Step 2: habilitar somente ferramentas pedidas**

Em `agent.cordis.yml`, remover `disabled: true` destas duas linhas existentes, sem alterar demais campos:

```yaml
- id: tool-subagent-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: codex
    toolName: subagent_codex
    backgroundMode: one-shot
    maxDepth: provider-managed

- id: tool-subagent-claude-code
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: claude-code
    toolName: subagent_claude_code
    backgroundMode: one-shot
    maxDepth: provider-managed
```

- [ ] **Step 3: selecionar preset**

Em `C:\Users\usuario\.dsh\settings.yaml`:

```yaml
agent-presets:
  default: tecnocell-hibrido
```

Expected: nova sessão usa preset `TecnoCell híbrido`.

### Task 3: Definir roteamento e `/conselho`

**Files:**
- Modify: `C:\Users\usuario\.dsh\AGENTS.md`

**Interfaces:**
- Consumes: `subagent_codex`, `subagent_claude_code` e `antigravity`.
- Produces: política textual aplicada a toda sessão Harness.

- [ ] **Step 1: adicionar política**

```markdown
## Orquestração TecnoCell

- DeepSeek coordena, evita trabalho duplicado e consolida respostas.
- Use `subagent_codex` para lógica, backend, TypeScript, Supabase, SQL, segurança e correções.
- Use `subagent_claude_code` para ideias, arquitetura, regras de negócio e revisão crítica.
- Use `antigravity` para frontend, usabilidade, testes visuais e Playwright.
- Mudança financeira, estoque, caixa, autenticação ou banco exige revisão independente por outro agente.
- Nenhum subagente altera produção, dados reais, Git remoto ou deploy sem autorização explícita.

### /conselho econômico

- Ative somente quando usuário escrever `/conselho` ou houver risco crítico.
- Primeira rodada: Codex, Claude e Antigravity em paralelo; máximo 300 palavras cada; somente contexto relevante.
- Com duas respostas concordantes e baixo risco, sintetize e encerre.
- Com divergência ou alto risco, peça segunda rodada somente aos agentes discordantes.
- `/conselho completo` executa revisão cruzada completa.
- Resposta final: recomendação, consenso, divergências, riscos e próximo passo.
```

### Task 4: Reiniciar e verificar

**Files:**
- Verify: `C:\Users\usuario\.dsh\settings.yaml`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: Harness operacional com três especialistas.

- [ ] **Step 1: reiniciar Harness**

```powershell
npx --yes @deepseek-ai/dsh web --no-open
```

Expected: `dsh web: http://127.0.0.1:3080` sem erro de plugin.

- [ ] **Step 2: testar cada agente sem escrita**

Enviar uma tarefa curta para Codex, Claude e Antigravity pedindo resposta literal `OK`, sem ferramentas e sem alteração de arquivos.

Expected: três respostas `OK`.

- [ ] **Step 3: testar conselho econômico**

```text
/conselho Responda apenas se 2 + 2 = 4. Não altere arquivos.
```

Expected: resposta consolidada; nenhuma segunda rodada quando houver consenso.
