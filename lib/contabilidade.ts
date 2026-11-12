import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { custoMensalCLT } from '@/lib/folha'
import { ehCompraDeMercadoria } from '@/lib/financeiro-setores'
import { normalizarUsuario } from '@/lib/utils'
import { vinculoEncerrado } from '@/lib/vinculo'

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

  // despesas (por loja_id) — pessoa_nome entra porque salário é conferido por pessoa
  let despesasQ = supabase.from('lancamentos')
    .select('valor, categoria, descricao, data_pagamento, loja_id, pessoa_nome').eq('tipo', 'pagar').eq('status', 'pago')
    .gte('data_pagamento', inicioTs).lt('data_pagamento', proxTs)
  if (lojaId) despesasQ = despesasQ.eq('loja_id', lojaId)

  const [vendas, comprasItens, despesas, perfis, cargosData] = await Promise.all([
    fetchAll<any>((from, to) => vendasQ.order('data').range(from, to)),
    fetchAll<any>((from, to) => comprasQ.order('notas_entrada.data_entrada').range(from, to)),
    fetchAll<any>((from, to) => despesasQ.order('data_pagamento').range(from, to)),
    fetchAll<any>((from, to) => supabase.from('perfis').select('id, nome, salario, cargo_id, vinculo, clt_vale_transporte, lojas_permitidas, pdv_loja_id, data_demissao').eq('ativo', true).order('nome').range(from, to)),
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

  // Despesas pagas — MENOS compra de mercadoria: essa é estoque e já entra em
  // `compras` (abaixo). Somar as duas contava a compra duas vezes no resultado.
  const despesasSemMercadoria = (despesas ?? []).filter((d) => !ehCompraDeMercadoria(d.categoria))

  // folha: filtra por loja (quem pode trabalhar nela); encargos só pra CLT
  // Desligado nunca entra na folha do mês — a mesma regra da tela Financeiro,
  // senão o DRE da contadora carrega salário de quem já saiu.
  const hojeContab = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const perfisAtivos = (perfis ?? []).filter((p) => !vinculoEncerrado(p.data_demissao, hojeContab))
  const perfisFiltrados = lojaId
    ? perfisAtivos.filter((p) => {
        // Loja PRINCIPAL = pdv_loja_id (se definida); senão, a única loja permitida.
        // Assim quem trabalha nas duas lojas NÃO aparece em dobro — entra só na principal.
        const pdv = p.pdv_loja_id as string | null
        if (pdv) return pdv === lojaId
        const ls = (p.lojas_permitidas ?? []) as string[]
        return ls.length === 1 && ls[0] === lojaId
      })
    : perfisAtivos
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

  // SALÁRIO NÃO PODE CONTAR DUAS VEZES — mas também não pode sumir.
  // Cada pessoa entra por UM caminho:
  //   tem salário no cadastro → o salário dela está na FOLHA (acima), então o
  //   lançamento pago que corresponde a esse mesmo salário sai de "despesas";
  //   não tem salário no cadastro (diarista/freelancer pago por semana) → entra
  //   pelos LANÇAMENTOS pagos, e não aparece na folha.
  //
  // O abatimento é LIMITADO ao salário da pessoa. Categoria 'Salários' também
  // carrega adiantamento, rescisão, hora extra e comissão — custo que a folha não
  // cobre. Tudo que passar do salário do cadastro continua contando como despesa.
  // Sem essa divisão, o mês que pagava o salário era descontado duas vezes (em
  // outubro/2026, 8.897,33 contados em dobro).
  const temSalarioNoCadastro = new Map<string, number>()
  for (const f of folhaLista) {
    const chave = normalizarUsuario(f.nome)
    if (f.salario > 0) temSalarioNoCadastro.set(chave, f.salario)
  }
  const despesasList: typeof despesasSemMercadoria = []
  for (const d of despesasSemMercadoria) {
    const chave = normalizarUsuario((d as { pessoa_nome?: string | null }).pessoa_nome ?? '')
    const salarioDaPessoa = chave ? temSalarioNoCadastro.get(chave) ?? 0 : 0
    const ehSalario = normalizarUsuario(d.categoria ?? '') === 'salarios'
    if (!ehSalario || salarioDaPessoa <= 0) { despesasList.push(d); continue }
    const valor = Number(d.valor ?? 0)
    const coberto = Math.min(valor, salarioDaPessoa)
    const sobra = Math.round((valor - coberto) * 100) / 100
    temSalarioNoCadastro.set(chave, Math.round((salarioDaPessoa - coberto) * 100) / 100)
    // o que passou do salário do cadastro (rescisão, hora extra, comissão) segue despesa
    if (sobra > 0.004) despesasList.push({ ...d, valor: sobra })
  }
  const despesasTotal = despesasList.reduce((s, d) => s + Number(d.valor ?? 0), 0)

  // O desconto NÃO é subtraído de novo: `vendas.total` já é o valor líquido
  // (soma dos itens − desconto). A tela mostra o desconto como informação.
  const resultado = faturamento - compras - despesasTotal - folha - folhaEncargos

  // despesas agrupadas por categoria (sem mercadoria — ela é compra/estoque)
  const catMap: Record<string, number> = {}
  for (const d of despesasList) {
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

  const despesasLista = despesasList.map((d) => ({
    data: new Date(d.data_pagamento).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
    categoria: (d.categoria || 'Sem categoria').trim(),
    descricao: d.descricao || '—',
    valor: Number(d.valor ?? 0),
  }))

  return { mes, inicio, proxMes, faturamento, descontos, compras, despesasTotal, folha, folhaEncargos, resultado, porCategoria, porDia, notas, despesas: despesasLista, folhaLista }
}
