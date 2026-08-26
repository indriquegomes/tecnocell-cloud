// Service Worker do TecnoCell — faz o app abrir VOANDO no tablet (guarda os arquivos
// no aparelho, o "baixar no PC" que o Vitor pediu). E deixa parcialmente offline.
//
// REGRA DE OURO pra não servir versão velha: só guarda o que é IMUTÁVEL — os assets
// do Next têm hash no nome (/_next/static/…-a1b2c3.js), então quando muda, o nome
// muda e o cache velho nunca é reusado por engano. HTML, dados e API NUNCA são
// cacheados aqui: vão sempre pela rede, sempre frescos. Nada de estoque/venda velho.

// v3 (26/08): subir a versão faz o 'activate' apagar o cache v2 de TODO mundo
// automaticamente — auto-conserto pra quem ficou com asset velho/quebrado guardado.
const CACHE = 'tecnocell-assets-v3'
const ESTATICO = /\/_next\/static\/|\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/
// Em DEV (localhost) os assets do Next NÃO têm hash estável no nome — a mesma URL
// muda de conteúdo quando editamos. Cache-first então serve CSS/JS VELHO no reload
// normal (só o Ctrl+Shift+R passa por cima). Em localhost o SW não cacheia nada:
// tudo pela rede, sempre fresco. Em produção (vercel) segue cacheando (nomes com hash).
const EH_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => {
  // limpa caches de versões antigas do SW
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (EH_DEV) return // dev: nada de cache, sempre pela rede (evita CSS/JS velho no reload)
  if (!ESTATICO.test(url.pathname)) return // HTML/dados/API: passa direto pela rede

  // cache-first pros imutáveis: se está guardado, entrega na hora; senão baixa e guarda.
  //
  // TUDO dentro de try/catch e caindo pra rede no fim (26/08): antes, se QUALQUER
  // passo aqui falhasse (uma oscilação de rede no fetch, o cache sem espaço, o
  // navegador negando acesso ao storage), o respondWith recebia uma promessa
  // rejeitada e o navegador tratava aquele arquivo .js como impossível de carregar.
  // Um único chunk do Next falhando derruba a tela inteira pro erro genérico
  // "This page couldn't load" — e como o cache-first insiste no mesmo caminho, o
  // problema grudava e nem o F5 resolvia. Agora, deu ruim em qualquer ponto do
  // cache, busca direto na rede: o pior caso vira "abriu sem o ganho de velocidade",
  // não "o sistema não abre".
  e.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE)
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        // guardar é oportunista: se falhar (cota cheia, aba fechando), ignora
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {})
        return res
      } catch {
        return fetch(req)
      }
    })(),
  )
})
