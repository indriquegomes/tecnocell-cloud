import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { Dica } from '@/components/Dica'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Evento = {
  id: string
  maquina: string | null
  usuario_sige: string | null
  tipo: string
  rota: string | null
  metodo: string | null
  alvo: string | null
  status: number | null
  ocorreu_em: string
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

const curta = (rota: string | null) =>
  (rota ?? '').replace('https://apiapp.sigecloud.com.br', '').replace('https://app.sigecloud.com.br', '').split('?')[0]

export default async function EspelhoPage() {
  const supabase = await createServiceClient()
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

  const [eventos, vendas] = await Promise.all([
    fetchAll<Evento>((from, to) =>
      supabase.from('eventos_sige')
        .select('id, maquina, usuario_sige, tipo, rota, metodo, alvo, status, ocorreu_em')
        .gte('ocorreu_em', hoje.toISOString())
        .order('ocorreu_em', { ascending: false })
        .range(from, to)),
    supabase.from('vendas')
      .select('id, numero, total, created_at, observacoes, vendedor_nome')
      .ilike('observacoes', '%__ESPELHO__%')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const espelhadas = vendas.data ?? []
  const porTipo = eventos.reduce<Record<string, number>>((a, e) => { a[e.tipo] = (a[e.tipo] ?? 0) + 1; return a }, {})
  const maquinas = [...new Set(eventos.map((e) => e.maquina).filter(Boolean))] as string[]
  const ultimo = eventos[0]?.ocorreu_em

  // Minutos desde o último evento diz mais que o total: captura parada é o problema
  // que interessa, e um número grande aqui aparece antes de alguém sentir falta do dado.
  const paradaMin = ultimo ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 60000) : null

  const apis = eventos.filter((e) => e.tipo === 'api')
  const rotasTop = Object.entries(
    apis.reduce<Record<string, number>>((a, e) => { const r = curta(e.rota); a[r] = (a[r] ?? 0) + 1; return a }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const totalEspelhado = espelhadas.reduce((s, v) => s + Number(v.total ?? 0), 0)

  const Card = ({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) => (
    <div className={`rounded-xl border p-4 ${alerta ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Espelho do SIGE</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            O que está sendo capturado das telas do SIGE e o que o robô já replicou aqui.
          </p>
        </div>
        <Dica texto="Esta tela lê direto do banco. Atualize (F5) para ver o estado mais recente." />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card titulo="Eventos hoje" valor={String(eventos.length)}
              sub={Object.entries(porTipo).map(([t, n]) => `${n} ${t}`).join(' · ') || 'nada ainda'} />
        <Card titulo="Chamadas de API" valor={String(apis.length)}
              sub={apis.length ? 'captura funcionando' : 'nenhuma — extensão desatualizada?'}
              alerta={eventos.length > 0 && apis.length === 0} />
        <Card titulo="Última captura" valor={ultimo ? hora(ultimo) : '—'}
              sub={paradaMin == null ? 'sem eventos' : paradaMin > 30 ? `parada há ${paradaMin} min` : `há ${paradaMin} min`}
              alerta={paradaMin != null && paradaMin > 30} />
        <Card titulo="Vendas espelhadas" valor={String(espelhadas.length)}
              sub={`R$ ${totalEspelhado.toFixed(2).replace('.', ',')}`} />
      </div>

      {maquinas.length > 0 && (
        <div className="text-xs text-slate-500">
          Máquinas enviando: <span className="font-medium text-slate-700">{maquinas.join(', ')}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            Rotas do SIGE mais chamadas
          </h3>
          {rotasTop.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              Nenhuma chamada de API capturada hoje. Se já há cliques na lista ao lado, a extensão
              está rodando mas ainda com versão antiga — recarregue em chrome://extensions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {rotasTop.map(([rota, n]) => (
                    <tr key={rota} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{rota}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{n}x</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            Últimos eventos
          </h3>
          {eventos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Nada capturado hoje.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {eventos.slice(0, 60).map((e) => (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-4 py-1.5 text-xs tabular-nums text-slate-400">{hora(e.ocorreu_em)}</td>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          e.tipo === 'api' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'
                        }`}>{e.metodo ?? e.tipo}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-slate-600">
                        {e.tipo === 'api' ? <span className="font-mono">{curta(e.rota)}</span> : (e.alvo || curta(e.rota))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Vendas replicadas pelo robô
        </h3>
        {espelhadas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            Nenhuma ainda. O robô só replica vendas de Petrópolis feitas depois da última
            sincronização de estoque — as anteriores já estão descontadas no saldo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Hora</th>
                  <th className="px-4 py-2 font-medium">Nº</th>
                  <th className="px-4 py-2 font-medium">Origem no SIGE</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {espelhadas.map((v) => (
                  <tr key={v.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-slate-500">{hora(v.created_at)}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-700">#{v.numero}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {(v.observacoes ?? '').match(/SIGE #(\d+)/)?.[0] ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">
                      R$ {Number(v.total ?? 0).toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
