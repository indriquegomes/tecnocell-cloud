// POR QUE a peça voltou / a venda caiu.
//
// Hoje o campo "motivo" da devolução é texto livre — e as 6 devoluções existentes têm
// motivo NULL. Texto livre ninguém preenche, e o que é preenchido não dá pra somar.
//
// Os motivos abaixo saíram do Vitor, não da minha cabeça. Fechados e obrigatórios,
// porque a pergunta que importa ("por que as peças voltam?") só tem resposta se der
// pra CONTAR.

export interface Motivo {
  id: string
  label: string
  icone: string
  ajuda?: string
  cor: string
}

// ── DEVOLUÇÃO ──────────────────────────────────────────────────────────────
// "pedi pra testar · peça com defeito (não tem como ter certeza) · cliente dele
//  desistiu do serviço — estes são normalmente os problemas que tem de devolução"
export const MOTIVOS_DEVOLUCAO: Motivo[] = [
  {
    id: 'teste',
    label: 'Pediu pra testar',
    icone: '🔍',
    ajuda: 'Levou a peça pra testar no aparelho e trouxe de volta.',
    cor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'defeito_alegado',
    // O Vitor foi explícito: "não tem como ter certeza". Chamar de "peça com defeito"
    // seco viraria uma estatística de qualidade que não é verdade — é o que o cliente
    // DIZ. O rótulo carrega essa dúvida de propósito.
    label: 'Defeito alegado',
    icone: '⚠️',
    ajuda: 'O cliente diz que veio com defeito — sem como confirmar.',
    cor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'cliente_desistiu',
    label: 'Cliente dele desistiu do serviço',
    icone: '🙅',
    ajuda: 'O lojista comprou a peça, mas o cliente final desistiu do conserto.',
    cor: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'peca_errada',
    label: 'Peça errada / não serviu',
    icone: '🔀',
    ajuda: 'Modelo trocado ou incompatível com o aparelho.',
    cor: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    id: 'outro',
    label: 'Outro',
    icone: '✏️',
    ajuda: 'Escreva o motivo ao lado.',
    cor: 'bg-gray-50 text-gray-600 border-gray-200',
  },
]

// ── CANCELAMENTO DE VENDA ──────────────────────────────────────────────────
// Julho: 76% dos cancelamentos têm uma venda pro MESMO cliente no MESMO dia — cheira a
// erro de digitação sendo refeito. Mas isso é dedução minha; só o motivo prova.
export const MOTIVOS_CANCELAMENTO: Motivo[] = [
  {
    id: 'erro_pedido',
    label: 'Erro no pedido',
    icone: '🔧',
    ajuda: 'Produto, preço ou quantidade errados — vou refazer.',
    cor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'cliente_desistiu',
    label: 'Cliente desistiu',
    icone: '❌',
    ajuda: 'Venda perdida de verdade.',
    cor: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  {
    id: 'sem_estoque',
    label: 'Sem estoque',
    icone: '📦',
    ajuda: 'A peça não estava disponível.',
    cor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'pagamento',
    label: 'Pagamento não passou',
    icone: '💳',
    ajuda: 'Cartão recusado, PIX não caiu, limite de fiado.',
    cor: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    id: 'outro',
    label: 'Outro',
    icone: '✏️',
    ajuda: 'Escreva o motivo ao lado.',
    cor: 'bg-gray-50 text-gray-600 border-gray-200',
  },
]

export const motivoDevolucao = (id: string | null | undefined) =>
  MOTIVOS_DEVOLUCAO.find((m) => m.id === id) ?? null

export const motivoCancelamento = (id: string | null | undefined) =>
  MOTIVOS_CANCELAMENTO.find((m) => m.id === id) ?? null
