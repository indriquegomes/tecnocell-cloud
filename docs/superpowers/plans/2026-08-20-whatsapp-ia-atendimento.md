# IA de Atendimento no WhatsApp (preço e estoque) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um bot local (um processo por loja) que responde perguntas de preço/estoque no WhatsApp automaticamente, usando o catálogo real do TecnoCell, e ignora qualquer outro assunto.

**Architecture:** Pasta nova `bot-whatsapp/`, irmã de `bot/` (bot de comprovantes que já existe), mesmo padrão: processo Node local com `.mjs`, não Vercel. Cada mensagem individual recebida passa por uma classificação com Claude Haiku ("é pergunta de produto? qual?"); se for, busca no Supabase (mesma lógica de busca sem acento já usada no painel) e responde; se não for, o bot ignora e não loga nada.

**Tech Stack:** Node 24 (`node:sqlite` nativo), `@whiskeysockets/baileys` (WhatsApp via QR code), `@anthropic-ai/sdk` (já é dependência), `@supabase/supabase-js` (já é dependência, cliente direto — não o `lib/supabase/server.ts`, que depende de `next/headers` e só funciona dentro do Next.js).

**Spec:** `docs/superpowers/specs/2026-08-20-whatsapp-ia-atendimento-design.md`

## Global Constraints

- Escopo da IA: só preço e disponibilidade de produto. Qualquer outra mensagem é ignorada (sem resposta, sem log).
- Nunca chuta: 0 ou 2+ produtos encontrados → pergunta de volta, nunca envia preço.
- Estoque consultado é sempre o depósito **LOJA** de cada unidade: Petrópolis `63d9054d59a9c829747233d4`, Teresópolis `63e4dc8ede713ef765366d69`.
- Só conversa individual (`@s.whatsapp.net`) — nunca grupo (`@g.us`), nunca mensagem própria (`key.fromMe`).
- Primeira resposta automática de cada conversa, em cada dia, inclui aviso de que é um assistente automático.
- Atraso antes de responder (não instantâneo) — reduz padrão de bot.
- Log local trunca o telefone (só os 4 últimos dígitos) — nunca grava o número completo.
- Pasta de sessão do WhatsApp e banco de log ficam fora do git.
- Nenhuma credencial nova: reaproveita `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, já em `.env.local`.
- Este projeto não usa suíte de teste automatizada para os scripts `.mjs` (ver `bot/testa.mjs`) — cada task usa `node --test` só pra função pura sem I/O, e script de teste manual (rodável, não no CI) pra qualquer coisa que toque rede/banco/WhatsApp de verdade.

---

### Task 1: Dependências e gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `@whiskeysockets/baileys` e `qrcode-terminal` instalados. Consumido pela Task 6.

- [ ] **Step 1: Instalar as dependências**

Baileys tem uma versão `7.0.0-rc14` como `latest` no npm (release candidate, não estável) — usar a tag `legacy`, que é a `6.7.24` estável.

`pino` é dependência do próprio Baileys (logger que o `makeWASocket` exige) —
instalar explícito em vez de confiar que fica disponível por carona.

```bash
npm install @whiskeysockets/baileys@6.7.24 qrcode-terminal pino
```

- [ ] **Step 2: Adicionar ao `.gitignore`**

Abrir `.gitignore` e acrescentar, se ainda não houver uma seção pro bot novo:

```gitignore
# bot-whatsapp: sessão do WhatsApp e banco de log local — nunca versionar
bot-whatsapp/data/
```

- [ ] **Step 3: Conferir instalação**

Run: `node -e "require('@whiskeysockets/baileys'); console.log('ok')"`

Isso vai falhar porque o pacote é ESM puro (sem `require`) — é esperado. O teste real de que a dependência está correta:

Run: `node --input-type=module -e "import('@whiskeysockets/baileys').then(() => console.log('ok'))"`
Expected: imprime `ok`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "Adiciona dependencias do bot de WhatsApp (baileys, qrcode-terminal)"
```

---

### Task 2: Log local em SQLite

**Files:**
- Create: `bot-whatsapp/lib/db.mjs`
- Test: `bot-whatsapp/lib/db.test.mjs`

