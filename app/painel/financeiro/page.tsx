import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { lojasDoUsuario } from '@/lib/lojas-usuario'
import { FinanceiroTabs } from './FinanceiroTabs'
import { IconWallet } from '@/components/icons'
import { formatBRL, hojeSP } from '@/lib/utils'
import { BuscaFinanceiro } from './BuscaFinanceiro'
import { Paginacao } from '@/components/Paginacao'
import { LinhaEditable } from './LinhaEditable'
import { gerarFolha } from './actions'
import Link from 'next/link'
import { Dica } from '@/components/Dica'
import { ExportCsv } from '../relatorios/ExportCsv'

// Grupos de categoria pros filtros rápidos (chips) do topo do Financeiro.
const GRUPOS_FINANCEIRO: Record<string, { label: string; categorias?: string[]; tipo?: 'funcionarios' | 'freelancers' }> = {
  funcionarios: { label: '👥 Funcionários', tipo: 'funcionarios' },
  freelancers:  { label: '🎒 Freelancers', tipo: 'freelancers' },
  fornecedores: { label: '🏭 Fornecedores', categorias: ['Fornecedor / Mercadoria', 'Mercadoria'] },
  fixas:        { label: '📌 Contas fixas', categorias: ['Aluguel', 'Energia/Luz', 'Contabilidade', 'Impostos'] },
}

