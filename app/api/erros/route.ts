import { NextResponse } from 'next/server'
import { registrarErro } from '@/lib/erros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Recebe o problema da tela (sendBeacon). Rota aberta de propósito: erro na tela
// de login também precisa contar, e ali não existe sessão. O proxy do app já
// injeta x-user-email quando há sessão — e apaga x-user-* forjado, então não dá
// para culpar outra pessoa.
//
// Nada que chega é confiado: corpo limitado, texto saneado em lib/erros.ts, e a
// resposta é sempre a mesma — quem estiver sondando a rota não descobre nada.

const MAX_BYTES = 2048

// ponytail: limite por IP em memória, por instância do servidor. Basta para a
// atendente com a tela em laço e para não encher a tabela; não segura ataque
// distribuído (para isso: WAF/rate limit da Vercel). Custo de errar para menos:
// perde aviso, nunca derruba nada.
const contagem = new Map<string, { n: number; ate: number }>()

function passouDoLimite(ip: string): boolean {
  const agora = Date.now()
  // O Map vive enquanto a instância viver: sem esta poda ele cresceria para
  // sempre com IP que já saiu.
  if (contagem.size > 5000) {
    for (const [chave, valor] of contagem) if (valor.ate < agora) contagem.delete(chave)
  }
  const atual = contagem.get(ip)
  if (!atual || atual.ate < agora) {
    contagem.set(ip, { n: 1, ate: agora + 60_000 })
    return false
  }
  atual.n++
  return atual.n > 20
}

function texto(valor: unknown, max: number): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : null
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip'
    if (passouDoLimite(ip)) return NextResponse.json({ ok: true })

    // Confere o tamanho anunciado antes de ler o corpo (sendBeacon manda o
    // content-length; quando vem de outro cliente, cai no corte depois da leitura).
    const anunciado = Number(req.headers.get('content-length') || '0')
    if (anunciado > MAX_BYTES) return NextResponse.json({ ok: true })

    const bruto = await req.text()
    if (!bruto || bruto.length > MAX_BYTES) return NextResponse.json({ ok: true })

    const dados = JSON.parse(bruto) as Record<string, unknown>
    const titulo = texto(dados.titulo, 120)
    if (!titulo) return NextResponse.json({ ok: true })

    await registrarErro({
      origem: dados.origem === 'servidor' ? 'servidor' : 'tela',
      gravidade: dados.gravidade === 'atencao' ? 'atencao' : 'erro',
      tela: texto(dados.tela, 120),
      titulo,
      mensagem: texto(dados.mensagem, 400),
      // O proxy do app apaga x-user-* forjado pelo cliente e reescreve com a
      // sessão validada — estes dois headers são confiáveis, o corpo não é.
      usuarioId: req.headers.get('x-user-id'),
      usuarioEmail: req.headers.get('x-user-email'),
      digest: texto(dados.digest, 40),
      contexto: {
        url: texto(dados.url, 200),
        navegador: texto(dados.navegador, 120),
      },
    })
  } catch {
    // corpo inválido ou banco fora: não é problema do navegador
  }
  return NextResponse.json({ ok: true })
}
