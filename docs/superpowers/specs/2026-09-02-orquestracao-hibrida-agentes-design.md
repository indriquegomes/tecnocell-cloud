# Orquestração híbrida de agentes

## Objetivo

Usar DeepSeek Harness como coordenador e delegar cada tarefa ao agente mais adequado, sem impedir exceções quando outro agente tiver melhor capacidade.

## Papéis

- DeepSeek: decompor tarefas, delegar, acompanhar e consolidar resultados.
- Codex: lógica, backend, TypeScript, Supabase, SQL, segurança e correções.
- Claude Code: ideias, arquitetura, regras de negócio e revisão crítica.
- Antigravity: frontend, usabilidade, testes visuais e Playwright.

## Fluxo

1. DeepSeek classifica a tarefa e escolhe o especialista padrão.
2. Mudanças sensíveis recebem revisão independente de outro agente.
3. DeepSeek compara resultados, resolve divergências e entrega resumo único.
4. O especialista pode mudar quando a tarefa exigir capacidade diferente.

## Segurança

- Nenhum agente altera dados reais, faz commit, push ou deploy sem autorização explícita.
- Testes destrutivos não rodam em produção.
- Antigravity usa sandbox e pede aprovação para comandos.
- Segredos e arquivos `.env` não entram em prompts nem relatórios.

## Critério de sucesso

Pedidos ao Harness são delegados conforme os papéis, revisados quando houver risco e retornam uma resposta consolidada sem duplicar trabalho.