**Interfaces:**
- Consumes: `node:sqlite` (nativo, sem dependência).
- Produces: `export function registraTroca(t)` onde `t = { loja, telefoneTruncado, pergunta, produtoBuscado, resultado, resposta }` (`resultado` é uma das strings `'respondido' | 'pediu_esclarecimento' | 'ignorado'`); `export function jaAvisouHoje(loja, telefoneTruncado): boolean`; `export function marcaAvisoHoje(loja, telefoneTruncado): void`. Consumido pela Task 6.

- [ ] **Step 1: Escrever o teste**

```js
// bot-whatsapp/lib/db.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DB_TESTE = path.join(process.cwd(), 'bot-whatsapp', 'data', 'teste.db')
fs.rmSync(DB_TESTE, { force: true })
process.env.BOT_WHATSAPP_DB = DB_TESTE

const { registraTroca, jaAvisouHoje, marcaAvisoHoje } = await import('./db.mjs')

test('registraTroca grava e nao derruba com campos ausentes', () => {
  registraTroca({ loja: 'petropolis', telefoneTruncado: '1234', pergunta: 'tem tela do note 12?', produtoBuscado: 'tela note 12', resultado: 'respondido', resposta: 'Sim, temos! R$ 120,00' })
  registraTroca({ loja: 'petropolis', telefoneTruncado: '5678', pergunta: 'oi', produtoBuscado: null, resultado: 'ignorado', resposta: null })
})

test('aviso do dia: comeca falso, marca, vira verdadeiro, nao mistura loja/telefone', () => {
  assert.equal(jaAvisouHoje('petropolis', '1234'), false)
  marcaAvisoHoje('petropolis', '1234')
  assert.equal(jaAvisouHoje('petropolis', '1234'), true)
  assert.equal(jaAvisouHoje('petropolis', '9999'), false)
  assert.equal(jaAvisouHoje('teresopolis', '1234'), false)
})

fs.rmSync(DB_TESTE, { force: true })
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test bot-whatsapp/lib/db.test.mjs`
Expected: FAIL — `db.mjs` ainda não existe.

- [ ] **Step 3: Escrever `bot-whatsapp/lib/db.mjs`**

```js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
fs.mkdirSync(DIR, { recursive: true })
const CAMINHO_DB = process.env.BOT_WHATSAPP_DB || path.join(DIR, 'bot-whatsapp.db')

const db = new DatabaseSync(CAMINHO_DB)
db.exec('pragma journal_mode = WAL; pragma busy_timeout = 5000;')
db.exec(`
create table if not exists conversas (
  id integer primary key autoincrement,
  loja text not null,
  telefone_truncado text not null,
  pergunta text not null,
  produto_buscado text,
  resultado text not null,
  resposta text,
  criado_em text not null default (datetime('now'))
);
create index if not exists ix_conv_loja_tel on conversas (loja, telefone_truncado);

create table if not exists avisos_diarios (
  loja text not null,
  telefone_truncado text not null,
  dia text not null,
  primary key (loja, telefone_truncado, dia)
);
`)

const q = (sql) => db.prepare(sql)
const diaHoje = () => new Date().toISOString().slice(0, 10)

export function registraTroca(t) {
  q(`insert into conversas (loja, telefone_truncado, pergunta, produto_buscado, resultado, resposta)
     values (?, ?, ?, ?, ?, ?)`)
    .run(t.loja, t.telefoneTruncado, t.pergunta, t.produtoBuscado ?? null, t.resultado, t.resposta ?? null)
}

export const jaAvisouHoje = (loja, telefoneTruncado) =>
  !!q('select 1 from avisos_diarios where loja=? and telefone_truncado=? and dia=?')
    .get(loja, telefoneTruncado, diaHoje())

export const marcaAvisoHoje = (loja, telefoneTruncado) =>
  q('insert or ignore into avisos_diarios (loja, telefone_truncado, dia) values (?, ?, ?)')
    .run(loja, telefoneTruncado, diaHoje())
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test bot-whatsapp/lib/db.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add bot-whatsapp/lib/db.mjs bot-whatsapp/lib/db.test.mjs
git commit -m "Adiciona log local do bot de WhatsApp"
```

---

### Task 3: Busca de produto e estoque no Supabase

**Files:**
- Create: `bot-whatsapp/lib/produtos.mjs`
- Create: `bot-whatsapp/testa-produtos.mjs` (script manual, não roda em CI — mesmo padrão de `bot/testa.mjs`)

