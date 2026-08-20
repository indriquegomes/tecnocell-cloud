import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderMensagemForm } from './ResponderMensagemForm'
import { marcarConversaLida } from './actions'

type MensagemLinha = { id: string; ml_pack_id: string; autor: string; texto: string; lida: boolean; criado_em: string }

export default async function MensagensMLPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_mensagens')
    .select('id, ml_pack_id, autor, texto, lida, criado_em')
    .order('criado_em', { ascending: false })
    .limit(300)
  // Busca as 300 mais recentes (senão o corte de 1000 linhas do Supabase
  // prende a tela nas conversas mais ANTIGAS); reverte pra exibir cada
  // conversa da mais antiga pra mais nova, como leitura normal de chat.
  const mensagens = ((data ?? []) as MensagemLinha[]).reverse()

  const porPack = new Map<string, MensagemLinha[]>()
  for (const m of mensagens) {
    const lista = porPack.get(m.ml_pack_id) ?? []
    lista.push(m)
    porPack.set(m.ml_pack_id, lista)
  }

  // Abrir a aba já marca como lida toda conversa mostrada — não há
  // expandir/recolher por conversa nesta versão, então "abrir" a tela é
  // "abrir" a conversa.
  for (const packId of porPack.keys()) {
    await marcarConversaLida(packId)
  }

  return (
    <div className="space-y-4">
      {porPack.size === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-gray-400">Nenhuma conversa ainda.</p>
        </div>
      ) : [...porPack.entries()].map(([packId, msgs]) => (
        <div key={packId} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Pedido / pack {packId}</p>
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className={m.autor === 'vendedor' ? 'text-right' : 'text-left'}>
                <span className={`inline-block max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.autor === 'vendedor' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {m.texto}
                </span>
                <p className="text-[10px] text-gray-400">{formatDate(m.criado_em)}</p>
              </li>
            ))}
          </ul>
          <ResponderMensagemForm packId={packId} />
        </div>
      ))}
    </div>
  )
}
