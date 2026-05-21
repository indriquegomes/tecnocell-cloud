import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const input  = join(__dir, '..', 'public', 'logo.png')
const output = join(__dir, '..', 'public', 'logo-transparent.png')

// Carrega a imagem e converte para RGBA
const image = sharp(input)
const { data, info } = await image
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const pixels = new Uint8Array(data)

// Amostra a cor de fundo nos quatro cantos (geralmente branco/cinza)
function getPixel(x, y) {
  const i = (y * width + x) * channels
  return { r: pixels[i], g: pixels[i+1], b: pixels[i+2], a: pixels[i+3] }
}

// Pega a média da cor dos cantos como referência de fundo
const corners = [
  getPixel(0, 0), getPixel(width - 1, 0),
  getPixel(0, height - 1), getPixel(width - 1, height - 1),
]
const bgR = Math.round(corners.reduce((s, c) => s + c.r, 0) / corners.length)
const bgG = Math.round(corners.reduce((s, c) => s + c.g, 0) / corners.length)
const bgB = Math.round(corners.reduce((s, c) => s + c.b, 0) / corners.length)

console.log(`Cor de fundo detectada: rgb(${bgR}, ${bgG}, ${bgB})`)

// Tolerância: pixels próximos ao fundo ficam transparentes
const TOLERANCE = 30

function colorDiff(r, g, b) {
  return Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
}

// Flood-fill a partir dos cantos para remover fundo conectado
const visited = new Uint8Array(width * height)
const queue = []

function idx(x, y) { return y * width + x }

// Adiciona os quatro cantos como seeds
const seeds = [
  [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  // Também percorre as bordas
]
// Adiciona toda a borda superior e inferior
for (let x = 0; x < width; x++) { seeds.push([x, 0]); seeds.push([x, height - 1]) }
for (let y = 0; y < height; y++) { seeds.push([0, y]); seeds.push([width - 1, y]) }

for (const [x, y] of seeds) {
  const i = idx(x, y)
  if (visited[i]) continue
  const p = getPixel(x, y)
  if (colorDiff(p.r, p.g, p.b) <= TOLERANCE) {
    queue.push([x, y])
    visited[i] = 1
  }
}

// BFS flood-fill
while (queue.length > 0) {
  const [cx, cy] = queue.pop()
  const pi = (cy * width + cx) * channels
  // Torna o pixel transparente
  pixels[pi + 3] = 0

  const neighbors = [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
    const ni = idx(nx, ny)
    if (visited[ni]) continue
    const p = getPixel(nx, ny)
    if (colorDiff(p.r, p.g, p.b) <= TOLERANCE) {
      visited[ni] = 1
      queue.push([nx, ny])
    }
  }
}

// Salva como PNG com transparência
await sharp(Buffer.from(pixels), { raw: { width, height, channels } })
  .png()
  .toFile(output)

console.log(`✅ logo-transparent.png salvo em public/ (${width}×${height}px)`)
