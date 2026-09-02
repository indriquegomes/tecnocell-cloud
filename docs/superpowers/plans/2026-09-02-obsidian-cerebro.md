# Obsidian Brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar vault Obsidian em memória central compartilhada dos agentes TecnoCell.

**Architecture:** Markdown nativo no vault, com índice central e registros temáticos. Instruções dos agentes exigem leitura antes e atualização depois. Git continua fonte do código.

**Tech Stack:** Obsidian Markdown, Git, arquivos de instrução dos agentes.

## Global Constraints

- Não armazenar senhas, tokens ou dados pessoais.
- Não apagar histórico.
- Código e banco vencem em conflito com nota.
- Não alterar produção, deploy ou Git remoto.

---

### Task 1: Estrutura e histórico

**Files:** vault `C:\Users\usuario\Documents\celebro tecnocell cloud`

- [ ] Criar índice e notas temáticas.
- [ ] Importar todos commits do Git.
- [ ] Registrar marcos conhecidos e índice dos documentos existentes.
- [ ] Verificar links e contagem do histórico.

### Task 2: Regra para todos agentes

**Files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `C:\Users\usuario\.dsh\AGENTS.md`

- [ ] Adicionar regra idêntica de consulta e atualização.
- [ ] Garantir proteção contra segredos e preservação do histórico.
- [ ] Verificar presença das instruções nos quatro arquivos.

### Task 3: Validação final

- [ ] Procurar padrões comuns de segredo nas notas novas.
- [ ] Confirmar índice, links, quantidade de commits e arquivos dos agentes.
- [ ] Revisar diff sem incluir alterações preexistentes do usuário.
