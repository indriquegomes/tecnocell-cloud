import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ResponderPerguntaForm } from './ResponderPerguntaForm'

type PerguntaLinha = { id: string; texto: string; criado_em: string }

export default async function PerguntasMLPage({
  params,
}: {
  params: Promise<{ conexaoId: string }>
}) {
  const { conexaoId } = await params
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('id, texto, criado_em')
    .eq('conexao_id', conexaoId)
    .eq('respondida', false)
    .order('criado_em', { ascending: true })
  const perguntas = (data ?? []) as PerguntaLinha[]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {perguntas.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma pergunta pendente.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {perguntas.map((p) => (
            <li key={p.id} className="py-4">
              <p className="text-sm text-gray-800">{p.texto}</p>
              <p className="text-xs text-gray-400">{formatDate(p.criado_em)}</p>
              <ResponderPerguntaForm perguntaId={p.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