**Interfaces:**
- Consumes: `@supabase/supabase-js` (`createClient`, já é dependência do projeto); env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `export async function buscaProdutos(termo)` → `{ id: string, nome: string, preco: number }[]` (até 5, só `ativo=true`); `export async function buscaEstoque(produtoId, depositoId)` → `number` (quantidade, 0 se não achar linha). Consumido pela Task 6.

Não usa `lib/supabase/server.ts` — aquele módulo importa `next/headers`, que só funciona dentro de uma requisição do Next.js. Aqui é processo Node solto, então o cliente Supabase é criado direto com a service role key (mesmo par de credenciais, sem o wrapper do Next).

- [ ] **Step 1: Escrever `bot-whatsapp/lib/produtos.mjs`**

```js
import { createClient } from '@supabase/supabase-js'
import { env } from '../../bot/lib/env.mjs'

const supabase = createClient(
  env('NEXT_PUBLIC_SUPABASE_URL'),
  env('SUPABASE_SERVICE_ROLE_KEY'),
)

// Mesma lógica de app/painel/tabelas-preco/actions.ts (buscarProdutosParaTabela):
// tira acento via charCodeAt, ilike em busca_norm por palavra, com fallback pra
// nome/codigo se a coluna não existir (banco sem a migration que a criou).
function semAcento(t) {
  return t.normalize('NFD').split('').filter((c) => { const n = c.charCodeAt(0); return n < 768 || n > 879 }).join('').toLowerCase()
}

export async function buscaProdutos(termo) {
  const t = (termo || '').trim()
  if (!t) return []
  const palavras = semAcento(t).replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)
  if (palavras.length === 0) return []

  let q = supabase.from('produtos').select('id, nome, preco').eq('ativo', true)
  for (const w of palavras) q = q.ilike('busca_norm', `%${w}%`)
  let { data, error } = await q.order('nome').limit(5)

  if (error && (error.code === '42703' || error.message?.includes('busca_norm'))) {
    let f = supabase.from('produtos').select('id, nome, preco').eq('ativo', true)
    for (const w of palavras) f = f.or(`nome.ilike.%${w}%,codigo.ilike.%${w}%`)
    ;({ data } = await f.order('nome').limit(5))
  }

  return (data ?? []).map((p) => ({ id: p.id, nome: p.nome, preco: p.preco ?? 0 }))
}

export async function buscaEstoque(produtoId, depositoId) {
  const { data } = await supabase
    .from('estoque')
    .select('quantidade')
    .eq('produto_id', produtoId)
    .eq('deposito_id', depositoId)
    .maybeSingle()
  return data?.quantidade ?? 0
}
```

- [ ] **Step 2: Escrever o script de teste manual**

```js
// bot-whatsapp/testa-produtos.mjs
// Roda contra o Supabase de verdade. Uso: node bot-whatsapp/testa-produtos.mjs "termo de busca"
import { buscaProdutos, buscaEstoque } from './lib/produtos.mjs'

const DEPOSITO_PETROPOLIS_LOJA = '63d9054d59a9c829747233d4'

const termo = process.argv.slice(2).join(' ') || 'tela'
const produtos = await buscaProdutos(termo)
console.log(`Busca "${termo}": ${produtos.length} resultado(s)`)
for (const p of produtos) {
  const qtd = await buscaEstoque(p.id, DEPOSITO_PETROPOLIS_LOJA)
  console.log(`- ${p.nome} — R$ ${p.preco.toFixed(2)} — estoque Petrópolis: ${qtd}`)
}
```

- [ ] **Step 3: Rodar manualmente e conferir**

Run: `node bot-whatsapp/testa-produtos.mjs "tela"`
Expected: lista produtos reais do catálogo com preço e estoque plausíveis (compare com o que aparece em `/painel/produtos` no navegador pra um desses itens).

Run: `node bot-whatsapp/testa-produtos.mjs "produtoquenaoexistedejeitonenhum123"`
Expected: `0 resultado(s)`, sem erro.

- [ ] **Step 4: Commit**

```bash
git add bot-whatsapp/lib/produtos.mjs bot-whatsapp/testa-produtos.mjs
git commit -m "Adiciona busca de produto e estoque pro bot de WhatsApp"
```

---

### Task 4: Classificação da pergunta (Claude Haiku)

