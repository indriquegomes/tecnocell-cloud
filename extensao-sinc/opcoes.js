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
  })
})
