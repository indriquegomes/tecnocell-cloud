import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamChat, buildSystemPrompt, type ChatMessage } from '@/lib/claude'

export async function POST(req: NextRequest) {
  const { mensagens, tipo: tipoRequisitado = 'cliente' } = await req.json() as {
    mensagens: ChatMessage[]
    tipo: 'funcionario' | 'cliente'
  }

  const supabase = await createClient()

  // Valida no servidor: só concede contexto de funcionário se o usuário está autenticado
  const { data: { user } } = await supabase.auth.getUser()
  const tipo: 'funcionario' | 'cliente' = (tipoRequisitado === 'funcionario' && user) ? 'funcionario' : 'cliente'

  // Monta contexto a partir do Supabase
  let contexto: Record<string, unknown> = {}

  if (tipo === 'funcionario') {
    const [{ data: produtos }, { data: estoque }, { data: lancamentos }] = await Promise.all([
      supabase.from('produtos').select('id, nome, preco, categoria, marca, ativo').limit(50),
      supabase.from('estoque').select('produto_id, quantidade, deposito_id'),
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
      itensEmEstoque: estoque?.length ?? 0,
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

  const systemPrompt = buildSystemPrompt(tipo, contexto)

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
