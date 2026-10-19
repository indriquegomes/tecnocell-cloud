import { createServiceClient, fetchAll } from '@/lib/supabase/server'

// Fonte única dos dados da Contabilidade (tela + exportação). A contadora precisa
// do DRE simplificado: faturamento, compras, despesas, folha e resultado — mais os
// detalhes (por categoria, por dia, notas de entrada, despesas e folha).
export type DadosContabilidade = {
  mes: string
  inicio: string
  proxMes: string
  faturamento: number
  descontos: number
  compras: number
  despesasTotal: number
  folha: number
  resultado: number
  porCategoria: { categoria: string; total: number }[]
  porDia: { dia: string; qtd: number; total: number }[]
  notas: { numero: string; fornecedor: string; data: string; valor: number }[]
  despesas: { data: string; categoria: string; descricao: string; valor: number }[]
  folhaLista: { nome: string; cargo: string; salario: number }[]
}

export async function buscarDadosContabilidade(mes: string): Promise<DadosContabilidade> {
  const supabase = await createServiceClient()
  const [ano, m] = mes.split('-').map(Number)
  const inicio = mes + '-01'
  const proxMes = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`
  // timestamptz corta em São Paulo (sem o -03:00, venda das 22h30 cai no mês seguinte)
  const inicioTs = inicio + 'T00:00:00-03:00'
  const proxTs = proxMes + 'T00:00:00-03:00'

  const [vendas, notas, despesas, perfis, cargosData] = await Promise.all([
    fetchAll<any>((from, to) => supabase.from('vendas')
      .select('data, total, desconto').eq('status', 'concluida').lt('numero', 100000).eq('uso_interno', false)
      .gte('data', inicioTs).lt('data', proxTs).order('data').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('notas_entrada')
      .select('numero, fornecedor_id, data_entrada, valor_total').neq('status', 'cancelada')
      .gte('data_entrada', inicio).lt('data_entrada', proxMes).order('data_entrada').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('lancamentos')
      .select('valor, categoria, descricao, data_pagamento').eq('tipo', 'pagar').eq('status', 'pago')
      .gte('data_pagamento', inicioTs).lt('data_pagamento', proxTs).order('data_pagamento').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, salario, cargo_id').eq('ativo', true).order('nome').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('cargos').select('id, nome').eq('ativo', true).range(from, to)),
  ])

  // nome do fornecedor de cada nota
  const fornecedorIds = [...new Set((notas ?? []).map((n) => n.fornecedor_id).filter(Boolean))] as string[]
  const fornecedores = fornecedorIds.length
    ? await fetchAll<any>((from, to) => supabase.from('pessoas').select('id, nome').in('id', fornecedorIds).range(from, to))
    : []
  const nomeFornecedor = new Map((fornecedores ?? []).map((f) => [f.id, f.nome as string]))
  const nomeCargo = new Map((cargosData ?? []).map((c) => [c.id, c.nome as string]))

  const faturamento = (vendas ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0)
  const descontos = (vendas ?? []).reduce((s, v) => s + Number(v.desconto ?? 0), 0)
  const compras = (notas ?? []).reduce((s, n) => s + Number(n.valor_total ?? 0), 0)
  const despesasTotal = (despesas ?? []).reduce((s, d) => s + Number(d.valor ?? 0), 0)
  const folha = (perfis ?? []).reduce((s, p) => s + Number(p.salario ?? 0), 0)
  const resultado = faturamento - descontos - compras - despesasTotal - folha

  // despesas agrupadas por categoria (maior primeiro)
  const catMap: Record<string, number> = {}
  for (const d of (despesas ?? [])) {
    const cat = (d.categoria || 'Sem categoria').trim()
    catMap[cat] = (catMap[cat] ?? 0) + Number(d.valor ?? 0)
  }
  const porCategoria = Object.entries(catMap).map(([categoria, total]) => ({ categoria, total })).sort((a, b) => b.total - a.total)

  // faturamento por dia (conciliação diária)
  const diaMap: Record<string, { qtd: number; total: number }> = {}
  for (const v of (vendas ?? [])) {
    const dia = new Date(v.data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    diaMap[dia] = diaMap[dia] ?? { qtd: 0, total: 0 }
    diaMap[dia].qtd++
    diaMap[dia].total += Number(v.total ?? 0)
  }
  const porDia = Object.entries(diaMap).map(([dia, v]) => ({ dia, qtd: v.qtd, total: v.total })).sort((a, b) => a.dia.localeCompare(b.dia))

  const notasList = (notas ?? []).map((n) => ({
    numero: n.numero ?? '—',
    fornecedor: nomeFornecedor.get(n.fornecedor_id) ?? '—',
    data: n.data_entrada ?? '',
    valor: Number(n.valor_total ?? 0),
  }))

  const despesasList = (despesas ?? []).map((d) => ({
    data: new Date(d.data_pagamento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    categoria: (d.categoria || 'Sem categoria').trim(),
    descricao: d.descricao || '—',
    valor: Number(d.valor ?? 0),
  }))

  const folhaLista = (perfis ?? []).map((p) => ({
    nome: p.nome ?? '—',
    cargo: nomeCargo.get(p.cargo_id) ?? '—',
    salario: Number(p.salario ?? 0),
  }))

  return { mes, inicio, proxMes, faturamento, descontos, compras, despesasTotal, folha, resultado, porCategoria, porDia, notas: notasList, despesas: despesasList, folhaLista }
}
