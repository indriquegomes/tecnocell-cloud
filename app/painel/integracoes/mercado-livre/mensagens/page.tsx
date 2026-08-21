import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ResponderMensagemForm } from '@/app/painel/integracoes/lojas/mercado-livre/[conexaoId]/mensagens/ResponderMensagemForm'

type MensagemLinha = {
  id: string; ml_pack_id: string; conexao_id: string | null; autor: string; texto: string; criado_em: string
  conexao: { nome_loja: string | null; ml_nickname: string | null; ml_user_id: string } | null
}

export default async function MensagensMLAgregadoPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_mensagens')
    .select('id, ml_pack_id, conexao_id, autor, texto, criado_em, conexao:integracoes_mercado_livre(nome_loja, ml_nickname, ml_user_id)')
    .order('criado_em', { ascending: false })
    .limit(300)
  const mensagens = (((data ?? []) as unknown as MensagemLinha[])).reverse()

  const porPack = new Map<string, MensagemLinha[]>()
  for (const m of mensagens) {
    const lista = porPack.get(m.ml_pack_id) ?? []
    lista.push(m)
    porPack.set(m.ml_pack_id, lista)
  }

  if (porPack.size > 0) {
    await supabase.from('integracoes_mercado_livre_mensagens')
      .update({ lida: true })
      .in('ml_pack_id', [...porPack.keys()])
      .eq('autor', 'comprador')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Mensagens Mercado Livre</h2>
        <Dica texto="Conversas de todas as contas Mercado Livre conectadas, juntas." />
      </div>
      <div className="space-y-4">
        {porPack.size === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-gray-400">Nenhuma conversa ainda.</p>
          </div>
        ) : [...porPack.entries()].map(([packId, msgs]) => (
          <div key={packId} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {msgs[0].conexao?.nome_loja ?? msgs[0].conexao?.ml_nickname ?? msgs[0].conexao?.ml_user_id ?? 'Conta desconhecida'} · Pedido / pack {packId}
            </p>
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
            {msgs[0].conexao_id ? (
              <ResponderMensagemForm conexaoId={msgs[0].conexao_id} packId={packId} />
            ) : (
              <p className="mt-2 text-xs text-gray-400">Conta desconhecida — não é possível responder por aqui.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
