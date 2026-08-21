# Bot de Atendimento WhatsApp (preço e estoque)

Responde automaticamente perguntas de preço/disponibilidade de produto no
WhatsApp das lojas. Qualquer outro assunto é ignorado — a pessoa continua
respondendo na mão, normalmente. Detalhe completo em
`docs/superpowers/specs/2026-08-20-whatsapp-ia-atendimento-design.md`.

Precisa de `DEEPSEEK_API_KEY` configurada no `.env.local` — sem ela o
processo falha na inicialização com erro claro (não sobe silencioso sem
funcionar).

## Antes de rodar num número real

**Primeiro teste com um celular separado, não usado por cliente nenhum.**
Comandos abaixo são PowerShell (terminal principal do projeto — os
equivalentes em bash não funcionam aqui):

```powershell
$env:BOT_WHATSAPP_TESTE = "1"
node bot-whatsapp/run.mjs
```

Escaneia o QR code que aparece no terminal com esse celular de teste
(WhatsApp → Aparelhos conectados → Conectar um aparelho).

**Se o QR do terminal não escanear** (letras/caracteres de terminal
distorcem a leitura pela câmera com frequência), use o script abaixo em
vez do `run.mjs` — ele salva o QR como imagem PNG, bem mais confiável de
escanear:

```powershell
node bot-whatsapp/testa-qr.mjs
```

Abre o arquivo `bot-whatsapp/data/qr_<loja>.png` gerado e escaneia normal.
O terminal avisa "conectado" e encerra sozinho — depois disso já pode
rodar o `run.mjs` de verdade, a sessão salva já fica valendo.

Manda, desse mesmo celular, pra ele mesmo (ou de outro número pra esse), o roteiro:

1. Pergunta direta com nome exato de um produto que existe no catálogo.
2. Pergunta com nome ambíguo (bate em mais de um produto).
3. Pergunta de produto que não existe.
4. Pergunta de produto que existe mas está sem estoque no depósito da loja.
5. Uma mensagem que não é sobre produto (ex: "oi", "vcs abrem que horas?")
   — confirma que o bot fica em silêncio, não responde nada.
6. **Grupo:** manda a mesma pergunta de preço num grupo que tenha esse
   número de teste — confirma que o bot fica em silêncio também aí (é a
   garantia mais importante do spec inteiro: o bot nunca responde em grupo).

Notas sobre comportamento esperado (não é bug, não precisa "resolver"):

- **Foto:** o bot não lê legenda de imagem (`imageMessage.caption`), só
  texto puro. Se mandar foto + "quanto custa consertar essa tela?" junto,
  não vem resposta — é assim mesmo, por design.
- **Mensagens em sequência rápida:** duas mensagens muito próximas no tempo
  do mesmo cliente podem gerar duas respostas concorrentes. Comportamento
  conhecido, não trava o uso.

Só depois de ver os 6 casos se comportando certo, conecta num número de
loja de verdade (sem a variável `BOT_WHATSAPP_TESTE`).

**Antes de ir pra produção nessa mesma janela de terminal**, limpa a
variável de teste — ela persiste pelo resto da sessão do PowerShell, então
rodar só `node bot-whatsapp/run.mjs` depois do teste continuaria em modo
teste sem avisar, e pareceria que as duas lojas conectaram quando só uma
sessão de teste subiu:

```powershell
Remove-Item Env:BOT_WHATSAPP_TESTE
```

Ou simplesmente abre um terminal novo.

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
node bot-whatsapp/testa-ia.mjs                          # classificação real na DeepSeek
```

## Onde fica o log e dados sensíveis

`bot-whatsapp/data/bot-whatsapp.db` (SQLite, fora do git). Telefone gravado
truncado (só os 4 últimos dígitos) — nunca o número completo. Essa garantia
vale só pra esse log SQLite.

A pasta `bot-whatsapp/data/auth_<loja>/` (sessão do Baileys) é diferente:
grava um arquivo por contato nomeado com o JID completo — na prática, é
uma lista completa dos números de clientes que já mandaram mensagem. Não
tem como evitar, o Baileys precisa disso pra funcionar. Ela já está no
`.gitignore`, mas **não pode ir pra backup sincronizado** (OneDrive, Google
Drive, etc.) sem criptografia — é dado sensível de cliente.