**Files:**
- Create: `bot-whatsapp/lib/ia.mjs`
- Create: `bot-whatsapp/testa-ia.mjs` (script manual)

**Interfaces:**
- Consumes: `@anthropic-ai/sdk` (já é dependência); `env` de `../../bot/lib/env.mjs`; `primeiroJson` de `../../bot/lib/util.mjs`.
- Produces: `export async function classificaPergunta(texto)` → `{ ehPerguntaProduto: boolean, textoBusca: string | null }`. Consumido pela Task 6.

- [ ] **Step 1: Escrever `bot-whatsapp/lib/ia.mjs`**

```js
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../bot/lib/env.mjs'
import { primeiroJson } from '../../bot/lib/util.mjs'

const ai = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), timeout: 15000, maxRetries: 2 })
const MODELO = env('BOT_WHATSAPP_MODELO', 'claude-haiku-4-5')

// Termina em "Mensagem do cliente: " de propósito — classificaPergunta() concatena
// o texto (via JSON.stringify, pra aspas dentro da mensagem do cliente não quebrar
// o prompt) na hora da chamada. NÃO usar template string com ${texto} aqui dentro:
// isso é uma constante de módulo, calculada uma vez só, antes de qualquer mensagem existir.
const PROMPT_BASE = `Mensagem de um cliente pra uma loja de celulares, recebida no WhatsApp.
Diga se é uma pergunta sobre PREÇO ou DISPONIBILIDADE (tem em estoque) de um
produto ou peça específico — ex: "quanto custa a tela do iphone 12", "vcs tem
bateria pra moto g54", "qual valor da capinha do redmi note 12".
NÃO é isso: reclamação, pergunta de horário/endereço, negociação de prazo,
conversa geral, cumprimento sem produto nenhum.
Responda SÓ JSON: {"eh_pergunta_produto": <true|false>, "texto_busca": "<como o
cliente descreveu o produto, nas palavras dele, sem traduzir pro nome oficial;
null se eh_pergunta_produto for false>"}

Mensagem do cliente: `

export async function classificaPergunta(texto) {
  const prompt = PROMPT_BASE + JSON.stringify(texto)
  const r = await ai.messages.create({
    model: MODELO,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })
  const j = primeiroJson(r.content.find((b) => b.type === 'text')?.text || '')
  if (!j) return { ehPerguntaProduto: false, textoBusca: null }
  return {
    ehPerguntaProduto: j.eh_pergunta_produto === true,
    textoBusca: j.eh_pergunta_produto === true ? (j.texto_busca || texto) : null,
  }
}
```

Repara no `PROMPT`: escrever a interpolação de string diretamente (com \`${texto}\`)
deixaria a mensagem do cliente colada sem escapar aspas, o que pode quebrar o
prompt se o cliente mandar `"` na mensagem. Por isso o texto entra via
`JSON.stringify(texto)` (sempre uma string JSON válida e escapada) no lugar do
placeholder — **não** monte o prompt com template string simples aqui.

- [ ] **Step 2: Escrever o script de teste manual**

```js
// bot-whatsapp/testa-ia.mjs
// Roda contra a API da Anthropic de verdade. Uso: node bot-whatsapp/testa-ia.mjs
import { classificaPergunta } from './lib/ia.mjs'

const casos = [
  'quanto custa a tela do iphone 12?',
  'vcs tem bateria pra moto g54',
  'vcs abrem que horas amanha?',
  'meu celular caiu na agua, conserta?',
  'oi',
  'e a tela daquele que eu perguntei ontem, chegou?',
]

for (const texto of casos) {
  const r = await classificaPergunta(texto)
  console.log(`"${texto}" ->`, r)
}
```

- [ ] **Step 3: Rodar manualmente e conferir**

Run: `node bot-whatsapp/testa-ia.mjs`
Expected: as duas primeiras frases (tela do iphone, bateria moto g54) vêm com
`ehPerguntaProduto: true` e um `textoBusca` fazendo sentido; as outras quatro
vêm `ehPerguntaProduto: false, textoBusca: null`. Se alguma vier diferente,
ajustar o `PROMPT` no Step 1 antes de seguir — é o comportamento mais
importante de todo o bot.

- [ ] **Step 4: Commit**

```bash
git add bot-whatsapp/lib/ia.mjs bot-whatsapp/testa-ia.mjs
git commit -m "Adiciona classificacao de pergunta de produto (Claude Haiku)"
```

---

### Task 5: Monta o texto da resposta

**Files:**
- Create: `bot-whatsapp/lib/resposta.mjs`
- Test: `bot-whatsapp/lib/resposta.test.mjs`

**Interfaces:**
- Produces: `export function montaResposta({ produtos, estoquePorId, comAviso })` → `string`, onde `produtos` é o array de `{ id, nome, preco }` devolvido por `buscaProdutos` (Task 3), `estoquePorId` é um `Map<string, number>` (produto id → quantidade), e `comAviso` (boolean) decide se prefixa o aviso de assistente automático. Consumido pela Task 6.

Função pura, sem rede/banco — é por isso que tem teste automatizado (`node --test`), diferente das tasks anteriores.

- [ ] **Step 1: Escrever o teste**

```js
// bot-whatsapp/lib/resposta.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { montaResposta } from './resposta.mjs'

test('um produto, com estoque', () => {
  const txt = montaResposta({
    produtos: [{ id: 'p1', nome: 'Tela iPhone 12', preco: 350 }],
    estoquePorId: new Map([['p1', 3]]),
    comAviso: false,
  })
  assert.match(txt, /Tela iPhone 12/)
  assert.match(txt, /R\$\s?350,00/)
  assert.doesNotMatch(txt, /sem estoque/i)
})

test('um produto, sem estoque', () => {
  const txt = montaResposta({
    produtos: [{ id: 'p1', nome: 'Tela iPhone 12', preco: 350 }],
    estoquePorId: new Map([['p1', 0]]),
    comAviso: false,
  })
  assert.match(txt, /sem estoque/i)
})

test('zero produtos', () => {
  const txt = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: false })
  assert.match(txt, /não encontrei/i)
})

test('mais de um produto: lista ate 3 e pergunta', () => {
  const produtos = [
    { id: 'p1', nome: 'Tela Redmi Note 12', preco: 200 },
    { id: 'p2', nome: 'Tela Redmi Note 12 Pro', preco: 260 },
    { id: 'p3', nome: 'Tela Redmi Note 12S', preco: 220 },
    { id: 'p4', nome: 'Tela Redmi Note 12 5G', preco: 240 },
  ]
  const txt = montaResposta({ produtos, estoquePorId: new Map(), comAviso: false })
  assert.match(txt, /Tela Redmi Note 12\b/)
  assert.match(txt, /Tela Redmi Note 12 Pro/)
  assert.match(txt, /Tela Redmi Note 12S/)
  assert.doesNotMatch(txt, /Tela Redmi Note 12 5G/) // só ate 3
  assert.doesNotMatch(txt, /R\$/) // nunca manda preco quando é ambiguo
})

test('aviso de assistente automatico só quando comAviso=true', () => {
  const semAviso = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: false })
  const comAviso = montaResposta({ produtos: [], estoquePorId: new Map(), comAviso: true })
  assert.doesNotMatch(semAviso, /assistente automático/i)
  assert.match(comAviso, /assistente automático/i)
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test bot-whatsapp/lib/resposta.test.mjs`
Expected: FAIL — `resposta.mjs` ainda não existe.

- [ ] **Step 3: Escrever `bot-whatsapp/lib/resposta.mjs`**

```js
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const AVISO = '🤖 Este é um atendimento automático.\n\n'

export function montaResposta({ produtos, estoquePorId, comAviso }) {
  let corpo
  if (produtos.length === 0) {
    corpo = 'Não encontrei esse item no nosso catálogo. Pode me dizer o nome/modelo completo?'
  } else if (produtos.length === 1) {
    const p = produtos[0]
    const qtd = estoquePorId.get(p.id) ?? 0
    corpo = qtd > 0
      ? `Sim, temos! ${p.nome} — ${brl(p.preco)}.`
      : `${p.nome} — ${brl(p.preco)}. No momento estamos sem estoque desse item.`
  } else {
    const opcoes = produtos.slice(0, 3).map((p) => `- ${p.nome}`).join('\n')
    corpo = `Encontrei mais de uma opção, qual delas?\n${opcoes}`
  }
  return comAviso ? AVISO + corpo : corpo
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test bot-whatsapp/lib/resposta.test.mjs`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add bot-whatsapp/lib/resposta.mjs bot-whatsapp/lib/resposta.test.mjs
git commit -m "Adiciona montagem do texto de resposta do bot de WhatsApp"
```

---

### Task 6: Sessão do WhatsApp por loja

**Files:**
- Create: `bot-whatsapp/sessao.mjs`

**Interfaces:**
- Consumes: `makeWASocket`, `useMultiFileAuthState`, `DisconnectReason` de `@whiskeysockets/baileys` (Task 1); `classificaPergunta` (Task 4); `buscaProdutos`, `buscaEstoque` (Task 3); `montaResposta` (Task 5); `registraTroca`, `jaAvisouHoje`, `marcaAvisoHoje` (Task 2); `dorme` de `../../bot/lib/util.mjs`.
- Produces: `export async function iniciaSessao({ slug, depositoId, pastaAuth })` — conecta, escuta mensagens, nunca retorna (processo fica vivo). Consumido pela Task 7.

- [ ] **Step 1: Escrever `bot-whatsapp/sessao.mjs`**

```js
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { pino } from 'pino'
import qrcode from 'qrcode-terminal'
import { classificaPergunta } from './lib/ia.mjs'
import { buscaProdutos, buscaEstoque } from './lib/produtos.mjs'
import { montaResposta } from './lib/resposta.mjs'
import { registraTroca, jaAvisouHoje, marcaAvisoHoje } from './lib/db.mjs'
import { dorme } from '../bot/lib/util.mjs'

const logger = pino({ level: 'silent' })

// Só conversa individual: remoteJid de grupo termina em @g.us, o de pessoa em
// @s.whatsapp.net (ou @lid em contas mais novas — ver Baileys docs). Mensagem
// própria (fromMe) nunca deve virar pergunta pro classificador.
function elegivel(msg) {
  if (msg.key.fromMe) return false
  const jid = msg.key.remoteJid || ''
  if (jid.endsWith('@g.us')) return false
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
}

function textoDaMensagem(msg) {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || null
}

export async function iniciaSessao({ slug, depositoId, pastaAuth }) {
  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({ version, auth: state, logger, printQRInTerminal: false })
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) {
      console.log(`\n[${slug}] escaneie o QR code no WhatsApp (Aparelhos conectados):\n`)
      qrcode.generate(qr, { small: true })
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const deslogado = code === DisconnectReason.loggedOut
      console.error(`[${slug}] conexão caiu (${code || 'sem código'}).`, deslogado ? 'Sessão deslogada — apague a pasta de auth e escaneie o QR de novo.' : 'Reconectando em 5s...')
      if (!deslogado) setTimeout(() => iniciaSessao({ slug, depositoId, pastaAuth }), 5000)
    } else if (connection === 'open') {
      console.log(`[${slug}] conectado ao WhatsApp.`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!elegivel(msg)) continue
      const texto = textoDaMensagem(msg)
      if (!texto) continue
      await processaMensagem(sock, { slug, depositoId }, msg.key.remoteJid, texto)
    }
  })
}

