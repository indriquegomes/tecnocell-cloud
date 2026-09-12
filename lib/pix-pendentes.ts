export type PixVenda = { id: string; cliente: string | null; valor: number; hora: string }

// Casa PIX do sistema com comprovantes por VALOR (guloso, tolerância de centavo).
// Retorna os PIX que ficaram SEM comprovante correspondente. É só um AVISO de
// conferência (o operador bate na mão), não trava nada — a heurística por valor
// pode errar quando há dois PIX de mesmo valor no mesmo turno.
export function pixSemComprovante(pix: PixVenda[], comprovantes: { valor: number }[]): PixVenda[] {
  const disponiveis = comprovantes.map((c) => Number(c.valor) || 0).filter((v) => v > 0)
  const usado = new Array(disponiveis.length).fill(false)
  const pendentes: PixVenda[] = []
  for (const p of pix) {
    const idx = disponiveis.findIndex((v, i) => !usado[i] && Math.abs(v - p.valor) < 0.005)
    if (idx === -1) pendentes.push(p)
    else usado[idx] = true
  }
  return pendentes
}
