import { createServiceClient, permissoesUsuarioAtual } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Painel da sincronização sombra SIGE → TecnoCell. Leitura via service role
// (as tabelas sinc_* têm RLS fechado). Só master enxerga.

function Card({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm text-gray-500">{rotulo}</div>
      <div className={'mt-1 text-2xl font-bold ' + cor}>{valor.toLocaleString('pt-BR')}</div>
    </div>
  )
}

export default async function SincronizacaoPage() {
  const { isMaster } = await permissoesUsuarioAtual()
  if (!isMaster) {
    return <div className="p-6 text-sm text-gray-500">Acesso restrito ao master.</div>
  }

  const supabase = await createServiceClient()

  const { data: inbox } = await supabase.from('sinc_inbox').select('estado')
  const estados: Record<string, number> = { pendente: 0, processando: 0, aplicado: 0, quarentena: 0, invalido: 0, descartado: 0 }
  for (const e of inbox ?? []) if (e.estado && e.estado in estados) estados[e.estado]++

  const { count: vendasSync } = await supabase.from('sinc_mapeamento').select('*', { count: 'exact', head: true }).eq('entidade', 'venda')

  const { data: quarentena } = await supabase
    .from('sinc_inbox')
    .select('entidade, acao, erro, recebido_em, payload')
    .eq('estado', 'quarentena')
    .order('recebido_em', { ascending: false })
    .limit(15)

  const { data: auditoria } = await supabase
    .from('sinc_auditoria')
    .select('entidade, acao, resultado, detalhe, ocorrido_em')
    .order('ocorrido_em', { ascending: false })
    .limit(15)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Sincronização SIGE → TecnoCell</h1>
        <p className="text-sm text-gray-500">Modo sombra unilateral — recebe do SIGE, nunca devolve.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card rotulo="Pendente (fila)" valor={estados.pendente} cor="text-blue-700" />
        <Card rotulo="Processando" valor={estados.processando} cor="text-amber-600" />
        <Card rotulo="Aplicado" valor={estados.aplicado} cor="text-emerald-600" />
        <Card rotulo="Quarentena" valor={estados.quarentena} cor="text-orange-600" />
        <Card rotulo="Descartado" valor={estados.descartado} cor="text-gray-500" />
        <Card rotulo="Vendas sincronizadas" valor={vendasSync ?? 0} cor="text-emerald-700" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-800 mb-2">Quarentena (precisa atenção)</h2>
          {!quarentena || quarentena.length === 0 ? (
            <p className="text-sm text-gray-400">Nada em quarentena.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {quarentena.map((q, i) => (
                <li key={i} className="border-b border-gray-100 pb-2">
                  <span className="font-medium text-gray-700">{q.entidade}/{q.acao}</span>{' '}
                  <span className="text-orange-600">{q.erro}</span>
                  <span className="block text-xs text-gray-400">{new Date(q.recebido_em).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-800 mb-2">Últimos aplicados</h2>
          {!auditoria || auditoria.length === 0 ? (
            <p className="text-sm text-gray-400">Nada aplicado ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {auditoria.map((a, i) => (
                <li key={i} className="border-b border-gray-100 pb-2">
                  <span className="font-medium text-gray-700">{a.entidade}/{a.acao}</span>{' '}
                  <span className={a.resultado === 'ok' ? 'text-emerald-600' : 'text-orange-600'}>{a.resultado}</span>{' '}
                  <span className="text-gray-500">{a.detalhe}</span>
                  <span className="block text-xs text-gray-400">{new Date(a.ocorrido_em).toLocaleString('pt-BR')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
