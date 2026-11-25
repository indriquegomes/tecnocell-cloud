// Regra do aviso do vigia, sem banco e sem rede — para poder ser testada
// (test/vigia-erros.test.ts). A rota /api/vigia/erros só busca as linhas,
// chama isto e manda no Telegram.

// ── Horário de aviso ──────────────────────────────────────────────────────────
//
// O sistema roda 24h, mas ninguém quer o celular apitando às 3 da manhã por causa
// de um visitante na loja virtual. Fora do horário o erro continua sendo GRAVADO
// (aparece na tela Saúde) e é anunciado na primeira passada depois de abrir.
//
// Referência é a mesma hora de fechamento que o aviso de caixa já usa
// (`configuracoes.pdv`), com folga depois do fechamento: problema que aparece
// enquanto estão fechando a gaveta ainda precisa chegar.

export type MomentoLoja = { minutosDoDia: number; diaSemana: number } // 0 = domingo

export const ABRE_MIN = 8 * 60          // 08:00
export const FOLGA_FECHAMENTO_MIN = 90  // avisa até 1h30 depois do fechamento

export function dentroDoHorarioDeAviso(
  momento: MomentoLoja,
  fechamentoSemana = '18:30',
  fechamentoSabado = '16:30',
): boolean {
  if (momento.diaSemana === 0) return false                 // domingo a loja não abre
  if (momento.minutosDoDia < ABRE_MIN) return false

  const referencia = momento.diaSemana === 6 ? fechamentoSabado : fechamentoSemana
  const [h, m] = referencia.split(':').map(Number)
  const fecha = (h || 0) * 60 + (m || 0)

  return momento.minutosDoDia <= fecha + FOLGA_FECHAMENTO_MIN
}

// De onde o vigia começa a ler: o normal é a janela curta (15 min), mas se a
// última vez que ele CONSEGUIU avisar foi há mais tempo (de madrugada, quando
// aviso fica pausado), o atrasado entra — senão o problema da noite nunca seria
// anunciado.
export function inicioDaJanela(agora: number, ultimoEnvio: number | null, janelaMin: number): number {
  const curta = agora - janelaMin * 60_000
  if (!ultimoEnvio) return curta
  return Math.min(curta, ultimoEnvio)
}

export type LinhaErro = {
  id: string
  created_at: string
  agrupamento: string
  tela: string | null
  titulo: string
  gravidade: string
  usuario_id: string | null
  usuario_email: string | null
}

export type GrupoErro = { chave: string; itens: LinhaErro[] }

// Mesmo problema = mesmo agrupamento. A ordem dentro do grupo importa: o item 0 é
// o mais recente (a rota já busca desc), e é dele que saem tela e título.
export function agruparLinhas(linhas: LinhaErro[]): GrupoErro[] {
  const grupos = new Map<string, LinhaErro[]>()
  for (const l of linhas) {
    const g = grupos.get(l.agrupamento) ?? []
    g.push(l)
    grupos.set(l.agrupamento, g)
  }
  return [...grupos.entries()].map(([chave, itens]) => ({ chave, itens }))
}

// Grupo avisado na última hora fica fora: aviso repetido é o que faz a equipe
// parar de ler o grupo.
export function gruposAAvisar(grupos: GrupoErro[], silenciados: Set<string>): GrupoErro[] {
  return grupos.filter((g) => !silenciados.has(g.chave))
}

// ── Descoberta do destino do aviso ────────────────────────────────────────────
//
// O dono não digita `chat_id`: ele cria o grupo (ou abre conversa com o bot) e o
// Telegram avisa o bot; daí sai o id. A ordem das escolhas mora aqui, longe da
// rede, para poder ser testada.

export type ChatCandidato = {
  id: number | string
  titulo: string | null
  tipo: string
  nome?: string | null   // conversa direta: first_name do dono
}

// Formato CRU do Telegram: `type`, `title`, `first_name`. Traduzir isso no tipo e
// ler errado (usar `c.tipo` no JSON cru) foi o que fez a descoberta achar dois
// updates e não reconhecer nenhum — por isso a tradução virou função testada.
export type ChatBruto = { id: number; type?: string; title?: string | null; first_name?: string | null }
export type UpdateTelegram = {
  message?: { chat?: ChatBruto }
  my_chat_member?: { chat?: ChatBruto }
}

export function mapearChats(updates: UpdateTelegram[]): ChatCandidato[] {
  const chats: ChatCandidato[] = []
  for (const u of updates) {
    const c = u.message?.chat ?? u.my_chat_member?.chat
    if (!c) continue
    chats.push({ id: c.id, tipo: c.type ?? '', titulo: c.title ?? null, nome: c.first_name ?? null })
  }
  return chats
}

// Ordem: (1) grupo com "erro" no nome; (2) conversa direta com o bot.
//
// Nunca escolhe grupo da loja: aquele não tem "erro" no título, e o bot do
// monitoramento é dedicado — a única conversa direta dele é a do dono.
export function escolherChatDeErro(chats: ChatCandidato[]): ChatCandidato | null {
  const grupos = chats.filter(
    (c) => (c.tipo === 'group' || c.tipo === 'supergroup') && /erro/i.test(c.titulo ?? ''),
  )
  if (grupos.length > 0) return grupos[grupos.length - 1]

  const diretas = chats.filter((c) => c.tipo === 'private')
  return diretas.length > 0 ? diretas[diretas.length - 1] : null
}

// Nome do destino, para a tela Saúde mostrar onde o aviso está caindo.
export function nomeDoChat(c: ChatCandidato | null): string | null {
  if (!c) return null
  return c.titulo ?? c.nome ?? null
}

// Quem estava usando: NOME COMPLETO, nunca login nem apelido (regra do projeto).
// O nome vem de perfis pelo id — não dá para montar nome pelo e-mail.
// Sem o nome, não mostra nada — melhor nada do que nome pela metade.
function quem(usuarioId: string | null, nomes?: Record<string, string>): string {
  if (!usuarioId) return ''
  const nome = nomes?.[usuarioId]
  return nome ? ' (' + nome + ')' : ''
}

// Mensagem do Telegram: o que aconteceu, quantas vezes, em que tela e com quem.
// Ordenada pelo que mais repetiu — é o que mais atrapalha o balcão.
export function montarAviso(
  grupos: GrupoErro[],
  totalHoje: number,
  janelaMin: number,
  maxLinhas: number,
  nomes?: Record<string, string>,
): string {
  const ordenados = [...grupos].sort((a, b) => b.itens.length - a.itens.length)
  const cabeca = ordenados.length + (ordenados.length === 1 ? ' problema novo' : ' problemas novos')
  const corpo = ordenados
    .slice(0, maxLinhas)
    .map(({ itens }) => {
      const p = itens[0]
      const marca = p.gravidade === 'atencao' ? '·' : '⚠'
      return marca + ' ' + itens.length + '× [' + (p.tela ?? 'sem tela') + '] ' + p.titulo + quem(p.usuario_id, nomes)
    })
    .join('\n')
  const resto = ordenados.length > maxLinhas ? '\n(+' + (ordenados.length - maxLinhas) + ' grupos no painel)' : ''
  return (
    '🛠 ' + cabeca + ' nos últimos ' + janelaMin + ' min\n\n' + corpo + resto +
    '\n\nTotal hoje: ' + totalHoje + ' · Detalhe: painel → Saúde do sistema'
  )
}
