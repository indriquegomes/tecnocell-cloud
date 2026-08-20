import { createServiceClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { IconFile } from '@/components/icons'
import { Dica } from '@/components/Dica'
import { ResponderPerguntaForm } from '@/app/painel/integracoes/lojas/mercado-livre/[conexaoId]/perguntas/ResponderPerguntaForm'

type PerguntaLinha = { id: string; texto: string; criado_em: string; conexao: { ml_nickname: string | null; ml_user_id: string } | null }

export default async function PerguntasMLAgregadoPage() {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from('integracoes_mercado_livre_perguntas')
    .select('id, texto, criado_em, conexao:integracoes_mercado_livre(ml_nickname, ml_user_id)')
    .eq('respondida', false)
    .order('criado_em', { ascending: true })
  const perguntas = (data ?? []) as unknown as PerguntaLinha[]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconFile className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Perguntas Mercado Livre</h2>
        <Dica texto="Perguntas pendentes de todas as contas Mercado Livre conectadas, juntas." />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {perguntas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma pergunta pendente.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {perguntas.map((p) => (
              <li key={p.id} className="py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {p.conexao?.ml_nickname ?? p.conexao?.ml_user_id ?? 'Conta desconhecida'}
                </p>
                <p className="text-sm text-gray-800">{p.texto}</p>
                <p className="text-xs text-gray-400">{formatDate(p.criado_em)}</p>
                <ResponderPerguntaForm perguntaId={p.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
