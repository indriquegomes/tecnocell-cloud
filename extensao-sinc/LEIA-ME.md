# Extensão de captura do SIGE (modo sombra) — A1a

Registra as chamadas de API que o SIGE faz (incl. as de ESCRITA) e envia pra fila
de sincronização do TecnoCell (/api/sinc/eventos). Serve pra descobrir os endpoints
de escrita (Fase 0) e, depois, virar o "motor" de captura em tempo real.

## Instalar (por máquina da loja)

1. chrome://extensions → ligar "Modo do desenvolvedor".
2. "Carregar sem compactação" → escolher esta pasta (extensao-sinc).
3. Clicar em "Opções da extensão" e preencher:
   - Loja: o mesmo id usado na credencial (ex.: PETROPOLIS).
   - Chave: gerada por `node scripts-sinc/gerar-credencial.mjs "LOJA"`.
   - URL: `https://tecnocell-cloud.vercel.app` (ou localhost pra dev).
4. Recarregar as abas do SIGE já abertas.

## O que envia

Cada chamada de API do SIGE (endpoint, método, corpo, status, resposta) vira um
evento na tabela sinc_inbox com entidade='api', acao='capturado'. Senha/token são
filtrados antes de sair da máquina. O worker (fase posterior) classifica cada
endpoint na entidade/ação certa.

## Ver

```sql
select entidade, acao, payload->>'rota', recebido_em from sinc_inbox order by recebido_em desc limit 20;
```
