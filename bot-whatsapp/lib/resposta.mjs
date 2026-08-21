const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const AVISO = '🤖 Este é um assistente automático.\n\n'

export function montaResposta({ produtos, estoquePorId, comAviso, linkEncomendas }) {
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
      if (qtd > 0) {
        corpo = `Sim, temos! ${p.nome} — ${brl(p.preco)}.`
      } else {
        // Sem estoque: não mostra o item como se tivesse pra vender agora — oferece
        // encomenda pro próximo pedido em vez disso. Sem data (muda sem regra fixa,
        // ver spec) — quem confirma prazo é humano, no grupo de encomendas.
        corpo = `No momento estamos sem "${p.nome}" em estoque. Dá pra fazer encomenda pro próximo pedido — entra no grupo de encomendas pra combinar: ${linkEncomendas}`
      }
    }
  } else {
    const opcoes = produtos.slice(0, 3).map((p, i) => `${i + 1}. ${p.nome}`).join('\n')
    corpo = `Encontrei mais de uma opção, qual delas? Pode responder só o número:\n${opcoes}`
  }
  return comAviso ? AVISO + corpo : corpo
}
