// Ponte entre a página e a extensão. Faz duas coisas:
//   1. injeta o inject.js (que troca fetch/XHR lá dentro)
//   2. escuta clique/navegação e repassa tudo pro background enviar

;(() => {
  // O inject.js NÃO é injetado daqui. Ele é declarado no manifest com world:"MAIN",
  // que roda no contexto da página de forma SÍNCRONA em document_start.
  //
  // A 1ª versão injetava por <script src>, que carrega assíncrono — e o Angular do SIGE
  // já tinha disparado as chamadas de abertura da tela antes do gancho existir. Os
  // ganchos funcionavam (comprovado em teste), só chegavam tarde demais.

  const enviar = (ev) => { try { chrome.runtime.sendMessage({ tipo: 'evento', ev }) } catch {} }

  // Eventos vindos do inject (chamadas de API)
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__tecnocell) enviar(e.data.ev)
  })

  // Quem está logado — aparece no cabeçalho do SIGE ("Olá NOME")
  const quemEsta = () => {
    const t = document.body?.innerText?.match(/Ol[áa]\s*\n?\s*([A-ZÀ-Ú][A-ZÀ-Ú\s]{2,30})/)
    return t ? t[1].trim() : null
  }

  // O texto do botão é o que traduz a intenção. Sem ele o log vira "clicou num
  // <button>", que não serve pra entender nada.
  const descreve = (el) => {
    if (!el) return null
    const alvo = el.closest('button, a, [role="button"], input, select, td') || el
    const texto = (alvo.innerText || alvo.value || alvo.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ')
    return texto.slice(0, 80) || alvo.tagName.toLowerCase()
  }

  document.addEventListener('click', (e) => {
    enviar({
      tipo: 'clique',
      rota: location.pathname,
      alvo: descreve(e.target),
      usuario_sige: quemEsta(),
      ocorreu_em: new Date().toISOString(),
    })
  }, true)

  // O SIGE é single-page: a URL muda sem recarregar, então 'popstate' não basta.
  let rotaAtual = location.pathname
  setInterval(() => {
    if (location.pathname !== rotaAtual) {
      rotaAtual = location.pathname
      enviar({ tipo: 'rota', rota: rotaAtual, usuario_sige: quemEsta(), ocorreu_em: new Date().toISOString() })
    }
  }, 1000)
})()
