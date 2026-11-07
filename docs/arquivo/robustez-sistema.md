# 🛡️ Mapa de Robustez — TecnoCell

> O que pode quebrar/corromper o sistema, o que **já** nos protege hoje, e o que dá pra
> reforçar. Feito pra entender sem ser técnico. Levantado no código real em 29/07/2026.

**Legenda:** 🟢 bem protegido · 🟡 atenção (hábito/config) · 🔴 ponto fraco a cuidar

---

## O que pode quebrar — e como estamos

### ⚡ Duas pessoas ao mesmo tempo — 🟢 Protegido
- **O que é:** duas atendentes vendendo/devolvendo/mexendo no estoque no mesmo segundo — o medo de "contar dobrado" ou embaralhar.
- **O que já protege:** as operações de dinheiro rodam em **transação atômica** (tudo ou nada) e com **trava de linha** (uma espera a outra). São **20 arquivos** com essa trava + RPCs atômicos (venda, devolução, cancelamento, estoque).
- **Reforço:** já é forte. Manter esse padrão em toda função nova de dinheiro.

### 🔑 Sessão / senha de identificação — 🟢 Protegido
- **O que é:** ter que ficar relogando, ou a sessão vencer no meio de uma venda.
- **O que já protege:** a sessão **se renova sozinha** por trás (Supabase). Raramente precisa digitar a senha. Toda escrita passa por **207 checagens** de "quem é e pode?".
- **Reforço:** se um dia deslogar demais = cookie perdido; dá pra ajustar a validade.

### 🗂️ Cache / dado velho na tela — 🟢 Protegido
- **O que é:** a tela mostrar um número antigo depois que alguém mudou algo.
- **O que já protege:** depois de cada escrita, o sistema **manda atualizar a tela** (em **28 arquivos**). O que aparece é o do banco, não cópia velha.
- **Reforço:** só o *seu PC de desenvolvimento* às vezes trava (limpar a pasta `.next`). Em produção não afeta ninguém.

### 💰 Dinheiro / dado corrompido — 🟢 Protegido
- **O que é:** venda gravar pela metade, estoque errado, dinheiro "sumir".
- **O que já protege:** venda, devolução e estoque são **tudo-ou-nada**: falhou no meio, **desfaz o conjunto** (sem venda órfã). E agora o **log de atividade** grava quem fez o quê.
- **Reforço:** backup automático (abaixo) é a rede final.

### 🚀 Deploy quebrar (subir versão nova) — 🟡 Atenção
- **O que é:** subir atualização e o site cair. O bug mais traiçoeiro daqui: **funciona no PC, quebra na Vercel**.
- **O que já protege:** hábito de rodar **build** e revisar antes de subir + confirmar "READY" na Vercel.
- **Reforço:** um arquivo esquecido (não commitado) quebra o build → **build obrigatório antes de aceitar a subida (CI)**.

### 🔇 Erro silencioso (tela vazia) — 🟡 Atenção
- **O que é:** um erro acontecer e o sistema não avisar — mostra "nada encontrado" como se estivesse vazio.
- **O que já protege:** **122 checagens** explícitas de erro no código.
- **Reforço:** um **monitor de erros** que te avisa no celular quando quebra, em vez de descobrir pela Isa.

---

## O que dá pra reforçar — o básico que blinda de vez

| # | O quê | Pra quê | Prioridade |
|---|---|---|---|
| 1 | **Backup automático do banco** | Cópia diária + "voltar no tempo" (Supabase). Se corromper de vez, restaura. Rede de segurança nº 1. | 🔴 Alta |
| 2 | **Build obrigatório antes de subir (CI)** | GitHub roda a build sozinho; se falhar, não deixa subir. Mata o "esqueci um arquivo". | 🔴 Alta |
| 3 | **Monitor de erros com alerta** | Ferramenta (ex: Sentry) te avisa na hora que uma tela quebra, com o motivo. | 🟡 Média |
| 4 | **Ambiente de teste (preview)** | Testar numa cópia antes do ar. A Vercel já cria de graça por link. | 🟡 Média |
| 5 | **Checador de "site no ar" (uptime)** | Robô que abre o site de tempo em tempo e avisa se cair. Grátis (ex: UptimeRobot). | 🟡 Média |
| 6 | **Log de atividade (câmera de segurança)** | Grava quem fez cada venda/devolução/caixa. **Ligado hoje** — falta a tela pra ler. | 🟢 Ligado |

---

**Resumo:** o coração (dinheiro/estoque) já é sólido. Os reforços **#1 (backup)** e **#2 (CI de build)**
são os que mais evitam susto — e são "arroz com feijão" que toda loja séria faz.