async function processaMensagem(sock, loja, jid, texto) {
  const telefone = jid.split('@')[0]
  const telefoneTruncado = telefone.slice(-4)

  let classificacao
  try {
    classificacao = await classificaPergunta(texto)
  } catch (e) {
    console.error(`[${loja.slug}] falha ao classificar mensagem:`, e?.message || e)
    return // erro de IA nunca deve fazer o bot responder algo errado — só ignora
  }
  if (!classificacao.ehPerguntaProduto) return // fora do escopo: sem log, sem resposta

  const produtos = await buscaProdutos(classificacao.textoBusca)
  const estoquePorId = new Map()
  if (produtos.length === 1) {
    estoquePorId.set(produtos[0].id, await buscaEstoque(produtos[0].id, loja.depositoId))
  }

  const comAviso = !jaAvisouHoje(loja.slug, telefoneTruncado)
  const resposta = montaResposta({ produtos, estoquePorId, comAviso })

  await dorme(2000 + Math.random() * 2000) // parece digitação humana, não resposta instantânea
  await sock.sendMessage(jid, { text: resposta })
  if (comAviso) marcaAvisoHoje(loja.slug, telefoneTruncado)

  registraTroca({
    loja: loja.slug,
    telefoneTruncado,
    pergunta: texto,
    produtoBuscado: classificacao.textoBusca,
    resultado: produtos.length === 1 ? 'respondido' : 'pediu_esclarecimento',
    resposta,
  })
}
```

- [ ] **Step 2: Type-check não se aplica (JavaScript puro)** — em vez disso, checar sintaxe:

Run: `node --check bot-whatsapp/sessao.mjs`
Expected: sem saída (sintaxe válida).

- [ ] **Step 3: Commit**

```bash
git add bot-whatsapp/sessao.mjs
git commit -m "Adiciona sessao do WhatsApp por loja (baileys + classificacao + resposta)"
```

---

### Task 7: Entry point, config por loja e README

**Files:**
- Create: `bot-whatsapp/run.mjs`
- Create: `bot-whatsapp/README.md`

**Interfaces:**
- Consumes: `iniciaSessao` (Task 6).

- [ ] **Step 1: Escrever `bot-whatsapp/run.mjs`**

```js
import path from 'node:path'
import { iniciaSessao } from './sessao.mjs'
import { RAIZ_REPO } from '../bot/lib/env.mjs'

