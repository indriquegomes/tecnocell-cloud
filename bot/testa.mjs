// Teste de bancada: roda TUDO menos o Telegram e a IA de verdade.
// `node bot/testa.mjs`            → banco + agrupamento + planilha (não escreve no Google)
// `node bot/testa.mjs --sheet`    → escreve MESMO na aba "TESTE" da planilha
// `node bot/testa.mjs --ia <arq>` → lê UMA imagem local com a Haiku (checa se a chave presta)
import fs from 'node:fs'
import { LOJAS } from './lib/env.mjs'
import * as db from './lib/db.mjs'
import { montaPlanilha, resumoPeriodo, deduplica } from './lib/fluxo.mjs'
import { escreveAba } from './lib/sheets.mjs'
import { agrupaPorDestino, dataDoId, resolveData, parseValor, primeiroJson, limpaId } from './lib/util.mjs'

const args = process.argv.slice(2)
const ok = (t, c) => console.log((c ? '  ok  ' : ' FALHA') + ' ' + t)

console.log('== helpers ==')
ok('dataDoId E2E', dataDoId('E1234567820260728143012345678901') === '2026-07-28')
ok('dataDoId lixo', dataDoId('abc') === null)
ok('limpaId tira invisivel', limpaId('E123 456-78​90') === 'E1234567890')
ok('parseValor 1.234,56', parseValor('R$ 1.234,56') === 1234.56)
ok('parseValor 259.00', parseValor('259.00') === 259)
ok('primeiroJson com conversa depois', primeiroJson('{"a":1} deixa eu reler... {"a":2}')?.a === 1)
ok('resolveData usa recebido no ano errado', resolveData(null, '2025-07-28', '2026-07-28T10:00:00Z') === '2026-07-28')

console.log('== agrupamento ==')
const g = agrupaPorDestino([
  { destinatario: 'ATOSCEL COMERCIO', destinatario_doc: '11222333000144', valor: 10 },
  { destinatario: 'ATOSCEL COMERCIO DE CELULARES LTDA', destinatario_doc: '', valor: 20 },
  { destinatario: 'CABRAL SERVICOS', destinatario_doc: '99888777000155', valor: 30 },
  { destinatario: 'Cabral Serviços', destinatario_doc: '', valor: 40 },
])
const chaves = Object.keys(g)
ok('juntou em 2 destinatarios (achou ' + chaves.length + ')', chaves.length === 2)

console.log('== banco ==')
const CHAT = -999999
db.db.exec(`delete from comprovantes where chat_id=${CHAT}; delete from periodos where chat_id=${CHAT};`)
db.abrePeriodo(CHAT, 'teste')
const base = { chat_id: CHAT, loja: 'teste', recebido_em: new Date().toISOString(), formato: 'foto', file_id: 'x' }
const a = db.guardaChegada({ ...base, msg_id: 1 })
const b = db.guardaChegada({ ...base, msg_id: 2 })
const c = db.guardaChegada({ ...base, msg_id: 3 })
ok('gravou 3', !!a && !!b && !!c)
ok('reenvio da mesma msg nao duplica', db.guardaChegada({ ...base, msg_id: 1 }).id === a.id)

db.salvaLeitura(a.id, { valor: 100, data_pix: new Date().toISOString().slice(0, 10), pagador: 'JOAO', destinatario: 'ATOSCEL COMERCIO', destinatario_doc: '11222333000144', transacao_id: 'E1234567890', status: 'extraido' })
db.salvaLeitura(b.id, { valor: 100, data_pix: new Date().toISOString().slice(0, 10), pagador: 'JOAO', destinatario: 'ATOSCEL COMERCIO', destinatario_doc: '11222333000144', transacao_id: 'E1234567890', status: 'extraido' })
db.salvaLeitura(c.id, { valor: 50, data_pix: new Date().toISOString().slice(0, 10), pagador: 'MARIA', destinatario: 'ATOSCEL COMERCIO', transacao_id: null, status: 'extraido' })

const lojaFake = { slug: 'teste', aba: 'TESTE', token: '', grupo: CHAT }
// dedup sem Telegram: silencia o aviso marcando o flag antes
db.setFlag(a.id, 'dup_avisado')
await deduplica(lojaFake)
ok('marcou o 2o como duplicado', db.porId(b.id).status === 'duplicado')
ok('manteve o 1o valido', db.porId(a.id).status === 'extraido')

console.log('== fila de leitura (o bug que travava o bot antigo) ==')
ok('lido SEM transacao_id NAO volta pra fila', db.pendentes(CHAT, 10).length === 0)
const d = db.guardaChegada({ ...base, msg_id: 4 })
ok('nao lido ENTRA na fila', db.pendentes(CHAT, 10).some((p) => p.id === d.id))
db.salvaFalha(d.id, 'api: 429 rate limit', true)
ok('falha transitoria NAO vira ilegivel', db.porId(d.id).status === 'recebido')
ok('falha transitoria agenda backoff (sai da fila agora)', db.pendentes(CHAT, 10).length === 0)
db.salvaFalha(d.id, 'json-fail', false)
db.salvaFalha(d.id, 'json-fail', false)
ok('3a falha de conteudo vira ilegivel', db.porId(d.id).status === 'ilegivel')

