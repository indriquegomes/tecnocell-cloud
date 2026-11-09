import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/utils'
import { FinanceiroTabs } from '../FinanceiroTabs'
import { BotaoLancarComissao } from './BotaoLancarComissao'

// COMISSÃO DO MÊS — a conta inteira numa tela.
//
// Regra do dono (02-03/11/2026), em duas partes:
//   META     = % da faixa batida, conferida na VENDA BRUTA da loja. Paga no 5º dia útil.
//   COMISSÃO = 0,5% da venda bruta MENOS as devoluções do mês. Paga no dia 20.
// Cada loja divide com as vendedoras dela, em partes iguais.
// As escadas ficam em `configuracoes`, chave `metas_comissao:<AAAA-MM>`.
// O time de cada loja fica em `configuracoes`, chave `time_comissao`.
//
// O PERCENTUAL DA COMISSÃO é UM SÓ, e mora em Configurações (`pdv.comissao_percentual`,
// digitado como 0,5 = meio por cento). Ele já era usado pelo Painel do vendedor e pelo
// relatório de comissão; aqui ele passou a valer também. Antes esta tela lia um
// `comissao` próprio dentro do JSON de metas (0.005), então mudar em Configurações não
// mudava a comissão — dois lugares com o mesmo número. O JSON fica só como reserva,
// para mês antigo gravado antes desta unificação.

type Escada = { granada: number; esmeralda: number; diamante: number; joalheria: number }
type Metas = { percentuais: Record<string, number>; comissao: number; lojas: Record<string, Escada> }

function nomeMes(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const nomes = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
  return `${nomes[m - 1]}/${ano}`
}

