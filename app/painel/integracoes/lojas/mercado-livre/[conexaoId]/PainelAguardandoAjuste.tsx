import { buscarAnunciosAguardandoAjuste } from '@/lib/mercado-livre-dashboard'

const LABEL_SUBSTATUS: Record<string, string> = {
  waiting_for_patch: 'Aguardando correção',
  warning: 'Alerta',
}

export default async function PainelAguardandoAjuste({ conexaoId }: { conexaoId: string }) {
  const aguardandoAjuste = await buscarAnunciosAguardandoAjuste(conexaoId)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="mb-3 font-semibold text-gray-800">Anúncios Aguardando Ajuste Solicitado pelo Mercado Livre</p>
      {aguardandoAjuste.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum anúncio com pendência.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {aguardandoAjuste.map((a) => (
            <li key={a.mlItemId} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-700">{a.titulo}</span>
              <span className="text-xs font-medium text-amber-600">{LABEL_SUBSTATUS[a.subStatus] ?? a.subStatus}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
