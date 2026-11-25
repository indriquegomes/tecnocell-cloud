import { NextResponse } from 'next/server'
import { createServiceClient, fetchAll } from '@/lib/supabase/server'
import { hojeSP } from '@/lib/utils'
import { agruparLinhas, escolherChatDeErro, gruposAAvisar, mapearChats, montarAviso, nomeDoChat, type LinhaErro, type UpdateTelegram } from '@/lib/vigia-erros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Vigia do uso em tempo real. Roda de 10 em 10 minutos: pega o que quebrou desde a
// última passada, agrupa e avisa UMA vez, no grupo privado do dono.
//
// Duas garantias que já custaram caro neste sistema quando faltaram:
// - agrupamento + avisado_em: o mesmo problema não volta ao Telegram antes de 1
//   hora (o aviso repetido é o que faz a equipe parar de ler — foi o defeito do
//   comprovante PIX duplicado em 19/11/2026);
// - a hora de cada passada fica gravada (`erros_vigia`), porque NÃO existe
//   mensagem de "está tudo bem": vigia parado tem que aparecer na tela, não
//   depender de alguém estranhar o silêncio.

const JANELA_MIN = 15      // só o que chegou agora
const SILENCIO_MIN = 60    // mesmo problema não repete aviso antes disso
const RETENCAO_DIAS = 60   // histórico que a tela Saúde consegue mostrar
const MAX_LINHAS = 8

// Início do dia em São Paulo (o servidor roda em UTC: depois das 21h o
// `toISOString` já caiu no dia seguinte e a conta "Total hoje" mentiria).
function inicioDoDiaISO(dia: string): string {
  return new Date(dia + 'T00:00:00-03:00').toISOString()
}

// De quem é o aviso. Ordem: variável de ambiente → o que já foi descoberto e
// salvo → descoberta agora.
//
// A descoberta existe porque `chat_id` numérico é impossível de ler no Telegram e
// o dono não tem que mexer nisso: ele cria o grupo (ou abre conversa com o bot) e
// o Telegram avisa o bot com o id. Grupo só vale com "erro" no nome; conversa
// direta só porque este bot é dedicado ao monitoramento — a única DM dele é a do
// dono. Nunca escolhe o grupo da loja.
async function descobrirChatDoErro(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<{ chat: string | null; titulo: string | null; erro: string | null }> {
  const token = process.env.TELEGRAM_TOKEN_ERROS || process.env.TELEGRAM_TOKEN_PETROPOLIS
  if (!token) return { chat: null, titulo: null, erro: 'sem token do Telegram configurado (TELEGRAM_TOKEN_ERROS)' }

  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/getUpdates?limit=100', { cache: 'no-store' })
    const corpo = (await r.json()) as { ok: boolean; description?: string; result?: UpdateTelegram[] }
    if (!corpo.ok) {
      // Webhook ativo no bot responde 409: aí a descoberta não funciona e o
      // caminho é cadastrar TELEGRAM_GRUPO_ERROS (ou usar um bot só de erro).
      return { chat: null, titulo: null, erro: corpo.description ?? 'Telegram recusou getUpdates' }
    }

    // Conversa direta só vale com o bot DEDICADO (TELEGRAM_TOKEN_ERROS). No bot da
    // loja (fallback do token) qualquer pessoa que já falou com ele apareceria no
    // getUpdates, e o aviso técnico iria parar na conversa dela.
    const dedicado = !!process.env.TELEGRAM_TOKEN_ERROS
    const candidatos = mapearChats(corpo.result ?? []).filter((c) => dedicado || c.tipo !== 'private')
    const achado = escolherChatDeErro(candidatos)
    const nome = nomeDoChat(achado)
    if (!achado) {
      return { chat: null, titulo: null, erro: 'o bot ainda não está em grupo nem conversa: mande "oi" para ele no Telegram' }
    }

    const chat = String(achado.id)
    await supabase.from('configuracoes').upsert(
      { chave: 'erros_chat', valor: { chat_id: chat, titulo: nome, em: new Date().toISOString() } },
      { onConflict: 'chave' },
    )
    // Avisa uma vez no próprio destino que ele foi escolhido: o dono confirma na
    // hora, sem precisar abrir o painel.
    await mandarTelegram(chat, '🛠 Monitoramento conectado. Daqui pra frente eu aviso aqui quando alguma tela der problema — só quando houver problema.')
    return { chat, titulo: nome, erro: null }
  } catch (e) {
    return { chat: null, titulo: null, erro: e instanceof Error ? e.message : String(e) }
  }
}

async function resolverChatDoErro(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<{ chat: string | null; titulo: string | null; erro: string | null }> {
  if (process.env.TELEGRAM_GRUPO_ERROS) return { chat: process.env.TELEGRAM_GRUPO_ERROS, titulo: null, erro: null }

  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', 'erros_chat').maybeSingle()
  const salvo = (data?.valor as { chat_id?: string; titulo?: string | null } | null) ?? null
  if (salvo?.chat_id) return { chat: salvo.chat_id, titulo: salvo.titulo ?? null, erro: null }

  return descobrirChatDoErro(supabase)
}

async function mandarTelegram(
  chat: string,
  texto: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_TOKEN_ERROS || process.env.TELEGRAM_TOKEN_PETROPOLIS
  if (!token) return false
  try {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
    })
    return r.ok
  } catch {
    return false
  }
}

