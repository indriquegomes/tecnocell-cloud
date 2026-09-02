// Junta os eventos capturados e manda pra rota de ingestão do TecnoCell.
//
// ⚠️ MV3: o service worker DORME após ~30s parado. Fila mora no chrome.storage e o
// relógio é chrome.alarms — senão a fila some e o envio periódico nunca acontece.
//
// Destino mudou vs. a versão antiga (que postava direto no Supabase): agora envia
// UM evento por request pra /api/sinc/eventos, com x-sinc-loja + Bearer <chave>.
// idempotency_key é gerada UMA vez na fila; retry reenvia a MESMA key → não duplica.
// entidade/acao ficam genéricos ('api'/'capturado'); o worker classifica depois
// (Fase 4) — aqui é só captura/descoberta de endpoints.

const IGNORAR = /token|refresh|heartbeat|notifica|ping|\.js|\.css|\.png|\.woff/i
const SO_ESCRITA_INTERESSA = /finaliz|salvar|inserir|criar|atualiz|pagament|venda|pedido|estoque|moviment|lancament|import/i
const LOTE = 10
const TETO = 500

const ler = (chaves) => new Promise((ok) => chrome.storage.local.get(chaves, ok))
const gravar = (obj) => new Promise((ok) => chrome.storage.local.set(obj, ok))

const vale = (ev) => {
  if (ev.tipo !== 'api') return true
  if (IGNORAR.test(ev.rota || '')) return false
  if (ev.metodo === 'GET' && !SO_ESCRITA_INTERESSA.test(ev.rota || '')) return false
  return true
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.tipo !== 'evento' || !vale(msg.ev)) return
  ;(async () => {
    const { fila = [], loja } = await ler(['fila', 'loja'])
    if (!loja) return // sem config, não acumula
    fila.push({ idempotency_key: loja + ':api:' + crypto.randomUUID() + ':capturado', ...msg.ev })
    await gravar({ fila: fila.slice(-TETO) })
    if (fila.length >= LOTE) descarregar()
  })()
})

const enxuga = (v, teto = 4000) => {
  if (v == null) return null
  const txt = JSON.stringify(v).replace(/\u0000/g, '')
  if (txt.length <= teto) { try { return JSON.parse(txt) } catch { return null } }
  return { _cortado: true, tamanho: txt.length, inicio: txt.slice(0, 1000) }
}

async function descarregar() {
  const { fila = [], loja, chave, url } = await ler(['fila', 'loja', 'chave', 'url'])
  if (!fila.length || !loja || !chave || !url) return

  await gravar({ fila: [] }) // esvazia antes de enviar (não duplicar com evento novo)

  let enviados = 0, descartados = 0, sobrou = [], erro = null
  for (const ev of fila) {
    try {
      const r = await fetch(url.replace(/\/$/, '') + '/api/sinc/eventos', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sinc-loja': loja, authorization: 'Bearer ' + chave },
        body: JSON.stringify({
          idempotency_key: ev.idempotency_key,
          entidade: 'api',
          acao: 'capturado',
          payload: {
            tipo: ev.tipo,
            rota: ev.rota ?? null,
            metodo: ev.metodo ?? null,
            status: typeof ev.status === 'number' ? ev.status : null,
            corpo: enxuga(ev.payload),
            resposta: enxuga(ev.resposta),
            usuario_sige: ev.usuario_sige ?? null,
            ocorreu_em: ev.ocorreu_em ?? new Date().toISOString(),
          },
        }),
      })
      if (!r.ok) {
        const corpo = (await r.text()).slice(0, 200)
        const err = new Error('HTTP ' + r.status + ' ' + corpo)
        err.permanente = r.status >= 400 && r.status < 500
        throw err
      }
      enviados++
    } catch (e) {
      erro = String(e.message).slice(0, 300)
      if (e.permanente) descartados++
      else { sobrou.push(ev); break }
    }
  }

  const { fila: nova = [] } = await ler(['fila'])
  await gravar({ fila: sobrou.concat(nova).slice(-TETO), ultimoEnvio: new Date().toISOString(), ultimoErro: erro, enviados, descartados })
}

chrome.alarms.create('descarga', { periodInMinutes: 0.5 })
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'descarga') descarregar() })
