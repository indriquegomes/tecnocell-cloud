import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Resolve o alias "@/" (do tsconfig) pro caminho real, pro node conseguir
// importar os .ts do projeto em teste. Tudo o resto delega pro resolver padrão.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    return { url: pathToFileURL(join(ROOT, rel) + '.ts').href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
