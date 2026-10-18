// Pagamento de motoboy — regra de negócio PURA (testável sem banco).
// Modelo do dono (16/10):
//   fixo     = salário semanal FIXO, pago por DÉBITO AUTOMÁTICO no PagBank
//              (não gera cobrança; o sistema só registra como despesa já paga)
//   variavel = só comissão (por entrega + por extra), somada de seg a sáb,
//              paga por PIX no sábado à tarde.
// Os dois fecham a semana no SÁBADO — é aí que a conta é gerada.

export type MotoboyTipo = 'fixo' | 'variavel'

// Semana de trabalho seg→sáb contendo a data (o dono fecha no sábado).
export function semanaSegSab(dataIso: string): { seg: string; sab: string } {
  const [y, m, d] = dataIso.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const dow = base.getUTCDay() // 0=dom, 6=sáb
  const toSeg = dow === 0 ? -6 : 1 - dow
  const seg = new Date(base); seg.setUTCDate(base.getUTCDate() + toSeg)
  const sab = new Date(seg); sab.setUTCDate(seg.getUTCDate() + 5)
  const fmt = (x: Date) => x.toISOString().slice(0, 10)
  return { seg: fmt(seg), sab: fmt(sab) }
}

// Total da semana do motoboy. 'fixo' ignora entregas/extras (salário fechado);
// 'variavel' ignora o fixo (que deve ser 0 no cadastro) e soma só comissão.
export function calcMotoboy(
  tipo: MotoboyTipo,
  fixo: number,
  porEntrega: number,
  porExtra: number,
  entregas: number,
  extras: number,
): { total: number; ehFixo: boolean } {
  const ehFixo = tipo === 'fixo'
  const base = ehFixo ? Number(fixo || 0) : 0
  const comissao = ehFixo ? 0 : Number(entregas || 0) * Number(porEntrega || 0) + Number(extras || 0) * Number(porExtra || 0)
  const total = Math.round((base + comissao) * 100) / 100
  return { total, ehFixo }
}
