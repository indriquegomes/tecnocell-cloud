# Bot de Atendimento WhatsApp

Dois bots moram aqui. **O que está no ar hoje (25/11) é o mínimo**: `pix.mjs`.

## `pix.mjs` — bot mínimo (o que roda agora)

Responde **uma coisa só**: quando o cliente pergunta do PIX, manda a chave da
loja (lida de `contas.chave_pix` da conta bancária daquela loja, cache de 10 min)
com o titular e o pedido de comprovante. **Qualquer outro assunto: silêncio.**
Sem IA, sem busca de produto, sem banco local, sem log de conversa — só o
WhatsApp e uma leitura no Supabase de vez em quando.

- Se o dono responder na mão na mesma conversa, o bot sai dela por **1 hora**.
- Sem chave cadastrada na conta da loja, ele **cala** (melhor que mandar errado).
- Teste da única lógica dele: `node --test bot-whatsapp/pix.test.mjs`.
- Continuar deste ponto é o caminho para crescer de novo: uma pergunta por vez.

## `run.mjs` — bot antigo (desligado)

O bot completo de preço/estoque com IA (`run.mjs` + `sessao.mjs` + `lib/`):
preço e disponibilidade, pedido com alerta no grupo, entrega, endereço, horário,
encomenda, pausa quando o dono responde. Continua no repositório e testado
(`node --test bot-whatsapp/lib/*.test.mjs`) — para voltar, troque o `script` no
`ecosystem.config.cjs`.

Atenção: `lib/info.mjs` tem endereço, horário e política de **Petrópolis**
escritos no código — ligar Teresópolis por aí responderia o endereço errado.

## Conectar o bot (o QR)

```
pm2 restart tecnocell-bot      # já está no ar pelo PM2; o QR aparece no log
```

O pareamento do WhatsApp dura ~2,5 min e o QR **troca a cada ~20 segundos**. Por
isso o bot grava sempre o QR novo como imagem em
`bot-whatsapp/data/qr_<loja>.png` e o log só avisa uma vez por minuto:

```
[petropolis] QR pronto pra escanear: ...\bot-whatsapp\data\qr_petropolis.png
```

Abra o PNG (ou a página `QR-bot-petropolis.html` no Desktop, que se atualiza
sozinha a cada 3 s) e escaneie: **WhatsApp da loja > Aparelhos conectados >
Conectar um aparelho**. Feito isso a sessão fica salva em
`bot-whatsapp/data/auth_<loja>/` e o QR não aparece mais.

Para testar depois de conectar: mande do seu celular, para o número da loja,
`qual o pix?` — tem que vir a chave. Depois mande `quanto custa a tela do g20?`
— tem que ficar em **silêncio** (é o bot mínimo: só PIX).

## Roteiro do bot antigo (preço/estoque)

**Primeiro teste com um celular separado, não usado por cliente nenhum.**
Comandos abaixo são PowerShell (terminal principal do projeto — os
equivalentes em bash não funcionam aqui):

```powershell
$env:BOT_WHATSAPP_TESTE = "1"
node bot-whatsapp/run.mjs
```

Escaneia o QR code que aparece no terminal com esse celular de teste
(WhatsApp → Aparelhos conectados → Conectar um aparelho) — o PNG e a página do
Desktop descritos acima valem igual.

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

## Rodar o bot antigo à mão

```
node bot-whatsapp/run.mjs
```

O bot antigo e o mínimo usam a mesma pasta de sessão (`auth_<loja>`) e o mesmo
`BOT_WHATSAPP_LOJA` do `ecosystem.config.cjs` — não rode os dois ao mesmo tempo
(dois vínculos na mesma credencial = WhatsApp troca o vínculo e pede QR).

**Teresópolis:** o bot mínimo já funciona nas duas lojas (a chave sai da conta
bancária da loja). O bot antigo **não**: `lib/info.mjs` tem endereço, horário e
política de Petrópolis no código.

## Scripts de teste manual (não tocam WhatsApp)

```
node bot-whatsapp/testa-produtos.mjs "termo de busca"   # busca real no Supabase
node bot-whatsapp/testa-ia.mjs                          # classificação real na DeepSeek
node bot-whatsapp/status.mjs                            # situação do bot (só lê)
```

## Rodando pelo PM2 (é assim que fica no PC da loja)

```
pm2 start ecosystem.config.cjs      # sobe o bot (Petrópolis)
pm2 restart tecnocell-bot           # depois de mexer no código
pm2 flush                            # limpa o log (o arquivo não encolhe sozinho)
pm2 logs tecnocell-bot --lines 50    # acompanhar
```

`ecosystem.config.cjs` está com `autorestart: false` e o vigia (`monitor.mjs`)
fora do PM2 de propósito: restart em série corrompia a sessão do WhatsApp. Se
cair, religue na mão e escaneie o QR uma vez.

Sem sessão salva (`data/auth_<loja>/` vazio), o bot fica tentando parear de 2 em
2 segundos, espaçando até 20s, e grava um aviso no log a cada 5 min. Ele **não
conecta sozinho** — alguém precisa abrir `data/qr_<loja>.png` e escanear.

## Onde fica o log e dados sensíveis

O log fica no PM2 (`C:\Users\usuario\.pm2\logs\tecnocell-bot-out.log` e
`-error.log`), com rotação do módulo `pm2-logrotate` (10 MB por arquivo, 5
arquivos, compactado) — antes o arquivo chegou a 725 MB porque cada QR virava
dezenas de linhas de desenho em caracteres.

`bot-whatsapp/data/bot-whatsapp.db` (SQLite, fora do git). Telefone gravado
truncado (só os 4 últimos dígitos) — nunca o número completo. Essa garantia
vale só pra esse log SQLite.

A pasta `bot-whatsapp/data/auth_<loja>/` (sessão do Baileys) é diferente:
grava um arquivo por contato nomeado com o JID completo — na prática, é
uma lista completa dos números de clientes que já mandaram mensagem. Não
tem como evitar, o Baileys precisa disso pra funcionar. Ela já está no
`.gitignore`, mas **não pode ir pra backup sincronizado** (OneDrive, Google
Drive, etc.) sem criptografia — é dado sensível de cliente.
