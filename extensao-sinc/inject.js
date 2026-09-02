// Roda DENTRO da página (não no mundo isolado) pra trocar o fetch/XHR que o
// próprio SIGE usa. É daqui que sai o dado valioso: o corpo exato que o SIGE manda
// pra API quando a funcionária finaliza uma venda.
(() => {
  const MAX = 20000
  const limpa = (obj) => {
    if (!obj || typeof obj !== 'object') return obj
    const copia = Array.isArray(obj) ? [] : {}
    for (const [k, v] of Object.entries(obj)) {
      if (/senha|password|token|authorization|secret|hash/i.test(k)) continue
      copia[k] = v && typeof v === 'object' ? limpa(v) : v
    }
    return copia
  }
  const parse = (txt) => {
    if (!txt) return null
    if (txt.length > MAX) return { _resumo: 'corpo grande', tamanho: txt.length, inicio: txt.slice(0, 500) }
    try { return limpa(JSON.parse(txt)) } catch { return { _texto: txt.slice(0, 1000) } }
  }
  const manda = (ev) => window.postMessage({ __tecnocell: true, ev }, '*')

  const fetchOriginal = window.fetch
  window.fetch = async function (...args) {
    const req = args[0]
    const url = typeof req === 'string' ? req : req?.url
    const metodo = (args[1]?.method || (typeof req === 'object' && req?.method) || 'GET').toUpperCase()
    let corpo = null
    try { corpo = args[1]?.body ? parse(String(args[1].body)) : null } catch {}
    const resp = await fetchOriginal.apply(this, args)
    if (/sigecloud/.test(url || '')) {
      resp.clone().text().then((t) => manda({
        tipo: 'api', rota: url, metodo, status: resp.status,
        payload: corpo, resposta: parse(t), ocorreu_em: new Date().toISOString(),
      })).catch(() => {})
    }
    return resp
  }

  const abrirOriginal = XMLHttpRequest.prototype.open
  const enviarOriginal = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__tc = { metodo, url }
    return abrirOriginal.call(this, metodo, url, ...resto)
  }
  XMLHttpRequest.prototype.send = function (corpo) {
    const info = this.__tc
    if (info && /sigecloud/.test(info.url || '')) {
      this.addEventListener('load', () => {
        manda({
          tipo: 'api', rota: info.url, metodo: (info.metodo || 'GET').toUpperCase(),
          status: this.status, payload: corpo ? parse(String(corpo)) : null,
          resposta: parse(this.responseText), ocorreu_em: new Date().toISOString(),
        })
      })
    }
    return enviarOriginal.call(this, corpo)
  }
})()
