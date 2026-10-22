// Loader mínimo para rodar os testes com `node` puro: o projeto usa o alias
// `@/` do tsconfig e o Node não conhece isso sozinho (nem completa a extensão
// dos módulos TS). Uso:
//   node --import ./test/alias.mjs test/logica.test.ts
import { registerHooks } from 'node:module'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const raiz = process.cwd()

function comExtensao(base) {
  if (path.extname(base)) return fs.existsSync(base) ? base : null
  for (const sufixo of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fs.existsSync(base + sufixo)) return base + sufixo
  }
  return null
}

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador.startsWith('@/')) {
      const achado = comExtensao(path.join(raiz, especificador.slice(2)))
      if (achado) return proximo(pathToFileURL(achado).href, contexto)
    }
    return proximo(especificador, contexto)
  },
})
