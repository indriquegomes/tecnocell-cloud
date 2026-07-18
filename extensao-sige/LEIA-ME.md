# Espelho do SIGE — extensão de navegador

Registra o que acontece nas telas do SIGE na máquina de quem está usando, e manda pro
Supabase do TecnoCell. Serve pra duas coisas:

1. **Entender a operação** — quais telas as meninas usam, em que ordem, onde travam
2. **Replicar aqui** — as chamadas de API capturadas trazem o dado exato que o SIGE
   grava numa venda; é isso que o espelho precisa pra reproduzir fielmente

## Instalar (5 min, por máquina)

1. Abrir `chrome://extensions` no Chrome
2. Ligar **Modo do desenvolvedor** (canto superior direito)
3. **Carregar sem compactação** → escolher esta pasta (`extensao-sige`)
4. Clicar em **Detalhes → Opções da extensão** e preencher:
   - **Nome da máquina** — ex.: `balcao-1-petropolis` (aparece em cada registro)
   - **URL do Supabase** e **chave anon** — as mesmas do `.env.local`
5. Recarregar as abas do SIGE que já estiverem abertas

Pra conferir se está funcionando: usar o SIGE por um minuto e rodar

```sql
select tipo, rota, alvo, ocorreu_em from eventos_sige order by ocorreu_em desc limit 20;
```

## O que é capturado

| tipo | o quê |
|---|---|
| `clique` | texto do botão/campo, tela, quem estava logado |
| `rota` | troca de tela |
| `api` | endpoint, método, corpo enviado, resposta, status |

## O que NÃO é capturado

- **Senha e token** — filtrados por nome de campo antes de sair da máquina
- **Consultas de leitura** (listagens, polling, refresh) — só ruído
- **Arquivos** (js/css/imagens)
- Corpo acima de 20 KB vira resumo (planilha inteira não trafega)

## Cuidados

- A **chave anon** vai ficar na máquina da loja. A tabela `eventos_sige` só aceita
  INSERT por essa chave — não dá pra ler nem apagar nada com ela.
- Se a internet cair, os eventos ficam na fila (até 500) e sobem quando voltar.
- **Avise a equipe.** Monitorar ferramenta de trabalho é legal, mas descobrir por
  acidente destrói confiança — e a migração depende da colaboração delas.

## Limite conhecido

O SIGE roda em Angular; o texto do botão vem do DOM. Se eles mudarem a interface, o
campo `alvo` pode ficar vazio — as chamadas de `api` continuam funcionando, porque
dependem de fetch/XHR, não do visual.
