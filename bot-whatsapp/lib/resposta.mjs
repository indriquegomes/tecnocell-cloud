const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const AVISO = '🤖 Este é um assistente automático.\n\n'

export function montaResposta({ produtos, estoquePorId, comAviso }) {
  let corpo
  if (produtos.length === 0) {
    corpo = 'Não encontrei esse item no nosso catálogo. Pode me dizer o nome/modelo completo?'
  } else if (produtos.length === 1) {
    const p = produtos[0]
    if (p.preco <= 0) {
      // preco ausente/zerado no cadastro: não cotar com confiança total — trata como ambíguo, pede confirmação.
      corpo = `Encontrei ${p.nome}, mas o preço não está atualizado no sistema. Vou confirmar com um atendente e te retorno.`
    } else {
      const qtd = estoquePorId.get(p.id) ?? 0
      corpo = qtd > 0
        ? `Sim, temos! ${p.nome} — ${brl(p.preco)}.`
        : `${p.nome} — ${brl(p.preco)}. No momento estamos sem estoque desse item.`
    }
  } else {
    const opcoes = produtos.slice(0, 3).map((p) => `- ${p.nome}`).join('\n')
    corpo = `Encontrei mais de uma opção, qual delas?\n${opcoes}`
  }
  return comAviso ? AVISO + corpo : corpo
}
