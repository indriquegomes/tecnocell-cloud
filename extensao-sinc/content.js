;(() => {
  const enviar = (ev) => { try { chrome.runtime.sendMessage({ tipo: 'evento', ev }) } catch {} }
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__tecnocell) enviar(e.data.ev)
  })
  const quemEsta = () => {
    const t = document.body?.innerText?.match(/Ol[áa]\s*\n?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,30})/)
    return t ? t[1].trim() : null
  }
  const descreve = (el) => {
    if (!el) return null
    const alvo = el.closest('button, a, [role="button"], input, select, td') || el
    const texto = (alvo.innerText || alvo.value || alvo.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ')
    return texto.slice(0, 80) || alvo.tagName.toLowerCase()
  }
  document.addEventListener('click', (e) => {
    enviar({ tipo: 'clique', rota: location.pathname, alvo: descreve(e.target), usuario_sige: quemEsta(), ocorreu_em: new Date().toISOString() })
  }, true)
  let rotaAtual = location.pathname
  setInterval(() => {
    if (location.pathname !== rotaAtual) {
      rotaAtual = location.pathname
      enviar({ tipo: 'rota', rota: rotaAtual, usuario_sige: quemEsta(), ocorreu_em: new Date().toISOString() })
    }
  }, 1000)
})()
