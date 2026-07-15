// Service Worker do TecnoCell — faz o app abrir VOANDO no tablet (guarda os arquivos
// no aparelho, o "baixar no PC" que o Vitor pediu). E deixa parcialmente offline.
//
// REGRA DE OURO pra não servir versão velha: só guarda o que é IMUTÁVEL — os assets
// do Next têm hash no nome (/_next/static/…-a1b2c3.js), então quando muda, o nome
// muda e o cache velho nunca é reusado por engano. HTML, dados e API NUNCA são
// cacheados aqui: vão sempre pela rede, sempre frescos. Nada de estoque/venda velho.

const CACHE = 'tecnocell-assets-v1'
const ESTATICO = /\/_next\/static\/|\.(?:png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/

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
  if (!ESTATICO.test(url.pathname)) return // HTML/dados/API: passa direto pela rede

  // cache-first pros imutáveis: se está guardado, entrega na hora; senão baixa e guarda
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res && res.ok) cache.put(req, res.clone())
      return res
    }),
  )
})