console.log('== resumo/planilha ==')
const r = resumoPeriodo(lojaFake)
ok('total soma so os validos: R$ ' + r.geral, r.geral === 150)
ok('conta 1 duplicado', r.dups === 1)
ok('conta 1 nao lido', r.naoLidos === 1)
const { linhas, tipos } = montaPlanilha(lojaFake)
const total = linhas[linhas.length - 1]
ok('linha TOTAL GERAL = 150', total[1] === 'TOTAL GERAL' && total[2] === 150)
ok('TOTAL GERAL avisa nao lido', String(total[4]).includes('NÃO lido'))
ok('duplicado NAO aparece na aba da loja', !tipos.includes('dup'))
ok('TOTAL GERAL ainda conta o duplicado', String(total[4]).includes('1 duplicado'))
console.log(linhas.map((l, i) => `  ${String(tipos[i]).padEnd(9)} ${l.map((x) => String(x).slice(0, 28).padEnd(28)).join('')}`).join('\n'))

console.log('== regressao: bugs achados na auditoria ==')
const { fatia } = await import('./lib/tg.mjs')
const gigante = Array.from({ length: 400 }, (_, i) => `• linha ${i} — destinatario numero ${i} — R$ 1.234,56`).join('\n')
const pedacos = fatia(gigante)
ok('resumo gigante e fatiado (' + pedacos.length + ' partes)', pedacos.length > 1 && pedacos.every((p) => p.length <= 3900))
ok('fatiar nao perde conteudo', pedacos.join('\n').replace(/\n/g, '') === gigante.replace(/\n/g, ''))
ok('texto curto nao e fatiado', fatia('oi').length === 1)

const e = db.guardaChegada({ ...base, msg_id: 5 })
db.salvaFalha(e.id, 'api: 429', true)
ok('backoff tirou da fila', !db.pendentes(CHAT, 10).some((p) => p.id === e.id))
db.forcaRetry(CHAT)
ok('/fechar forca o retry de quem estava em backoff', db.pendentes(CHAT, 10).some((p) => p.id === e.id))
db.setStatus(e.id, 'ilegivel')

const per = db.periodoAberto(CHAT)
ok('porPeriodoId devolve os itens do periodo certo', db.porPeriodoId(per.id).length >= 3)
db.guardaFechamento({ periodo_id: per.id, chat_id: CHAT, loja: 'TESTE', aberto_em: per.aberto_em, fechado_em: new Date().toISOString(), total: 150, n_validos: 2, n_dups: 1, n_incompletos: 0, n_naolidos: 1, aberto_por: 'teste', fechado_por: 'teste' })
ok('fechamento entra no historico', db.historico(5).some((f) => f.chat_id === CHAT))

console.log('== abas novas ==')
const abas = await import('./lib/abas.mjs')
const resumoFake = () => resumoPeriodo(lojaFake)
const R = abas.montaResumo(() => resumoPeriodo(lojaFake))
ok('aba Resumo tem cabecalho + total', R.linhas[0][0] === 'Loja' && R.tipos.includes('total'))
const A = abas.montaAlertas(resumoFake)
ok('aba Alertas lista o duplicado e o nao lido', A.linhas.length >= 3)
const H = abas.montaHistorico()
ok('aba Historico lista o fechamento', H.linhas.length >= 2)
ok('abas novas NAO usam o nome das antigas', ![abas.ABA_RESUMO, abas.ABA_ALERTAS, abas.ABA_HISTORICO].some((n) => ['Petrópolis', 'Teresópolis'].includes(n)))
console.log('  Resumo:', R.linhas.length, 'linhas · Alertas:', A.linhas.length, '· Histórico:', H.linhas.length)
db.db.exec(`delete from fechamentos where chat_id=${CHAT};`)

if (args.includes('--sheet')) {
  console.log('== escrevendo na aba TESTE da planilha real ==')
  await escreveAba('TESTE', linhas, tipos)
  console.log('  ok  escreveu (as abas Petrópolis/Teresópolis nao foram tocadas)')
}

if (args.includes('--abas')) {
  console.log('== criando as ABAS NOVAS na planilha real (Resumo/Alertas/Histórico) ==')
  for (const [nome, m] of [[abas.ABA_RESUMO, R], [abas.ABA_ALERTAS, A], [abas.ABA_HISTORICO, H]]) {
    await escreveAba(nome, m.linhas, m.tipos, m.opts)
    console.log('  ok  ', nome)
  }
}

if (args.includes('--ia')) {
  const arq = args[args.indexOf('--ia') + 1]
  console.log('== IA de verdade em', arq, '==')
  const { leComprovante } = await import('./lib/ia.mjs')
  const buf = fs.readFileSync(arq)
  const falso = { id: 0, formato: /\.pdf$/i.test(arq) ? 'pdf' : 'foto', file_id: null, url: null, recebido_em: new Date().toISOString() }
  // injeta o arquivo local no lugar do download do Telegram
  const mod = await import('./lib/tg.mjs')
  mod.baixaArquivo // (só documental: o modo --ia usa o caminho de link/data URI abaixo)
  const b64 = buf.toString('base64')
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20000 })
  try {
    const resp = await ai.messages.create({
      model: process.env.COMPROVANTE_MODELO || 'claude-haiku-4-5', max_tokens: 400,
      messages: [{ role: 'user', content: [
        falso.formato === 'pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
          : { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Responda APENAS JSON: {"valor":<numero>,"destinatario":"<quem RECEBEU>","transacao_id":"<E2E>"}' },
      ] }],
    })
    console.log('  ok  ', JSON.stringify(primeiroJson(resp.content.find((x) => x.type === 'text')?.text || '')))
  } catch (e) {
    console.log('  FALHA', e?.status || '', String(e?.message || e).slice(0, 160))
  }
  void leComprovante
}

db.db.exec(`delete from comprovantes where chat_id=${CHAT}; delete from periodos where chat_id=${CHAT};`)
console.log('\nlimpou os dados de teste. fim.')