const DIR_DATA = path.join(RAIZ_REPO, 'bot-whatsapp', 'data')

// BOT_WHATSAPP_TESTE=1 liga só UMA sessão, numa pasta de auth separada — pra
// testar com um celular que não é o número real da loja (ver spec, seção
// "Teste antes de valer pra cliente real") antes de conectar de verdade.
const MODO_TESTE = process.env.BOT_WHATSAPP_TESTE === '1'

const LOJAS = MODO_TESTE
  ? [{ slug: 'teste', depositoId: '63d9054d59a9c829747233d4', pastaAuth: path.join(DIR_DATA, 'auth_teste') }]
  : [
      { slug: 'petropolis', depositoId: '63d9054d59a9c829747233d4', pastaAuth: path.join(DIR_DATA, 'auth_petropolis') },
      { slug: 'teresopolis', depositoId: '63e4dc8ede713ef765366d69', pastaAuth: path.join(DIR_DATA, 'auth_teresopolis') },
    ]

console.log(MODO_TESTE ? '[bot-whatsapp] MODO TESTE — uma sessão só, pasta auth_teste' : '[bot-whatsapp] modo normal — Petrópolis + Teresópolis')

for (const loja of LOJAS) iniciaSessao(loja)
```

- [ ] **Step 2: Escrever `bot-whatsapp/README.md`**

```markdown
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
```

- [ ] **Step 3: Checar sintaxe**

Run: `node --check bot-whatsapp/run.mjs`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add bot-whatsapp/run.mjs bot-whatsapp/README.md
git commit -m "Adiciona entrypoint e modo de teste do bot de WhatsApp"
```