// 5º dia útil do mês seguinte (conta sábado, porque a loja abre sábado) e o dia 20.
// Se o dia 20 cair em domingo ou feriado, paga no dia útil anterior — em 2026 o
// dia 20/11 é feriado (Consciência Negra) e o Pix não sai.
function datasDePagamento(mes: string) {
  const [ano, m] = mes.split('-').map(Number)
  const proxAno = m === 12 ? ano + 1 : ano
  const proxMes = m === 12 ? 1 : m + 1
  const feriados = new Set([`${proxAno}-11-02`, `${proxAno}-11-15`, `${proxAno}-11-20`, `${proxAno}-12-25`, `${proxAno}-01-01`])
  const ehUtil = (iso: string, domingoFora = true) => {
    const d = new Date(`${iso}T12:00:00Z`)
    const semana = d.getUTCDay()
    if (domingoFora && semana === 0) return false
    return !feriados.has(iso)
  }
  const uteis: string[] = []
  for (let dia = 1; dia <= 20 && uteis.length < 5; dia++) {
    const iso = `${proxAno}-${String(proxMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (ehUtil(iso)) uteis.push(iso)
  }
  let dia20 = `${proxAno}-${String(proxMes).padStart(2, '0')}-20`
  for (let dia = 20; dia >= 15; dia--) {
    const iso = `${proxAno}-${String(proxMes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    if (ehUtil(iso)) { dia20 = iso; break }
  }
  return { meta: uteis[4] ?? `${proxAno}-${String(proxMes).padStart(2, '0')}-07`, dia20 }
}

export default async function ComissaoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: mesPedido } = await searchParams
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const mes = /^\d{4}-\d{2}$/.test(mesPedido ?? '') ? mesPedido! : hoje.slice(0, 7)
  const [ano, mm] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const proxMes = mm === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mm + 1).padStart(2, '0')}-01`
  const mesSeguinte = proxMes.slice(0, 7)
  const datas = datasDePagamento(mes)

  const supabase = await createServiceClient()
  const [{ data: lojas }, { data: cfgMetas }, { data: cfgTime }, { data: cfgPdv }] = await Promise.all([
    supabase.from('lojas').select('id, nome').eq('ativa', true).order('nome'),
    supabase.from('configuracoes').select('valor').eq('chave', `metas_comissao:${mes}`).maybeSingle(),
    supabase.from('configuracoes').select('valor').eq('chave', 'time_comissao').maybeSingle(),
    // % única da comissão (tela Configurações). 0,5 digitado = meio por cento.
    supabase.from('configuracoes').select('valor').eq('chave', 'pdv').maybeSingle(),
  ])
  const metas = (cfgMetas?.valor ?? null) as Metas | null
  const time = (cfgTime?.valor ?? {}) as Record<string, string[]>
  const pctConfig = Number((cfgPdv?.valor as { comissao_percentual?: number } | null)?.comissao_percentual ?? 0)
  // Fração usada na conta: a de Configurações quando existir; senão a do JSON de metas.
  const comissaoFracao = pctConfig > 0 ? pctConfig / 100 : Number(metas?.comissao ?? 0)
  const lojasList = (lojas ?? []) as { id: string; nome: string }[]

  if (!metas) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Comissão do mês</h2>
        <FinanceiroTabs active="lancamentos" />
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não há metas cadastradas para {nomeMes(mes)}. Cadastre a escada do mês em <b>configurações</b> com a chave
          {' '}<code>metas_comissao:{mes}</code> para a tela calcular.
        </div>
      </div>
    )
  }

  const { data: deps } = await supabase.from('depositos').select('id, loja_id')
  const lojaDoDep = new Map((deps ?? []).map((d) => [d.id, d.loja_id as string | null]))
  const vendas = await fetchAll<{ id: string; total: number | null; deposito_id: string }>((from, to) =>
    supabase.from('vendas').select('id, total, deposito_id').gte('data', inicio).lt('data', proxMes).eq('status', 'concluida').range(from, to))
  const bruto: Record<string, number> = {}
  const lojaDaVenda = new Map<string, string | null>()
  for (const v of vendas) {
    const loja = lojaDoDep.get(v.deposito_id) ?? null
    lojaDaVenda.set(v.id, loja)
    if (!loja) continue
    bruto[loja] = (bruto[loja] ?? 0) + Number(v.total ?? 0)
  }
  const devolucoes = await fetchAll<{ venda_id: string; valor_total: number | null }>((from, to) =>
    supabase.from('devolucoes').select('venda_id, valor_total').range(from, to))
  const devolvido: Record<string, number> = {}
  for (const d of devolucoes) {
    const loja = lojaDaVenda.get(d.venda_id)
    if (!loja) continue
    devolvido[loja] = (devolvido[loja] ?? 0) + Number(d.valor_total ?? 0)
  }
  const [anoSeg, mesSeg] = mesSeguinte.split('-').map(Number)
  const fimDoSeguinte = mesSeg === 12 ? `${anoSeg + 1}-01-01` : `${anoSeg}-${String(mesSeg + 1).padStart(2, '0')}-01`
  const lancados = await fetchAll<{ pessoa_nome: string | null; loja_id: string | null; valor: number | null; data_vencimento: string | null; categoria: string | null }>((from, to) =>
    supabase.from('lancamentos').select('pessoa_nome, loja_id, valor, data_vencimento, categoria')
      .eq('tipo', 'pagar').eq('categoria', 'Comissão').gte('data_vencimento', `${mesSeguinte}-01`).lt('data_vencimento', fimDoSeguinte).range(from, to))

  const linhas = lojasList.map((loja) => {
    const escada = metas.lojas[loja.id]
    const faixas: [string, number][] = escada
      ? [['Granada', Number(escada.granada)], ['Esmeralda', Number(escada.esmeralda)], ['Diamante', Number(escada.diamante)], ['Joalheria', Number(escada.joalheria)]]
      : []
    const vendaBruta = bruto[loja.id] ?? 0
    const batida = faixas.filter(([, alvo]) => vendaBruta >= alvo).pop()
    const proxima = faixas.find(([, alvo]) => vendaBruta < alvo)
    const valorMeta = batida ? Math.round(batida[1] * (metas.percentuais[batida[0].toLowerCase()] ?? 0) * 100) / 100 : 0
    const valorComissao = Math.round((vendaBruta - (devolvido[loja.id] ?? 0)) * comissaoFracao * 100) / 100
    const vendedoras = (time[loja.id] ?? []).filter(Boolean)
    const metaCada = vendedoras.length ? Math.round((valorMeta / vendedoras.length) * 100) / 100 : 0
    const comissaoCada = vendedoras.length ? Math.round((valorComissao / vendedoras.length) * 100) / 100 : 0
    const jaLancado = lancados.filter((l) => l.loja_id === loja.id)
    return { loja, vendaBruta, devolvido: devolvido[loja.id] ?? 0, batida, proxima, valorMeta, valorComissao, vendedoras, metaCada, comissaoCada, jaLancado }
  })

  const fmt = (v: number) => formatBRL(v)
  const totalMeta = linhas.reduce((s, l) => s + l.valorMeta, 0)
  const totalComissao = linhas.reduce((s, l) => s + l.valorComissao, 0)
  const jaLancadoTotal = lancados.reduce((s, l) => s + Number(l.valor ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Comissão do mês</h2>
          <p className="text-sm text-gray-500">
            Meta conferida na venda bruta · comissão sobre a venda bruta menos devolução · cada loja divide com as suas vendedoras
          </p>
        </div>
        <form className="flex items-end gap-2">
          <label className="text-xs font-medium text-gray-600">
            Mês
            <input type="month" name="mes" defaultValue={mes} className="field mt-1" />
          </label>
          <button type="submit" className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Ver</button>
        </form>
      </div>

      <FinanceiroTabs active="lancamentos" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-gray-500">Venda bruta do mês</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{fmt(linhas.reduce((s, l) => s + l.vendaBruta, 0))}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-gray-500">Meta a pagar</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#1B6CA8]">{fmt(totalMeta)}</p>
          <p className="text-[11px] text-gray-500">vence {datas.meta.split('-').reverse().join('/')}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-gray-500">Comissão a pagar</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#F47920]">{fmt(totalComissao)}</p>
          <p className="text-[11px] text-gray-500">vence {datas.dia20.split('-').reverse().join('/')}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase text-gray-500">Já lançado</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{fmt(jaLancadoTotal)}</p>
          <p className="text-[11px] text-gray-500">{lancados.length} lançamentos em {nomeMes(mesSeguinte)}</p>
        </div>
      </div>

      {linhas.map((l) => (
        <div key={l.loja.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <p className="text-base font-bold text-gray-900">{l.loja.nome}</p>
              <p className="text-xs text-gray-500">
                {l.batida
                  ? <>Bateu <b>{l.batida[0]}</b> — {((metas.percentuais[l.batida[0].toLowerCase()] ?? 0) * 100).toFixed(1)}% de {fmt(l.batida[1])}</>
                  : <>Nenhuma faixa batida{l.proxima ? ` — faltaram ${fmt(l.proxima[1] - l.vendaBruta)} para ${l.proxima[0]}` : ''}</>}
                {l.batida && l.proxima ? ` · próxima ${l.proxima[0]} em ${fmt(l.proxima[1])} (faltam ${fmt(l.proxima[1] - l.vendaBruta)})` : ''}
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-[11px] uppercase text-gray-500">Venda bruta</p>
                <p className="font-bold tabular-nums text-gray-900">{fmt(l.vendaBruta)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-gray-500">Devoluções</p>
                <p className="font-bold tabular-nums text-red-600">{fmt(l.devolvido)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-gray-500">Meta</p>
                <p className="font-bold tabular-nums text-[#1B6CA8]">{fmt(l.valorMeta)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-gray-500">Comissão</p>
                <p className="font-bold tabular-nums text-[#F47920]">{fmt(l.valorComissao)}</p>
              </div>
            </div>
          </div>
          <div className="px-5 py-4">
            {l.vendedoras.length === 0 ? (
              <p className="text-sm text-amber-700">
                Nenhuma vendedora cadastrada para esta loja. Cadastre em <code>configuracoes</code>, chave <code>time_comissao</code>.
              </p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500">
                    <th className="py-2 pr-3">Vendedora</th>
                    <th className="py-2 pr-3 text-right">Meta</th>
                    <th className="py-2 pr-3 text-right">Comissão</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {l.vendedoras.map((nome) => (
                    <tr key={nome}>
                      <td className="py-2 pr-3 text-gray-800">{nome}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(l.metaCada)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(l.comissaoCada)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-gray-900">{fmt(l.metaCada + l.comissaoCada)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-gray-400">
                Meta vence {datas.meta.split('-').reverse().join('/')} · comissão vence {datas.dia20.split('-').reverse().join('/')}.
                A comissão é provisória até o dia 20 — devolução de venda do mês reduz o valor.
              </p>
              <BotaoLancarComissao lojaId={l.loja.id} mes={mes} vendedoras={l.vendedoras} metaCada={l.metaCada} comissaoCada={l.comissaoCada} jaLancado={l.jaLancado.length > 0} rotuloMeta={l.batida?.[0] ?? null} />
            </div>
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-400">
        Fórmula: meta = percentual da faixa batida × valor da faixa. Comissão = {String(Math.round(comissaoFracao * 10000) / 100).replace('.', ',')}% × (venda bruta − devoluções das vendas do mês).
        Divisão igual entre as vendedoras da loja. As escadas do mês estão em <code>metas_comissao:{mes}</code>.
      </p>
    </div>
  )
}
