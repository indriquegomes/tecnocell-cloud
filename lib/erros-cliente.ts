// Lado do navegador do monitoramento: manda o problema e esquece.
//
// sendBeacon porque a tela está quebrada — um fetch normal morre junto com a
// página. Nada aqui pode lançar nem mostrar nada para a atendente.

export type ErroTela = {
  titulo: string
  mensagem?: string
  tela?: string
  digest?: string
  gravidade?: 'erro' | 'atencao'
}

const vistos = new Map<string, number>()

// Teto por página. Tela em laço (render quebrado, fetch que repete) geraria
// centenas de linhas iguais e encheria o aviso do dono com ruído — o que importa
// é saber que aquela tela quebrou. O contador zera ao trocar de tela: sem isso,
// 5 erros na sessão inteira silenciariam o resto do dia (o painel é SPA).
const MAX_POR_PAGINA = 5
let enviados = 0
let paginaDoContador = ''

function zerarSeMudouDeTela(pagina: string): void {
  if (pagina !== paginaDoContador) {
    paginaDoContador = pagina
    enviados = 0
  }
}

export function enviarErro(e: ErroTela): void {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return
    const pagina = e.tela ?? location.pathname
    zerarSeMudouDeTela(pagina)
    if (enviados >= MAX_POR_PAGINA) return
    // Trava simples contra laço: se a MESMA tela quebrar em série (render em
    // loop), não manda a mesma coisa 200 vezes.
    const chave = pagina + '|' + e.titulo
    const agora = Date.now()
    const antes = vistos.get(chave)
    if (antes && agora - antes < 60_000) return
    vistos.set(chave, agora)
    enviados++

    const corpo = JSON.stringify({
      origem: 'tela',
      tela: pagina,
      titulo: e.titulo.slice(0, 120),
      mensagem: e.mensagem?.slice(0, 400),
      digest: e.digest,
      gravidade: e.gravidade,
      // Só o caminho, nunca o href: query string pode levar busca com CPF, nome
      // ou telefone digitado pelo atendente.
      url: location.pathname,
      navegador: navigator.userAgent.slice(0, 120),
    })
    navigator.sendBeacon('/api/erros', new Blob([corpo], { type: 'application/json' }))
  } catch {
    // erro de reportar erro não pode virar erro na tela
  }
}

// Título do aviso: ESTÁVEL por tipo de erro, de propósito.
//
// Mensagem de erro carrega dado que muda a cada ocorrência (id de venda, nome de
// coluna, número do Postgres) e, como o agrupamento é por título, cada variação
// viraria um grupo novo — o dono receberia 15 avisos do mesmo defeito. O texto
// completo vai no campo `mensagem` e aparece na tela Saúde do sistema.
export function tituloDeErro(erro: unknown, prefixo = 'Tela não carregou'): string {
  const nome =
    erro instanceof Error && erro.name && erro.name !== 'Error'
      ? erro.name
      : erro instanceof Error
        ? 'erro'
        : 'sem detalhe'
  return prefixo + ' (' + nome + ')'
}