// Sem resumo diário de propósito: mensagem no Telegram SÓ quando há problema.
// "Nada quebrou hoje" toda noite vira ruído e a pessoa para de ler o grupo.
// A prova de vida do vigia fica na tela Saúde do sistema ("último check: 10h40"),
// que é onde se olha quando se quer saber — e não no bolso de quem trabalha.

async function vigia() {
  const supabase = await createServiceClient()

  // Limpeza barata do histórico antigo (a tela não precisa de 60 dias pra trás).
  await supabase
    .from('erros_app')
    .delete()
    .lt('created_at', new Date(Date.now() - RETENCAO_DIAS * 86400000).toISOString())

  // Página por página (fetchAll): uma tempestade de erro acima de 1000 linhas não
  // pode deixar linha para trás — quem fica de fora da janela nunca é avisado e
  // nunca é marcado.
  const desde = new Date(Date.now() - JANELA_MIN * 60000).toISOString()
  const linhas = (await fetchAll((from, to) =>
    supabase
      .from('erros_app')
      .select('id, created_at, agrupamento, tela, titulo, gravidade, usuario_id, usuario_email')
      .is('avisado_em', null)
      .gte('created_at', desde)
      // `.order()` por coluna ÚNICA (id), nunca `created_at`: o PostgREST pagina
      // por offset e, empatado, a mesma linha volta em duas páginas — o aviso
      // diria "4×" onde aconteceram 2.
      .order('id')
      .range(from, to),
  )) as LinhaErro[]

  // Destino do aviso resolvido no começo da passada: assim o grupo é descoberto
  // logo depois de o dono criar e o resultado aparece na tela Saúde.
  const destino = await resolverChatDoErro(supabase)

  // Marca a passada: é a prova de vida que a tela Saúde mostra ("último check"),
  // e também registra para onde o aviso está indo (ou por que não está indo).
  async function registrarPassada(novos: number, avisado: boolean) {
    await supabase.from('configuracoes').upsert(
      {
        chave: 'erros_vigia',
        valor: {
          ultima_em: new Date().toISOString(),
          novos,
          avisado,
          chat_titulo: destino.titulo,
          chat_ok: Boolean(destino.chat),
          chat_erro: destino.erro,
        },
      },
      { onConflict: 'chave' },
    )
  }

  if (linhas.length === 0) {
    await registrarPassada(0, false)
    return NextResponse.json({ ok: true, novos: 0, avisado: false, chat: destino.chat ? 'ok' : destino.erro })
  }

  const grupos = agruparLinhas(linhas)

  // Grupos que já foram avisados na última hora não voltam ao Telegram. O silêncio
  // é lido de `avisado_em` das linhas que JÁ foram anunciadas — por isso linha de
  // grupo silenciado não é marcada (marcar renovaria o silêncio para sempre e o
  // defeito que dura o dia inteiro seria anunciado uma vez só).
  const chaves = grupos.map((g) => g.chave).slice(0, 50)
  const { data: recentes } = await supabase
    .from('erros_app')
    .select('agrupamento')
    .in('agrupamento', chaves)
    .not('avisado_em', 'is', null)
    .gte('avisado_em', new Date(Date.now() - SILENCIO_MIN * 60000).toISOString())
  const silenciados = new Set(((recentes ?? []) as { agrupamento: string }[]).map((r) => r.agrupamento))

  const avisaveis = gruposAAvisar(grupos, silenciados)

  let enviado = false
  if (avisaveis.length > 0) {
    const { count } = await supabase
      .from('erros_app')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', inicioDoDiaISO(hojeSP()))

    // Nome COMPLETO de quem estava usando (regra do projeto: nunca login nem
    // apelido). Sai do perfil, pelo id — sem isso o aviso não cita ninguém.
    const idsPessoas = [...new Set(avisaveis.flatMap((g) => g.itens.map((i) => i.usuario_id)).filter(Boolean))] as string[]
    const nomes: Record<string, string> = {}
    if (idsPessoas.length > 0) {
      const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', idsPessoas.slice(0, 50))
      for (const p of (perfis ?? []) as { id: string; nome: string }[]) nomes[p.id] = p.nome
    }

    enviado = destino.chat
      ? await mandarTelegram(destino.chat, montarAviso(avisaveis, count ?? 0, JANELA_MIN, MAX_LINHAS, nomes))
      : false
  }

  // Marca SÓ o que foi anunciado, e só se o Telegram aceitou. Marcar quando o
  // envio falha (token errado, rede fora) enterraria o aviso em silêncio: a linha
  // nunca voltaria a ser selecionada e ninguém saberia do problema.
  // Em blocos de 100 ids: `.in()` vira query string e passar de ~8 mil caracteres
  // estoura a URL — o filtro não aplica e nada é marcado.
  if (enviado) {
    const anunciados = avisaveis.flatMap((g) => g.itens.map((i) => i.id))
    for (let i = 0; i < anunciados.length; i += 100) {
      await supabase
        .from('erros_app')
        .update({ avisado_em: new Date().toISOString() })
        .in('id', anunciados.slice(i, i + 100))
    }
  }

  await registrarPassada(linhas.length, enviado)

  return NextResponse.json({
    ok: true,
    novos: linhas.length,
    grupos: grupos.length,
    avisado: enviado,
    chat: destino.chat ? 'ok' : destino.erro,
  })
}

export async function GET(req: Request) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }
  return vigia()
}
