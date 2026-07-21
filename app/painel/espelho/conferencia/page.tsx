import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import AutoAtualiza from '@/components/AutoAtualiza'
import { Dica } from '@/components/Dica'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type SigeVenda = {
  sige_cod: number
  cliente: string | null
  forma: string | null
  empresa: string | null
  faturado: boolean
  total: number
  atualizado_em: string
}
type NossaVenda = { numero: number | null; total: number; observacoes: string | null }

const br = (n: number) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',')
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

export default async function ConferenciaPage() {
  const supabase = await createServiceClient()

  const [sige, nossas] = await Promise.all([
    fetchAll<SigeVenda>((from, to) =>
      supabase.from('sige_conferencia')
        .select('sige_cod, cliente, forma, empresa, faturado, total, atualizado_em')
        .order('sige_cod', { ascending: false })
        .range(from, to)),
    fetchAll<NossaVenda>((from, to) =>
      supabase.from('vendas')
        .select('numero, total, observacoes')
        .ilike('observacoes', '%__ESPELHO__%')
        .range(from, to)),
  ])

  // indexa o que espelhamos pelo código do SIGE (vem na observação)
  const nossoPorCod = new Map<number, NossaVenda>()
  for (const v of nossas) {
    const m = String(v.observacoes ?? '').match(/SIGE #(\d+)/)
    if (m) nossoPorCod.set(Number(m[1]), v)
  }

  // só Petrópolis faturada é o que o robô deve espelhar — é o universo justo de comparação
  const alvo = sige.filter((s) => s.faturado && /PETR/i.test(s.empresa ?? ''))
  const teresopolis = sige.filter((s) => /TERES/i.test(s.empresa ?? '')).length

  type Linha = SigeVenda & { nosso: NossaVenda | undefined; estado: 'ok' | 'difere' | 'falta' }
  const linhas: Linha[] = alvo.map((s) => {
    const nosso = nossoPorCod.get(s.sige_cod)
    const estado: 'ok' | 'difere' | 'falta' = !nosso ? 'falta' : Math.abs(Number(nosso.total) - Number(s.total)) < 0.01 ? 'ok' : 'difere'
    return { ...s, nosso, estado }
  }).sort((a, b) => b.sige_cod - a.sige_cod)

  const nOk = linhas.filter((l) => l.estado === 'ok').length
  const nDif = linhas.filter((l) => l.estado === 'difere').length
  const nFalta = linhas.filter((l) => l.estado === 'falta').length
  const totSige = alvo.reduce((s, x) => s + Number(x.total), 0)
  const totNosso = linhas.filter((l) => l.nosso).reduce((s, l) => s + Number(l.nosso!.total), 0)
  const ultimoPush = sige[0]?.atualizado_em

  const Card = ({ t, v, sub, cor }: { t: string; v: string; sub?: string; cor?: string }) => (
    <div className={`rounded-xl border p-4 ${cor ?? 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{t}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )

  const tudoCerto = nDif === 0 && nFalta === 0 && linhas.length > 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Conferência — SIGE × TecnoCell</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Venda a venda de Petrópolis. Confere se o que o robô lançou aqui bate com o SIGE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutoAtualiza segundos={30} />
          <Dica texto="O robô atualiza o lado do SIGE a cada ciclo (10 min). Esta tela relê sozinha a cada 30s." />
        </div>
      </div>

      {ultimoPush && (
        <div className="text-xs text-slate-500">
          Lado do SIGE atualizado às <span className="font-medium text-slate-700">{hora(ultimoPush)}</span>
          {teresopolis > 0 && <> · {teresopolis} vendas de Teresópolis ignoradas (seguem no SIGE)</>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card t="Vendas no SIGE" v={String(alvo.length)} sub={br(totSige)} />
        <Card t="Batendo exato" v={String(nOk)} sub="valor idêntico"
          cor={nOk > 0 ? 'border-emerald-200 bg-emerald-50' : undefined} />
        <Card t="Divergentes" v={String(nDif)} sub={nDif ? 'precisam de atenção' : 'nenhuma'}
          cor={nDif > 0 ? 'border-red-300 bg-red-50' : undefined} />
        <Card t="Ainda não lançadas" v={String(nFalta)} sub={nFalta ? 'pulou ou próximo ciclo' : 'tudo em dia'}
          cor={nFalta > 0 ? 'border-amber-300 bg-amber-50' : undefined} />
      </div>

      {tudoCerto && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✅ Tudo batendo — as {nOk} vendas de Petrópolis estão lançadas aqui com o mesmo valor do SIGE.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2 font-medium">SIGE #</th>
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-4 py-2 font-medium">Pagamento</th>
              <th className="px-4 py-2 text-right font-medium">SIGE</th>
              <th className="px-4 py-2 text-right font-medium">TecnoCell</th>
              <th className="px-4 py-2 text-center font-medium">Confere?</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                Nenhuma venda de Petrópolis acima do corte ainda hoje.
              </td></tr>
            ) : linhas.map((l) => (
              <tr key={l.sige_cod} className={`border-b border-slate-50 last:border-0 ${
                l.estado === 'difere' ? 'bg-red-50' : l.estado === 'falta' ? 'bg-amber-50/50' : ''
              }`}>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">#{l.sige_cod}</td>
                <td className="px-4 py-2 text-slate-700">{(l.cliente ?? '—').slice(0, 30)}</td>
                <td className="px-4 py-2 text-xs text-slate-500">{l.forma ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-900">{br(l.total)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                  {l.nosso ? br(l.nosso.total) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {l.estado === 'ok' && <span className="text-emerald-600">✅</span>}
                  {l.estado === 'difere' && <span className="font-bold text-red-600">🔴 difere</span>}
                  {l.estado === 'falta' && <span className="text-amber-600">⏳</span>}
                </td>
              </tr>
            ))}
          </tbody>
          {linhas.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="px-4 py-2" colSpan={3}>Total</td>
                <td className="px-4 py-2 text-right tabular-nums">{br(totSige)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{br(totNosso)}</td>
                <td className="px-4 py-2 text-center">
                  {Math.abs(totSige - totNosso) < 0.01 ? <span className="text-emerald-600">✅</span> : <span className="text-amber-600">parcial</span>}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
