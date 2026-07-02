// Tipo da forma de pagamento — é o TIPO que define o comportamento no PDV
// (troco, pendência/fiado, máquina/parcela), NÃO o nome. Renomear é seguro.

export const TIPOS_PAGAMENTO = [
  { key: 'dinheiro',       label: 'Dinheiro',              desc: 'Dá troco' },
  { key: 'pix',            label: 'PIX',                   desc: 'À vista, sem taxa' },
  { key: 'cartao_credito', label: 'Cartão de Crédito',     desc: 'Máquina + parcelas + taxa' },
  { key: 'cartao_debito',  label: 'Cartão de Débito',      desc: 'Máquina + taxa' },
  { key: 'fiado',          label: 'Crédito Loja (Fiado)',  desc: 'Vira pendência a receber' },
  { key: 'outro',          label: 'Outro',                 desc: 'Sem regra especial' },
] as const

export type TipoPagamento = typeof TIPOS_PAGAMENTO[number]['key']

export function labelTipoPagamento(tipo: string | null): string {
  return TIPOS_PAGAMENTO.find((t) => t.key === tipo)?.label ?? '—'
}
