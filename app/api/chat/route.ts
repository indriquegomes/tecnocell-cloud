import { NextRequest } from 'next/server'
import { createClient, createServiceClient, permissoesEfetivas } from '@/lib/supabase/server'
import { temPermissao } from '@/lib/permissoes'
import { streamChat, buildSystemPrompt, type ChatMessage } from '@/lib/chat-ia'

// Rate-limit simples em memória por IP. Evita abuso de custo Anthropic na rota
// pública. Reinicia a cada cold start — suficiente pra barrar flood.
const hits = new Map<string, number[]>()
function limitado(ip: string, max = 20, janelaMs = 60_000): boolean {
  const agora = Date.now()
  const recentes = (hits.get(ip) ?? []).filter((t) => agora - t < janelaMs)
  recentes.push(agora)
  hits.set(ip, recentes)
  return recentes.length > max
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'desconhecido'
  if (limitado(ip)) {
    return new Response('Muitas requisições. Aguarde um momento.', { status: 429 })
  }

  const { mensagens, tipo: tipoRequisitado = 'cliente' } = await req.json() as {
    mensagens: ChatMessage[]
    tipo: 'funcionario' | 'cliente'
  }

  const supabase = await createClient()

  // Valida no servidor: contexto de FUNCIONÁRIO (vê financeiro/estoque) só pra quem
  // está autenticado E tem a permissão 'chat_ia'. Antes bastava estar logado — qualquer
  // vendedor puxava o total a receber pela IA. Sem a permissão, cai no contexto 'cliente'
  // (só catálogo público). O `tipo` mandado pelo cliente não é confiável.
  const { data: { user } } = await supabase.auth.getUser()
  let podeFuncionario = false
  if (user) {
    const { permissoes, isMaster } = await permissoesEfetivas(user.id)
    podeFuncionario = temPermissao(permissoes, 'chat_ia', isMaster)
  }
  const tipo: 'funcionario' | 'cliente' = (tipoRequisitado === 'funcionario' && podeFuncionario) ? 'funcionario' : 'cliente'

  // Nome de quem está falando (pra assistente responder pelo nome, com carinho).
  let nomeUsuario: string | undefined
  if (user) {
    const service = await createServiceClient()
    const { data: perfil } = await service.from('perfis').select('nome').eq('id', user.id).maybeSingle()
    nomeUsuario = perfil?.nome ?? undefined
  }

  // Monta contexto a partir do Supabase
  let contexto: Record<string, unknown> = {}

  if (tipo === 'funcionario') {
    // count exact + head:true: só o total, sem trazer as linhas — evita o cap de
    // 1000 do Supabase (que fazia "itensEmEstoque" mentir depois da tabela crescer
    // pra 32 mil+ linhas na importação do SIGE, ver CLAUDE.md sobre paginação).
    const [{ data: produtos }, { count: itensEmEstoque }, { data: lancamentos }] = await Promise.all([
      supabase.from('produtos').select('id, nome, preco, categoria, marca, ativo').limit(50),
      supabase.from('estoque').select('id', { count: 'exact', head: true }).gt('quantidade', 0),
      supabase.from('lancamentos').select('valor, tipo, status, data_vencimento').limit(100),
    ])

    const aReceber = lancamentos
      ?.filter((l) => l.tipo === 'receber' && l.status !== 'pago')
      .reduce((s, l) => s + (l.valor ?? 0), 0) ?? 0

    const aPagar = lancamentos
      ?.filter((l) => l.tipo === 'pagar' && l.status !== 'pago')
      .reduce((s, l) => s + (l.valor ?? 0), 0) ?? 0

    contexto = {
      totalProdutos: produtos?.length ?? 0,
      produtosAtivos: produtos?.filter((p) => p.ativo).length ?? 0,
      itensEmEstoque: itensEmEstoque ?? 0,
      financeiro: { aReceber, aPagar },
      produtosAmostra: produtos?.slice(0, 10),
    }
  } else {
    const { data: produtos } = await supabase
      .from('produtos')
      .select(`
        id, nome, descricao, preco, marca, categoria,
        estoque ( quantidade, deposito_id, deposito:depositos(nome) )
      `)
      .eq('ativo', true)
      .eq('visivel_catalogo', true)
      .limit(30)

    contexto = {
      produtos: produtos?.map((p) => ({
        nome: p.nome,
        preco: p.preco,
        marca: p.marca,
        disponivel: (p.estoque as { quantidade: number }[])?.some((e) => e.quantidade > 0),
      })),
    }
  }

  const systemPrompt = buildSystemPrompt(tipo, contexto, nomeUsuario)

  // Streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat(mensagens, systemPrompt)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n[Erro: ${String(e)}]`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  })
}
