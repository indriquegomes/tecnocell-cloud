import { LOJAS, SHEET_ID, MODELO, env } from './lib/env.mjs'
import * as db from './lib/db.mjs'
import { getUpdates, removeWebhook, quemSou } from './lib/tg.mjs'
import { processaMensagem, tick, reenvioArquivo } from './lib/fluxo.mjs'
import { dorme } from './lib/util.mjs'

// UM processo, UMA fila. Tudo que mexe em banco/planilha passa por aqui em série —
// é o que mata as corridas que o webhook tinha (várias invocações escrevendo a planilha
// ao mesmo tempo, cursor de reenvio sobrescrito, dedup vendo estado pela metade).
let cadeia = Promise.resolve()
const fila = (fn) => new Promise((resolve) => {
  cadeia = cadeia.then(async () => { try { resolve(await fn()) } catch (e) { console.error('[fila]', e); resolve(null) } })
})

let rodando = true

async function poll(loja) {
  const chave = 'offset:' + loja.grupo
  let falhas = 0
  while (rodando) {
    const off = Number(db.getEstado(chave, '0')) || 0
    const r = await getUpdates(loja.token, off || undefined, 25)
    if (!rodando) break
    if (!r?.ok) {
      // Internet caída não pode virar log a cada 5s pra sempre: avisa a 1ª e a cada 10ª.
      falhas++
      if (falhas === 1 || falhas % 10 === 0) console.error(`[${loja.slug}] sem conexão com o Telegram (${falhas}x):`, r?.description || r?.erro || 'falhou')
      await dorme(Math.min(5000 * falhas, 60000))
      continue
    }
    if (falhas) { console.log(`[${loja.slug}] conexão de volta`); falhas = 0 }
    for (const u of r.result || []) {
      await fila(() => processaMensagem(loja, u))
      db.setEstado(chave, u.update_id + 1) // só avança DEPOIS de processar: nada se perde se cair
    }
  }
}

// Rede de segurança: se uma leitura falhou por internet/API fora, ninguém precisa mandar
// outra foto pro bot acordar. A cada 30s ele tenta de novo sozinho.
async function batida() {
  let voltas = 0
  while (rodando) {
    await dorme(30000)
    if (!rodando) break
    for (const loja of LOJAS) {
      const n = await fila(() => tick(loja))
      if (n) console.log(`[${loja.slug}] drenou ${n} comprovante(s) atrasado(s)`)
    }
    // sinal de vida a cada 10 min — dá pra olhar o terminal e saber que não travou
    if (++voltas % 20 === 0) console.log(new Date().toLocaleTimeString('pt-BR'), '· vivo ·', LOJAS.map((l) => `${l.slug}:${db.pendentes(l.grupo, 99).length} na fila`).join(' | '))
  }
}

async function main() {
  if (!LOJAS.length) { console.error('Nenhuma loja configurada (TELEGRAM_TOKEN_* / TELEGRAM_GRUPO_*)'); process.exit(1) }
  console.log('banco:', db.CAMINHO_DB)
  console.log('modelo:', MODELO, '| planilha:', SHEET_ID ? 'ok' : 'SEM COMPROVANTES_SHEET_ID')
  if (!env('ANTHROPIC_API_KEY')) console.error('⚠️  ANTHROPIC_API_KEY vazia — o bot recebe mas NÃO lê.')

  const lerPendentes = process.argv.includes('--ler-pendentes')
  for (const loja of LOJAS) {
    // polling e webhook não convivem: garante que o webhook está fora.
    await removeWebhook(loja.token)
    // Banco virgem: o Telegram ainda tem a fila do bot ANTIGO (mensagens do caixa que já
    // foi conferido na mão). Processar isso agora só geraria aviso de duplicado no grupo.
    // Pula pro fim da fila. `--ler-pendentes` força ler tudo que estiver represado.
    if (!lerPendentes && !db.getEstado('offset:' + loja.grupo)) {
      const r = await getUpdates(loja.token, -1, 0)
      const ultimo = r?.result?.[r.result.length - 1]?.update_id
      if (ultimo != null) {
        db.setEstado('offset:' + loja.grupo, ultimo + 1)
        console.log(`[${loja.slug}] fila antiga do Telegram ignorada (até update ${ultimo}) — use --ler-pendentes se quiser lê-la`)
      }
    }
    const me = await quemSou(loja.token)
    console.log(`[${loja.slug}] bot @${me?.result?.username || '???'} grupo ${loja.grupo} aba "${loja.aba}"`)
    // reenvio interrompido por queda do PC continua de onde parou
    reenvioArquivo(loja).catch((e) => console.error('[reenvio]', e))
  }

  // Ao parar: espera a fila esvaziar e FECHA o banco (checkpoint do WAL). Matar no seco
  // deixava o -wal pendurado.
  let parando = false
  const para = async () => {
    if (parando) return
    parando = true
    rodando = false
    console.log('\nparando... (esperando a fila)')
    await Promise.race([cadeia, dorme(8000)])
    db.fechaBanco()
    process.exit(0)
  }
  process.on('SIGINT', para)
  process.on('SIGTERM', para)

  console.log('ouvindo... (Ctrl+C para parar)')
  await Promise.all([...LOJAS.map(poll), batida()])
}

main().catch((e) => { console.error(e); process.exit(1) })
