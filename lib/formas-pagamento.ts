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

export function tipoUsaMaquina(tipo: string | null): boolean {
  return tipo === 'cartao_credito' || tipo === 'cartao_debito'
}

// Quando o dinheiro entra de verdade. Alimenta a previsão de recebimento.
export const PRAZOS_RECEBIMENTO = [
  { key: 'a_vista',     label: 'Na hora',            dias: 0 },
  { key: 'd1',          label: '1 dia útil',         dias: 1 },
  { key: 'd2',          label: '2 dias',             dias: 2 },
  { key: 'd7',          label: '7 dias',             dias: 7 },
  { key: 'd15',         label: '15 dias',            dias: 15 },
  { key: 'd30',         label: '30 dias',            dias: 30 },
  { key: 'por_parcela', label: 'Conforme parcelas',  dias: null },
] as const

export function labelPrazo(prazo: string | null): string {
  return PRAZOS_RECEBIMENTO.find((p) => p.key === prazo)?.label ?? 'Na hora'
}
