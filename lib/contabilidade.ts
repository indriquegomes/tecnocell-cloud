import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { custoMensalCLT } from '@/lib/folha'

// Fonte única dos dados da Contabilidade (tela + exportação). A contadora precisa
// do DRE simplificado: faturamento, compras, despesas, folha (com encargos) e
// resultado — mais os detalhes. Aceita filtro por loja (vendas/compras por depósito,
// despesas por loja_id, folha por lojas_permitidas).
export type DadosContabilidade = {
  mes: string
  inicio: string
  proxMes: string
  faturamento: number
  descontos: number
  compras: number
  despesasTotal: number
  folha: number
  folhaEncargos: number
  resultado: number
  porCategoria: { categoria: string; total: number }[]
  porDia: { dia: string; qtd: number; total: number }[]
  notas: { numero: string; fornecedor: string; data: string; valor: number }[]
  despesas: { data: string; categoria: string; descricao: string; valor: number }[]
  folhaLista: { nome: string; cargo: string; vinculo: string; salario: number; encargos: number }[]
}

export async function buscarDadosContabilidade(mes: string, lojaId?: string): Promise<DadosContabilidade> {
  const supabase = await createServiceClient()
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  // timestamptz corta em São Paulo (sem o -03:00, venda das 22h30 cai no mês seguinte)
  const inicioTs = inicio + 'T00:00:00-03:00'
  const proxTs = proxMes + 'T00:00:00-03:00'

  // depósitos da loja (quando filtrada) — vendas e compras são por depósito
  let depositosDaLoja: string[] | null = null
  if (lojaId) {
    const deps = await fetchAll<{ id: string }>((from, to) => supabase.from('depositos').select('id').eq('loja_id', lojaId).range(from, to))
    depositosDaLoja = (deps ?? []).map((d) => d.id)
  }

  // vendas (por depósito)
  let vendasQ = supabase.from('vendas')
    .select('data, total, desconto').eq('status', 'concluida').lt('numero', 100000).eq('uso_interno', false)
    .gte('data', inicioTs).lt('data', proxTs)
  if (depositosDaLoja) vendasQ = vendasQ.in('deposito_id', depositosDaLoja)

  // compras: itens de nota (têm depósito) + a nota (data, número, fornecedor, status)
  let comprasQ = supabase.from('itens_nota_entrada')
    .select('nota_id, total_item, deposito_id, notas_entrada!inner(numero, fornecedor_id, data_entrada, status)')
    .neq('notas_entrada.status', 'cancelada')
    .gte('notas_entrada.data_entrada', inicio).lt('notas_entrada.data_entrada', proxMes)
  if (depositosDaLoja) comprasQ = comprasQ.in('deposito_id', depositosDaLoja)

  // despesas (por loja_id)
  let despesasQ = supabase.from('lancamentos')
    .select('valor, categoria, descricao, data_pagamento, loja_id').eq('tipo', 'pagar').eq('status', 'pago')
    .gte('data_pagamento', inicioTs).lt('data_pagamento', proxTs)
  if (lojaId) despesasQ = despesasQ.eq('loja_id', lojaId)

  const [vendas, comprasItens, despesas, perfis, cargosData] = await Promise.all([
    fetchAll<any>((from, to) => vendasQ.order('data').range(from, to)),
    fetchAll<any>((from, to) => comprasQ.order('notas_entrada.data_entrada').range(from, to)),
    fetchAll<any>((from, to) => despesasQ.order('data_pagamento').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, salario, cargo_id, vinculo, clt_vale_transporte, lojas_permitidas, pdv_loja_id').eq('ativo', true).order('nome').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('cargos').select('id, nome').eq('ativo', true).range(from, to)),
  ])

  // nome do fornecedor de cada nota
  const fornecedorIds = [...new Set((comprasItens ?? []).map((c) => c.notas_entrada?.fornecedor_id).filter(Boolean))] as string[]
  const fornecedores = fornecedorIds.length
    ? await fetchAll<any>((from, to) => supabase.from('pessoas').select('id, nome').in('id', fornecedorIds).range(from, to))
    : []
  const nomeFornecedor = new Map((fornecedores ?? []).map((f) => [f.id, f.nome as string]))
  const nomeCargo = new Map((cargosData ?? []).map((c) => [c.id, c.nome as string]))

  const faturamento = (vendas ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0)
  const descontos = (vendas ?? []).reduce((s, v) => s + Number(v.desconto ?? 0), 0)

  // compras agrupadas por nota (soma dos itens)
  const notaMap = new Map<string, { numero: string; fornecedor_id: string; data: string; valor: number }>()
  for (const c of (comprasItens ?? [])) {
    const n = c.notas_entrada
    const key = c.nota_id ?? (n?.numero ?? '—')
    if (!notaMap.has(key)) notaMap.set(key, { numero: n?.numero ?? '—', fornecedor_id: n?.fornecedor_id ?? '', data: n?.data_entrada ?? '', valor: 0 })
    notaMap.get(key)!.valor += Number(c.total_item ?? 0)
  }
  const notas = [...notaMap.values()]
    .map((n) => ({ numero: n.numero, fornecedor: nomeFornecedor.get(n.fornecedor_id) ?? '—', data: n.data, valor: n.valor }))
    .sort((a, b) => a.data.localeCompare(b.data))
  const compras = notas.reduce((s, n) => s + n.valor, 0)

  const despesasTotal = (despesas ?? []).reduce((s, d) => s + Number(d.valor ?? 0), 0)

  // folha: filtra por loja (quem pode trabalhar nela); encargos só pra CLT
  const perfisFiltrados = lojaId
    ? (perfis ?? []).filter((p) => {
        // Loja PRINCIPAL = pdv_loja_id (se definida); senão, a única loja permitida.
        // Assim quem trabalha nas duas lojas NÃO aparece em dobro — entra só na principal.
        const pdv = p.pdv_loja_id as string | null
        if (pdv) return pdv === lojaId
        const ls = (p.lojas_permitidas ?? []) as string[]
        return ls.length === 1 && ls[0] === lojaId
      })
    : (perfis ?? [])
  const folhaLista = perfisFiltrados.map((p) => {
    const salario = Number(p.salario ?? 0)
    const vinculo = (p.vinculo ?? '') as string
    const encargos = vinculo === 'clt'
      ? (custoMensalCLT(salario, Number(p.clt_vale_transporte ?? 0)).total - salario)
      : 0
    return { nome: p.nome ?? '—', cargo: nomeCargo.get(p.cargo_id) ?? '—', vinculo, salario, encargos }
  })
  const folha = folhaLista.reduce((s, f) => s + f.salario, 0)
  const folhaEncargos = folhaLista.reduce((s, f) => s + f.encargos, 0)

  const resultado = faturamento - descontos - compras - despesasTotal - folha - folhaEncargos

  // despesas agrupadas por categoria
  const catMap: Record<string, number> = {}
  for (const d of (despesas ?? [])) {
    const cat = (d.categoria || 'Sem categoria').trim()
    catMap[cat] = (catMap[cat] ?? 0) + Number(d.valor ?? 0)
  }
  const porCategoria = Object.entries(catMap).map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)

  // faturamento por dia
  const diaMap: Record<string, { qtd: number; total: number }> = {}
  for (const v of (vendas ?? [])) {
    const dia = new Date(v.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    diaMap[dia] = diaMap[dia] ?? { qtd: 0, total: 0 }
    diaMap[dia].qtd++
    diaMap[dia].total += Number(v.total ?? 0)
  }
  const porDia = Object.entries(diaMap).map(([dia, v]) => ({ dia, qtd: v.qtd, total: v.total })).sort((a, b) => a.dia.localeCompare(b.dia))

  const despesasList = (despesas ?? []).map((d) => ({
    data: new Date(d.data_pagamento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    categoria: (d.categoria || 'Sem categoria').trim(),
    descricao: d.descricao || '—',
    valor: Number(d.valor ?? 0),
  }))

  return { mes, inicio, proxMes, faturamento, descontos, compras, despesasTotal, folha, folhaEncargos, resultado, porCategoria, porDia, notas, despesas: despesasList, folhaLista }
}
