const campos = { loja: 'loja', chave: 'chave', url: 'url' }
chrome.storage.local.get(Object.values(campos), (c) => {
  for (const [id, chave] of Object.entries(campos)) document.getElementById(id).value = c[chave] || ''
})
document.getElementById('salvar').addEventListener('click', () => {
  const dados = {}
  for (const [id, chave] of Object.entries(campos)) dados[chave] = document.getElementById(id).value.trim().replace(/\/$/, '')
  chrome.storage.local.set(dados, () => {
    const ok = document.getElementById('ok')
    ok.textContent = 'Salvo. Recarregue as abas do SIGE.'
    setTimeout(() => { ok.textContent = '' }, 5000)
    mostrarStatus()
  })
})

function mostrarStatus() {
  chrome.storage.local.get(['fila', 'ultimoEnvio', 'ultimoErro', 'enviados', 'descartados', 'loja', 'url'], (c) => {
    const linhas = [
      'Loja : ' + (c.loja || '(VAZIO)'),
      'URL  : ' + (c.url || '(VAZIO)'),
      'Fila (aguardando): ' + (c.fila ? c.fila.length : 0),
      'Enviados   : ' + (c.enviados ?? 0),
      'Descartados: ' + (c.descartados ?? 0),
      'Último envio: ' + (c.ultimoEnvio || '—'),
      'Último erro : ' + (c.ultimoErro || '—'),
    ]
    document.getElementById('status').textContent = linhas.join('\n')
  })
}
document.getElementById('atualizar').addEventListener('click', mostrarStatus)
mostrarStatus()
setInterval(mostrarStatus, 3000)
