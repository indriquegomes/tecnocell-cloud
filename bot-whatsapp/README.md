# Bot de Atendimento WhatsApp (preço e estoque)

Responde automaticamente perguntas de preço/disponibilidade de produto no
WhatsApp das lojas. Qualquer outro assunto é ignorado — a pessoa continua
respondendo na mão, normalmente. Detalhe completo em
`docs/superpowers/specs/2026-08-20-whatsapp-ia-atendimento-design.md`.

## Antes de rodar num número real

**Primeiro teste com um celular separado, não usado por cliente nenhum:**

```
BOT_WHATSAPP_TESTE=1 node bot-whatsapp/run.mjs
```

Escaneia o QR code que aparece no terminal com esse celular de teste
(WhatsApp → Aparelhos conectados → Conectar um aparelho). Manda, desse
mesmo celular, pra ele mesmo (ou de outro número pra esse), o roteiro:

1. Pergunta direta com nome exato de um produto que existe no catálogo.
2. Pergunta com nome ambíguo (bate em mais de um produto).
3. Pergunta de produto que não existe.
4. Pergunta de produto que existe mas está sem estoque no depósito da loja.
5. Uma mensagem que não é sobre produto (ex: "oi", "vcs abrem que horas?")
   — confirma que o bot fica em silêncio, não responde nada.

Só depois de ver os 5 casos se comportando certo, conecta num número de
loja de verdade (sem a variável `BOT_WHATSAPP_TESTE`).

## Rodar de verdade (as duas lojas)

```
node bot-whatsapp/run.mjs
```

Primeira vez: aparecem dois QR codes, um por loja — escaneia cada um no
WhatsApp daquela loja. Depois disso a sessão fica salva em
`bot-whatsapp/data/auth_<loja>/` e não pede QR de novo (a não ser que
desconecte o aparelho no próprio celular).

## Scripts de teste manual (não tocam WhatsApp)

```
node bot-whatsapp/testa-produtos.mjs "termo de busca"   # busca real no Supabase
node bot-whatsapp/testa-ia.mjs                          # classificação real na Anthropic
```

## Onde fica o log

`bot-whatsapp/data/bot-whatsapp.db` (SQLite, fora do git). Telefone gravado
truncado (só os 4 últimos dígitos) — nunca o número completo.
