export type PixVenda = { id: string; cliente: string | null; valor: number; hora: string }

// Casa PIX do sistema com comprovantes. Em camadas:
// 1) valor EXATO (1 a 1); 2) SOMA de 2 (ex: 1 Pix de R$65 = R$45 venda + R$20 fiado);
// 3) SOMA de 3. Tolerância de centavo. Retorna os PIX que ficaram SEM comprovante.
// `extras` = outros pagamentos PIX do caixa que entram na MESMA soma (ex: fiado recebido).
// Ainda é só um AVISO de conferência (o operador bate na mão) — não trava nada.
export function pixSemComprovante(pix: PixVenda[], extras: PixVenda[], comprovantes: { valor: number }[]): PixVenda[] {
  const todos = [...pix, ...extras]
  const compVals = comprovantes.map((c) => Number(c.valor) || 0).filter((v) => v > 0)
  const usadoComp = new Array(compVals.length).fill(false)
  const usadoItem = new Array(todos.length).fill(false)

  // 1º: exato (1 a 1)
  for (let i = 0; i < todos.length; i++) {
    const idx = compVals.findIndex((v, j) => !usadoComp[j] && Math.abs(v - todos[i].valor) < 0.005)
    if (idx !== -1) { usadoComp[idx] = true; usadoItem[i] = true }
  }

  // 2º: soma de 2 ou 3 (cobre os comprovantes que sobraram)
  const compRest = compVals.filter((_, j) => !usadoComp[j])
  for (const alvo of compRest) {
    let achou = false
    for (let i = 0; i < todos.length && !achou; i++) {
      if (usadoItem[i]) continue
      for (let j = i + 1; j < todos.length && !achou; j++) {
        if (usadoItem[j]) continue
        if (Math.abs(todos[i].valor + todos[j].valor - alvo) < 0.005) { usadoItem[i] = usadoItem[j] = true; achou = true }
      }
    }
    if (achou) continue
    for (let i = 0; i < todos.length && !achou; i++) {
      if (usadoItem[i]) continue
      for (let j = i + 1; j < todos.length && !achou; j++) {
        if (usadoItem[j]) continue
        for (let k = j + 1; k < todos.length && !achou; k++) {
          if (usadoItem[k]) continue
          if (Math.abs(todos[i].valor + todos[j].valor + todos[k].valor - alvo) < 0.005) { usadoItem[i] = usadoItem[j] = usadoItem[k] = true; achou = true }
        }
      }
    }
  }

  // retorna só os PIX (não os extras) que ficaram sem casar
  const pendentes: PixVenda[] = []
  for (let i = 0; i < pix.length; i++) if (!usadoItem[i]) pendentes.push(pix[i])
  return pendentes
}
