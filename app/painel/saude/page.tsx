import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { auditarFinanceiro, resumo, type Achado } from '@/lib/saude-financeiro'
import { REGRAS_DINHEIRO } from '@/lib/financeiro-regras'
import { formatBRL, hojeSP } from '@/lib/utils'
import { IconShield } from '@/components/icons'
import { Dica } from '@/components/Dica'

// Tela de conferência: aperta e vê o que está quebrado. Nada aqui grava.
export const dynamic = 'force-dynamic'

function corDe(a: Achado) {
  if (a.gravidade === 'erro') return { borda: 'border-red-200', fundo: 'bg-red-50', texto: 'text-red-700', ponto: 'bg-red-500' }
  if (a.gravidade === 'atencao') return { borda: 'border-amber-200', fundo: 'bg-amber-50', texto: 'text-amber-700', ponto: 'bg-amber-500' }
  return { borda: 'border-green-200', fundo: 'bg-green-50', texto: 'text-green-700', ponto: 'bg-green-500' }
}

function Cartao({ achado }: { achado: Achado }) {
  const c = corDe(achado)
  return (
    <div className={'rounded-xl border p-4 shadow-sm ' + c.borda + ' ' + c.fundo}>
      <div className="flex items-start gap-3">
        <span className={'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ' + c.ponto} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={'text-sm font-semibold ' + c.texto}>{achado.titulo}</p>
            <p className="text-sm font-bold text-gray-900">
              {achado.qtd === 0 ? 'tudo certo' : achado.qtd + (achado.qtd === 1 ? ' caso' : ' casos')}
              {achado.qtd > 0 && achado.valor > 0 && <span className="ml-2 font-medium text-gray-600">{formatBRL(achado.valor)}</span>}
            </p>
          </div>
          <p className="mt-1 text-xs text-gray-600"><strong className="font-semibold">Regra:</strong> {achado.regra}</p>
          {achado.qtd > 0 && (
            <p className="mt-1 text-xs text-gray-600"><strong className="font-semibold">O que fazer:</strong> {achado.oQueFazer}</p>
          )}
          {achado.exemplos.length > 0 && (
            <p className="mt-1 truncate text-xs text-gray-500">ex.: {achado.exemplos.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default async function SaudePage() {
  const supabase = await createServiceClient()
  const achados = await auditarFinanceiro(supabase)
  const r = resumo(achados)
  const graves = achados.filter((a) => a.gravidade === 'erro')
  const atencao = achados.filter((a) => a.gravidade === 'atencao')
  const certos = achados.filter((a) => a.gravidade === 'ok')

  // O que quebrou na mão de quem estava trabalhando hoje (tabela erros_app).
  // Fica nesta tela, e não num menu novo, porque é conferência — igual ao resto
  // da página: só lê, não corrige nada.
  // Página por página: o PostgREST corta em 1000 linhas e devolve as mais ANTIGAS.
  // Num dia ruim (>1000 erros) a tela mostraria um retrato do começo do dia e a
  // contagem por problema mentiria.
  type LinhaTela = {
    agrupamento: string
    tela: string | null
    titulo: string
    mensagem: string | null
    gravidade: string
    usuario_id: string | null
  }
  const errosHoje = (await fetchAll((from, to) =>
    supabase
      .from('erros_app')
      .select('agrupamento, tela, titulo, mensagem, gravidade, usuario_id')
      .gte('created_at', new Date(hojeSP() + 'T00:00:00-03:00').toISOString())
      // Ordenação por coluna ÚNICA: o PostgREST pagina por offset e ordem que
      // empata faz a mesma linha voltar em duas páginas (contagem dobrada).
      .order('id')
      .range(from, to),
  )) as LinhaTela[]

  // Nome completo de quem estava usando (nunca login nem apelido): vem do perfil.
  const idsEnvolvidos = [...new Set(errosHoje.map((e) => e.usuario_id).filter(Boolean))] as string[]
  const nomesPorId: Record<string, string> = {}
  if (idsEnvolvidos.length > 0) {
    const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', idsEnvolvidos)
    for (const p of (perfis ?? []) as { id: string; nome: string }[]) nomesPorId[p.id] = p.nome
  }

  // Agrupa pela coluna `agrupamento` gravada pela rota — remontar a chave aqui
  // poderia divergir do que o Telegram avisou (título já passou por limpeza).
  const porProblema = new Map<string, { tela: string; titulo: string; detalhe: string | null; n: number; quem: string[]; gravidade: string }>()
  for (const e of errosHoje) {
    const atual = porProblema.get(e.agrupamento) ?? {
      tela: e.tela ?? 'sem tela',
      titulo: e.titulo,
      detalhe: e.mensagem,
      n: 0,
      quem: [],
      gravidade: e.gravidade,
    }
    atual.n++
    const quem = e.usuario_id ? nomesPorId[e.usuario_id] : null
    if (quem && !atual.quem.includes(quem) && atual.quem.length < 3) atual.quem.push(quem)
    porProblema.set(e.agrupamento, atual)
  }
  const problemas = [...porProblema.values()].sort((a, b) => b.n - a.n).slice(0, 10)

  // Prova de vida do vigia + para onde o aviso está indo. Ele grava isso a cada
  // passada; se a hora parar de andar, o vigia morreu. O destino vem da descoberta
  // automática do grupo (o dono não digita id nenhum).
  const { data: vigiaCfg } = await supabase.from('configuracoes').select('valor').eq('chave', 'erros_vigia').maybeSingle()
  const vigiaInfo = (vigiaCfg?.valor as {
    ultima_em?: string
    chat_titulo?: string | null
    chat_ok?: boolean
    chat_erro?: string | null
  } | null) ?? null
  const minutosDesdePassada = vigiaInfo?.ultima_em
    ? Math.round((Date.now() - new Date(vigiaInfo.ultima_em).getTime()) / 60000)
    : null
  const destinoOk = Boolean(vigiaInfo?.chat_ok)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <IconShield className="h-6 w-6 shrink-0 text-[#1B6CA8]" />
        <h2 className="text-2xl font-bold text-gray-900">Saúde do sistema</h2>
        <Dica texto="Confere sozinho se o dinheiro está batendo. Só lê: não corrige, não apaga e não altera nada." />
      </div>

      <p className="text-sm text-gray-600">
        Conferência de {hojeSP()} — dinheiro, caixa e estoque. Lançamento em aberto é conferido inteiro; venda, caixa e devolução, dos últimos 31 dias. Esta tela só lê o sistema: nenhum valor é corrigido, apagado ou alterado aqui.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-red-700">Erros</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{r.erros}</p>
          <p className="mt-1 text-xs text-red-600">contradição que faz a tela mostrar número errado</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-amber-700">Pontos de atenção</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{r.atencoes}</p>
          <p className="mt-1 text-xs text-amber-600">dado torto ou dinheiro não registrado</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 shadow-sm">
          <p className="text-sm font-medium text-green-700">Conferidos</p>
          <p className="mt-1 text-2xl font-bold text-green-800">{r.ok} de {r.total}</p>
          <p className="mt-1 text-xs text-green-600">regra que está batendo</p>
        </div>
      </div>

      {graves.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Erros</h3>
          {graves.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      {atencao.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Pontos de atenção</h3>
          {atencao.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      {certos.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Conferidos</h3>
          {certos.map((a) => <Cartao key={a.chave} achado={a} />)}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Telas com problema hoje</h3>
          <Dica texto="O que a equipe viu dar errado enquanto trabalhava, somado por problema. Também chega no seu Telegram, no grupo privado." />
        </div>

        {problemas.length === 0 ? (
          <p className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Nenhuma tela deu problema hoje. Tudo o que a equipe clicou funcionou.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {problemas.map((p) => (
              <li key={p.tela + p.titulo} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    <span className={p.gravidade === 'atencao' ? 'text-amber-600' : 'text-red-600'}>
                      {p.tela}
                    </span>{' '}
                    — {p.titulo}
                  </p>
                  {p.detalhe && (
                    <p className="mt-0.5 break-words text-xs text-gray-600">{p.detalhe}</p>
                  )}
                  {p.quem.length > 0 && (
                    <p className="mt-0.5 text-xs text-gray-500">quem estava usando: {p.quem.join(' · ')}</p>
                  )}
                </div>
                <p className="text-sm font-bold text-gray-900">{p.n}×</p>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-gray-500">
          {destinoOk
            ? 'Avisos indo para o grupo' + (vigiaInfo?.chat_titulo ? ' "' + vigiaInfo.chat_titulo + '"' : ' privado') +
              ' — e só quando houver problema. Nada de mensagem dizendo que está tudo bem.'
            : 'Aviso no Telegram ainda NÃO está ligado' + (vigiaInfo?.chat_erro ? ': ' + vigiaInfo.chat_erro : '') +
              '. Crie o grupo "TecnoCell — Erros" com o bot dentro: o vigia acha o grupo sozinho na próxima passada.'}
          {' '}
          {minutosDesdePassada === null
            ? 'O vigia ainda não passou nenhuma vez hoje.'
            : minutosDesdePassada <= 20
              ? 'Último check do vigia: há ' + Math.max(minutosDesdePassada, 1) + ' min (ele passa a cada 10).'
              : 'ATENÇÃO: o último check do vigia foi há ' + minutosDesdePassada + ' min — ele deveria passar a cada 10. A conferência automática pode estar parada.'}
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800">As regras que esta tela confere</h3>
        <ul className="mt-2 space-y-1.5 text-xs text-gray-600">
          {REGRAS_DINHEIRO.map((regra) => (
            <li key={regra.titulo}>
              <strong className="font-semibold text-gray-800">{regra.titulo}.</strong> {regra.texto}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
