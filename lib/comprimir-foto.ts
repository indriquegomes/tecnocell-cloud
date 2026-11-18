// COMPRIME A FOTO DA NOTA NO NAVEGADOR, ANTES DE SUBIR.
//
// A requisição de server action tem teto de 4 MB (next.config.ts) e a Vercel corta
// em ~4,5 MB. Foto de celular tem 2–4 MB cada: três páginas de uma nota já estouram
// e o envio morre com 400 antes de chegar no nosso código. Comprimindo aqui, uma
// nota inteira (8–10 páginas) cabe no limite, e a leitura fica mais rápida porque
// a IA recebe imagem menor.
//
// Só roda no navegador — não importar em código de servidor.
export async function comprimirFoto(file: File, maxLado = 1700, qualidade = 0.72): Promise<File> {
  if (!file || !/^image\//i.test(file.type || '')) return file
  // já é pequena: recomprimir só perderia qualidade
  if (file.size <= 350 * 1024) return file
  try {
    const bitmap = await carregarImagem(file)
    const { width, height } = bitmap
    if (!width || !height) return file
    const escala = Math.min(1, maxLado / Math.max(width, height))
    const w = Math.max(1, Math.round(width * escala))
    const h = Math.max(1, Math.round(height * escala))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', qualidade))
    if (!blob || blob.size >= file.size) return file
    const nome = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    // comprimir é otimização: se falhar, manda o original
    return file
  }
}

async function carregarImagem(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* cai pro <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = () => rej(new Error('imagem inválida'))
      img.src = url
    })
    return img
  } finally {
    // revoga depois do load; o navegador já copiou os pixels
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}
