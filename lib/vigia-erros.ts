// Regra do aviso do vigia, sem banco e sem rede — para poder ser testada
// (test/vigia-erros.test.ts). A rota /api/vigia/erros só busca as linhas,
// chama isto e manda no Telegram.

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

// ── Descoberta do grupo de aviso ───────────────────────────────────────────────
//
// O dono não deve precisar descobrir nem digitar um "chat_id". Ele cria o grupo,
// põe o bot dentro e o Telegram avisa o bot (update `my_chat_member`); daí sai o
// id. A ordem das escolhas mora aqui, longe da rede, para poder ser testada.

export type ChatCandidato = { id: number | string; titulo: string | null; tipo: string }

// Só vale grupo com "erro" no nome. Sem esse filtro o bot poderia despejar aviso
// técnico no grupo da loja — pior erro possível nesta peça.
export function escolherChatDeErro(chats: ChatCandidato[]): ChatCandidato | null {
  const grupos = chats.filter(
    (c) => (c.tipo === 'group' || c.tipo === 'supergroup') && /erro/i.test(c.titulo ?? ''),
  )
  return grupos.length > 0 ? grupos[grupos.length - 1] : null
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