const CATEGORIAS_FINANCEIRO: { grupo: string; categorias: string[] }[] = [
  { grupo: 'Despesas da Loja', categorias: ['Alimentação', 'Combustível', 'Aluguel', 'Salários', 'Motoboy', 'Contabilidade', 'Energia/Luz', 'Impostos', 'Mercadoria', 'Serviços', 'Uso interno', 'Perda', 'Manutenção', 'Transporte', 'Limpeza', 'Saúde', 'Confraternização', 'Gastos em São Paulo'] },
  { grupo: 'Sócio', categorias: ['Retirada do sócio'] },
  { grupo: 'Outros', categorias: ['Estorno', 'Outras despesas', 'Combinado na entrega', 'Vale crédito usado', 'Dívida parcelada'] },
]

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; busca?: string; ordem?: string; dir?: string; status?: string; de?: string; ate?: string; pessoa?: string; forma?: string; conta?: string; categoria?: string; grupo?: string; tudo?: string; valor_min?: string; valor_max?: string; campo?: string; erro?: string; ok?: string; loja?: string; pagina?: string }>
}) {
  const params = await searchParams
  const supabase = await createServiceClient()
  // Loja ativa rege o default: financeiro mostra UMA loja por vez (contas fixas e
  // novas de cada loja são separadas). 'sem' = despesas antigas ainda sem loja.
  const { ativa, operaveis } = await lojasDoUsuario().catch(() => ({ ativa: null, operaveis: [] as { id: string; nome: string }[] }))
  const lojaEfetiva = params.loja && (params.loja === 'sem' || params.loja === 'todas' || operaveis.some((l) => l.id === params.loja)) ? params.loja : (ativa?.id ?? 'sem')

  // Campo de data pelo qual filtrar o período (Busca Avançada, igual SIGE:
  // Vencimento × Competência × Pagamento). Default vencimento.
  const camposData = ['data_vencimento', 'data_competencia', 'data_pagamento']
  const campoData = camposData.includes(params.campo ?? '') ? params.campo! : 'data_vencimento'

  // Dropdowns da busca avançada
  const [{ data: formasList }, { data: contasList }] = await Promise.all([
    supabase.from('formas_pagamento').select('nome').order('nome'),
    supabase.from('contas').select('id, nome').eq('ativa', true).order('nome'),
  ])
  const formasOpc = [...new Set((formasList ?? []).map((f) => f.nome as string))]
  const contasOpc = (contasList ?? []) as { id: string; nome: string }[]
  const categoriasOpc = CATEGORIAS_FINANCEIRO.flatMap((g) => g.categorias)

  // Aplica TODOS os filtros da busca avançada a uma query (reusado na lista e nos totais)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Filtro SÓ de loja (sem busca/tipo) — pros cards de resumo e "último pagamento",
  // que somam por loja sem esconder pelo texto digitado.
  const aplicaLoja = (q: any): any => {
    if (lojaEfetiva === 'sem') return q.is('loja_id', null)
    if (lojaEfetiva !== 'todas') return q.eq('loja_id', lojaEfetiva)
    return q
  }
  // Funcionário = quem tem cadastro em perfis. Freelancer = quem presta serviço
  // pontual e NÃO está na folha. A distinção é pelo cadastro, não pela categoria.
  const { data: perfisNomesData } = await supabase.from('perfis').select('nome')
  const nomesFuncionarios = ((perfisNomesData ?? []) as { nome: string | null }[])
    .map((p) => p.nome).filter((n): n is string => !!n)
  const inFuncionarios = '(' + nomesFuncionarios.map((n) => '"' + n.replace(/"/g, '') + '"').join(',') + ')'

  // Período padrão/cálculo dos chips. Sem filtro de data, a lista abre no MÊS ATUAL
  // (não em todo o histórico) — 'tudo=1' mostra tudo.
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hojeD = new Date(hojeSP() + 'T12:00:00')
  const mesIni = hojeSP().slice(0, 7) + '-01'
  const mesFim = iso(new Date(hojeD.getFullYear(), hojeD.getMonth() + 1, 0))
  const verTudo = params.tudo === '1'

  const aplica = (q: any): any => {
    q = aplicaLoja(q)
    if (params.tipo === 'pagar' || params.tipo === 'receber') q = q.eq('tipo', params.tipo)
    if (params.busca) { for (const w of params.busca.replace(/[,()%]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6)) q = q.or(`descricao.ilike.%${w}%,pessoa_nome.ilike.%${w}%,categoria.ilike.%${w}%`) }
    if (params.pessoa) q = q.ilike('pessoa_nome', `%${params.pessoa}%`)
    if (params.forma) q = q.eq('forma_pagamento', params.forma)
    if (params.conta) q = q.eq('conta_id', params.conta)
    if (params.categoria) q = q.eq('categoria', params.categoria)
    if (params.grupo && GRUPOS_FINANCEIRO[params.grupo]) {
      const g = GRUPOS_FINANCEIRO[params.grupo]
      if (g.categorias) q = q.in('categoria', g.categorias)
      else if (g.tipo === 'funcionarios') q = q.in('pessoa_nome', nomesFuncionarios)
      else if (g.tipo === 'freelancers') q = q.not('pessoa_nome', 'in', inFuncionarios).ilike('categoria', 'motoboy')
    }
    if (params.valor_min) q = q.gte('valor', Number(params.valor_min))
    if (params.valor_max) q = q.lte('valor', Number(params.valor_max))
    if (params.status === 'pago') q = q.eq('status', 'pago')
    else if (params.status === 'pendente') q = q.neq('status', 'pago')
    else if (params.status === 'vencido') q = q.neq('status', 'pago').lt('data_vencimento', hojeSP())
    const deEfetivo = params.de ?? (verTudo ? undefined : mesIni)
    const ateEfetivo = params.ate ?? (verTudo ? undefined : mesFim)
    if (deEfetivo) q = q.gte(campoData, deEfetivo)
    if (ateEfetivo) q = q.lte(campoData, ateEfetivo)
    return q
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const temFiltro = !!(params.busca || params.pessoa || params.forma || params.conta || params.categoria || params.valor_min || params.valor_max || params.status || params.de || params.ate || params.tipo)

  const ordemAtual = params.ordem ?? 'data_vencimento'
  const ordemDir = params.dir === 'desc'
  const camposDB: Record<string, string> = { data_vencimento: 'data_vencimento', valor: 'valor', descricao: 'descricao', pessoa_nome: 'pessoa_nome', tipo: 'tipo', status: 'status' }
  const baseParams: Record<string, string> = {}
  for (const k of ['tipo', 'busca', 'status', 'de', 'ate', 'pessoa', 'forma', 'conta', 'categoria', 'grupo', 'valor_min', 'valor_max', 'campo', 'loja'] as const) {
    if (params[k]) baseParams[k] = params[k]!
  }
  const sortLink = (o: string) => {
    const ativo = ordemAtual === o
    const nextDir = ativo ? (ordemDir ? 'asc' : 'desc') : 'asc'
    const arrow = ativo ? (ordemDir ? '↓' : '↑') : '↕'
    const qs = new URLSearchParams({ ...baseParams, ordem: o, ...(nextDir === 'desc' ? { dir: 'desc' } : {}) }).toString()
    return { href: `/painel/financeiro?${qs}`, arrow, ativo }
  }

  // A lista era cortada em 200 sem "próxima página": filtrar certo e não achar a
  // linha porque ela era a 201ª. Agora pagina de 200 em 200 e mostra o total real.
  const POR_PAGINA = 200
  const pagina = Math.max(1, Number(params.pagina) || 1)
  const listaQuery = supabase
    .from('lancamentos')
    .select('id, codigo, descricao, valor, tipo, status, data_vencimento, data_pagamento, data_competencia, forma_pagamento, pessoa_nome, categoria, comprovante_url', { count: 'exact' })
    .order(camposDB[ordemAtual] ?? 'data_vencimento', { ascending: !ordemDir })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
  const { data: lancamentos, count: totalLista } = await aplica(listaQuery)
  const totalRegistros = totalLista ?? 0
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / POR_PAGINA))

  type LancRow = { id: string; codigo: string | null; descricao: string | null; valor: number | null; tipo: string; status: string | null; data_vencimento: string | null; data_pagamento: string | null; data_competencia: string | null; forma_pagamento: string | null; pessoa_nome: string | null; categoria: string | null; comprovante_url: string | null }
  const todos = (lancamentos ?? []) as LancRow[]

  // Comprovantes ficam no bucket privado `pagamentos` — troca o caminho por URL
  // assinada (1h) pra abrir no navegador.
  const comprovanteUrl = new Map<string, string>()
  await Promise.all(todos.filter((l) => l.comprovante_url).map(async (l) => {
    const { data } = await supabase.storage.from('pagamentos').createSignedUrl(l.comprovante_url!, 3600)
    if (data?.signedUrl) comprovanteUrl.set(l.id, data.signedUrl)
  }))

  // Lancamentos com movimento de caixa ligado (quitados pelo Financeiro). Só esses
  // têm "Desfazer" seguro — PDV/OS quitam sem gravar lancamento_id.
  const { data: movsLigados } = await supabase
    .from('movimentos_caixa')
    .select('lancamento_id')
    .not('lancamento_id', 'is', null)
    .eq('tipo', 'recebimento')
    .eq('origem', 'financeiro')
  const idsDesfazer = new Set(((movsLigados ?? []) as { lancamento_id: string }[]).map((m) => m.lancamento_id))

  // ✨ Totais DO FILTRO (não só os globais): soma exatamente o que está filtrado,
  // sem o cap de 200 da lista. Isa: "quanto tenho a receber em PIX vencendo em agosto".
  const filtrados = await fetchAll<Record<string, unknown> & { valor: number | null; tipo: string; status: string | null }>(
    (from, to) => aplica(supabase.from('lancamentos')
      .select('descricao, pessoa_nome, data_vencimento, data_competencia, valor, tipo, status, forma_pagamento, categoria'))
      .range(from, to)
  )
  const fReceber = filtrados.filter((l) => l.tipo === 'receber').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fPagar = filtrados.filter((l) => l.tipo === 'pagar').reduce((s, l) => s + (l.valor ?? 0), 0)
  const fCount = filtrados.length
  const labelCampo: Record<string, string> = { data_vencimento: 'Vencimento', data_competencia: 'Competência', data_pagamento: 'Pagamento' }
  // Cards de resumo somam TODOS os pendentes (globais), sem o cap de 200 da lista
  // nem o filtro de busca/tipo — senão os totais subcontam quando houver >200 lançamentos.
  const paraTotais = await fetchAll<{ valor: number | null; valor_pago: number | null; tipo: string; status: string | null }>(
    (from, to) => aplicaLoja(supabase.from('lancamentos').select('valor, valor_pago, tipo, status')).range(from, to)
  )
  // Só conta status 'pendente' (não 'cancelado') e soma o RESTANTE (valor - valor_pago),
  // não o valor cheio. Antes somava o cheio e incluía cancelado — o card "A Receber"
  // aparecia com ~o dobro do que é de verdade.
  const restanteDe = (l: { valor: number | null; valor_pago: number | null }) => (l.valor ?? 0) - (l.valor_pago ?? 0)
  const totalReceber = paraTotais.filter((l) => l.tipo === 'receber' && l.status === 'pendente').reduce((s, l) => s + restanteDe(l), 0)
  const totalPagar = paraTotais.filter((l) => l.tipo === 'pagar' && l.status === 'pendente').reduce((s, l) => s + restanteDe(l), 0)
  const pendentes = paraTotais.filter((l) => l.status === 'pendente').length

  // Último pagamento da pessoa escolhida — faixa informativa no topo da lista.
  // Não filtra nada: a lista principal já mostra tudo dela.
  const ultimoPessoa = params.pessoa
    ? (await aplicaLoja(supabase.from('lancamentos')
        .select('descricao, valor, categoria, status, forma_pagamento, data_vencimento, tipo')
        .ilike('pessoa_nome', `%${params.pessoa}%`)
        .order('data_vencimento', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)).maybeSingle()).data ?? null
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconWallet className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Financeiro</h2>
        <Dica texto="Controle de contas a pagar e a receber. Registre despesas, receitas e acompanhe o saldo pendente." />
      </div>

      {params.erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.erro}</div>
      )}

      {params.ok && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{params.ok}</div>
      )}

      <FinanceiroTabs active={params.tipo === 'receber' ? 'receber' : params.tipo === 'pagar' ? 'pagar' : 'lancamentos'} />

      {/* Ações — criar e gerar separados do cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Novo lançamento</span>
        <Link href="/painel/financeiro/novo?tipo=receber"
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition">
          + A Receber
        </Link>
        <Link href="/painel/financeiro/novo?tipo=pagar"
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
          + A Pagar
        </Link>
        <div className="mx-2 hidden h-6 w-px bg-gray-200 sm:block" />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Gerar</span>
        <form action={gerarFolha} className="flex items-center gap-2">
          <input type="date" name="vencimento" defaultValue={hojeSP()}
            title="Vencimento dos salários"
            className="rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="submit"
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition">
            Gerar folha de salários
          </button>
        </form>
      </div>



      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-700">A Receber (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-green-700">{formatBRL(totalReceber)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">A Pagar (pendente)</p>
          <p className="mt-1 text-3xl font-bold text-red-700">{formatBRL(totalPagar)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Pendentes</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{pendentes}</p>
        </div>
      </div>

      {/* Filtro sempre visível. Antes tudo isso ficava escondido dentro de uma caixa
          "Busca Avançada" fechada: quem abria a tela não via filtro nenhum. */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <BuscaFinanceiro
          params={{ ...params, de: params.de ?? (verTudo ? '' : mesIni), ate: params.ate ?? (verTudo ? '' : mesFim) }}
          lojaEfetiva={lojaEfetiva}
          operaveis={operaveis}
          formasOpc={formasOpc}
          contasOpc={contasOpc}
          categoriasGrupos={CATEGORIAS_FINANCEIRO}
          camposData={camposData}
          labelCampo={labelCampo}
          temFiltro={temFiltro}
        />
      </div>

      {/* ✨ Último pagamento da pessoa escolhida (informativo, não é filtro) */}
      {params.pessoa && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          {ultimoPessoa ? (
            <p className="text-sm text-gray-800">
              <span className="font-semibold text-gray-900">Último pagamento para {params.pessoa}:</span>{' '}
              <span className="font-bold tabular-nums">{ultimoPessoa.tipo === 'receber' ? '+' : '−'}{formatBRL(Number(ultimoPessoa.valor ?? 0))}</span>
              {' '}— {ultimoPessoa.descricao || 'sem descrição'}
              {ultimoPessoa.forma_pagamento ? ' · ' + ultimoPessoa.forma_pagamento : ''}
              {ultimoPessoa.categoria ? ' · ' + ultimoPessoa.categoria : ''}
              {' · '}{(ultimoPessoa.data_vencimento ?? '').slice(0, 10).split('-').reverse().join('/')}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Nenhum lançamento para {params.pessoa}.</p>
          )}
        </div>
      )}

      {/* ✨ Totais do que está filtrado (não só o global) + exportar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-gray-100 bg-gray-50/60 px-5 py-3 text-sm">
        <span className="font-semibold text-gray-500">Total no filtro (pago + pendente):</span>
        <span>Receber <b className="text-green-600">{formatBRL(fReceber)}</b></span>
        <span>Pagar <b className="text-red-500">{formatBRL(fPagar)}</b></span>
        <span className="text-gray-400">{fCount} lançamento(s)</span>
        <div className="ml-auto">
          <ExportCsv filename={`financeiro_${hojeSP()}.csv`}
            cols={[{ key: 'descricao', label: 'Descrição' }, { key: 'pessoa_nome', label: 'Pessoa' }, { key: 'data_vencimento', label: 'Vencimento' }, { key: 'data_competencia', label: 'Competência' }, { key: 'valor', label: 'Valor', money: true }, { key: 'tipo', label: 'Tipo' }, { key: 'status', label: 'Status' }, { key: 'forma_pagamento', label: 'Forma' }, { key: 'categoria', label: 'Categoria' }]}
            rows={filtrados as unknown as Record<string, unknown>[]} />
        </div>
      </div>

      {/* Sugestões de forma de pagamento (o campo é texto livre, mas sugere as formas do cadastro) */}
      <datalist id="formas-lista">
        {formasOpc.map((f) => <option key={f} value={f} />)}
        <option value="Pix chave" />
        <option value="Conta nº" />
        <option value="Transferência" />
      </datalist>
      {/* Sugestões de categoria (campo editável na linha) */}
      <datalist id="categorias-lista">
        {categoriasOpc.map((c) => <option key={c} value={c} />)}
      </datalist>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {[
                { o: 'descricao',      l: 'Descrição',  a: 'text-left' },
                { o: 'pessoa_nome',    l: 'Pessoa',     a: 'text-left' },
                { o: 'data_vencimento', l: 'Vencimento', a: 'text-left' },
                { o: 'forma_pagamento', l: 'Forma',      a: 'text-left' },
                { o: 'valor',          l: 'Valor',      a: 'text-right' },
                { o: 'tipo',           l: 'Tipo',       a: 'text-center' },
                { o: 'status',         l: 'Status',     a: 'text-center' },
              ].map(({ o, l, a }) => {
                const s = sortLink(o)
                return <th key={o} className={`px-4 py-3 ${a} text-xs font-semibold text-gray-500 uppercase tracking-wide`}>
                  <Link href={s.href} className={`inline-flex items-center gap-1 hover:text-gray-800 transition ${s.ativo ? 'text-blue-600' : ''}`}>{l} <span className="text-gray-400">{s.arrow}</span></Link>
                </th>
              })}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {todos.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  Nenhum lançamento encontrado.
                </td>
              </tr>
            ) : (
              todos.map((l) => (
                <LinhaEditable
                  key={l.id}
                  lanc={l}
                  comprovanteUrl={comprovanteUrl.get(l.id) ?? null}
                  idsDesfazer={idsDesfazer.has(l.id)}
                  formasOpc={formasOpc}
                  filtroBase={new URLSearchParams(baseParams).toString()}
                />
              ))
            )}
          </tbody>
        </table>
        <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={totalRegistros} params={baseParams} basePath="/painel/financeiro" />
      </div>
    </div>
  )
}