---

### Task 8: Verificação final

**Files:**
- Nenhum criado/modificado — só verifica as Tasks 1-7 juntas.

- [ ] **Step 1: Todos os testes automatizados**

Run: `node --test bot-whatsapp/lib/*.test.mjs`
Expected: todos passam (Task 2: 2 testes, Task 5: 5 testes).

- [ ] **Step 2: Type-check do projeto Next.js continua limpo**

Run: `npx tsc --noEmit`
Expected: exit code 0. (`bot-whatsapp/` é `.mjs` puro, fora do `tsconfig` — isso confirma que nada em `bot-whatsapp/` vazou pro lado TypeScript por engano.)

- [ ] **Step 3: `git status` limpo**

Run: `git status --short`
Expected: sem saída — tudo das Tasks 1-7 já commitado.

- [ ] **Step 4: Rodar o modo de teste com celular separado**

Seguir o roteiro completo de `bot-whatsapp/README.md` (`BOT_WHATSAPP_TESTE=1`,
os 5 casos). Isto é obrigatoriamente manual — nenhuma automação neste plano
substitui mandar as 5 mensagens de verdade e olhar a resposta.

- [ ] **Step 5: Reportar pro usuário**

Resumo do que está pronto e do que depende de ação humana:
- Código completo, testado (automatizado onde é lógica pura; scripts manuais
  pra busca real e classificação real).
- Conectar num número de loja de verdade é uma decisão do usuário, não deste
  plano — só depois do Step 4 acima ter ido bem.
- Lembrar: automação não-oficial do WhatsApp — risco de bloqueio da conta
  é aceito conscientemente (ver spec), não eliminado por este código.
