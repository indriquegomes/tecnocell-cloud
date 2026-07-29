// ABAS NOVAS da planilha. NÃO encostam nas abas "Petrópolis"/"Teresópolis" — cada
// escrita é isolada por nome de aba, e essas três são exclusivas do bot v2.
//   Resumo    — as 2 lojas na mesma tela, parcial ao vivo
//   Alertas   — só o que precisa de olho humano (não lido, valor incerto, duplicado…)
//   Histórico — uma linha por caixa fechado, cresce com o tempo
import * as db from './db.mjs'
import { LOJAS } from './env.mjs'
import { agendaEscrita, escreveJa } from './sheets.mjs'
import { fmtDataBR } from './util.mjs'

export const ABA_RESUMO = 'Resumo'
export const ABA_ALERTAS = 'Alertas'
export const ABA_HISTORICO = 'Histórico'

const hora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '')

// Só monta as abas novas depois que ALGUMA loja teve contagem nesta máquina.
export const temDados = () => LOJAS.some((l) => db.ultimoPeriodo(l.grupo))

export function montaResumo(resumoDe) {
  const linhas = [['Loja', 'Situação', 'Total (R$)', 'Comprovantes', 'Precisa conferir']]
  const tipos = ['header']
  let geral = 0, nTotal = 0, alertas = 0
  for (const loja of LOJAS) {
    const r = resumoDe(loja)
    const aberta = r.periodo && !r.periodo.fechado_em
    const pend = []
    if (r.naoLidos) pend.push(`⚠️ ${r.naoLidos} não lido`)
    if (r.dups) pend.push(`🔁 ${r.dups} duplicado`)
    if (r.incompletos) pend.push(`❗ ${r.incompletos} sem destinatário`)
    geral += r.geral; nTotal += r.validos; alertas += r.naoLidos + r.dups + r.incompletos
    linhas.push([
      loja.aba,
      aberta ? 'ABERTA desde ' + hora(r.periodo.aberto_em) : r.periodo ? 'fechada ' + hora(r.periodo.fechado_em) : 'nunca aberta',
      r.geral, r.validos, pend.join(' · ') || 'tudo certo',
    ])
    tipos.push(pend.length ? 'alerta' : 'dado')
  }
  linhas.push(['', '', '', '', '']); tipos.push('blank')
  linhas.push(['AS DUAS LOJAS', '', geral, nTotal, alertas ? alertas + ' item(ns) pra conferir' : 'tudo certo'])
  tipos.push('total')
  linhas.push(['', '', '', '', '']); tipos.push('blank')
  linhas.push(['', 'atualizado em', '', hora(new Date().toISOString()), '']); tipos.push('dado')
  return { linhas, tipos, opts: { colValor: 2, colCentro: 3, larguras: [180, 260, 130, 130, 320] } }
}

const PROBLEMA = {
  recebido: '⏳ ainda não lido pela IA',
  ilegivel: '⚠️ não consegui ler — confira na mão',
  incompleto: '❗ sem destinatário — não está somado',
  duplicado: '🔁 duplicado — não está somado',
  data_divergente: '⚠️ data do Pix ≠ dia da contagem',
}

export function montaAlertas(resumoDe) {
  const linhas = [['Loja', 'Destinatário', 'Cliente', 'Valor (R$)', 'Data', 'O que conferir']]
  const tipos = ['header']
  let n = 0
  for (const loja of LOJAS) {
    for (const c of resumoDe(loja).itens) {
      let p = PROBLEMA[c.status]
      if (!p && c.valor_incerto) p = '⚠️ a IA leu dois valores diferentes — confira'
      if (!p && !c.transacao_id && c.status === 'extraido') p = 'ⓘ sem ID no comprovante — não dá pra checar duplicidade'
      if (!p) continue
      if (c.status === 'recebido' && c.ultima_falha) p += ' (' + String(c.ultima_falha).slice(0, 60) + ')'
      linhas.push([loja.aba, c.destinatario || '—', c.pagador || '—', c.valor != null ? Number(c.valor) : '', fmtDataBR(c.data_pix), p])
      tipos.push(c.status === 'duplicado' ? 'dup' : c.status === 'extraido' || c.status === 'data_divergente' ? 'alerta' : 'incompleto')
      n++
    }
  }
  if (!n) { linhas.push(['', '', '', '', '', '✅ nada pendente — pode fechar tranquila']); tipos.push('total') }
  return { linhas, tipos, opts: { colValor: 3, colCentro: 4, larguras: [130, 240, 220, 120, 110, 380] } }
}

export function montaHistorico() {
  const linhas = [['Fechado em', 'Loja', 'Total (R$)', 'Comprovantes', 'Duplicados', 'Sem destinatário', 'Não lidos', 'Abriu', 'Fechou']]
  const tipos = ['header']
  for (const f of db.historico(300)) {
    linhas.push([hora(f.fechado_em), f.loja || '', Number(f.total) || 0, f.n_validos, f.n_dups, f.n_incompletos, f.n_naolidos, f.aberto_por || '', f.fechado_por || ''])
    tipos.push(f.n_naolidos ? 'alerta' : 'dado')
  }
  if (linhas.length === 1) { linhas.push(['', 'nenhum caixa fechado ainda', '', '', '', '', '', '', '']); tipos.push('dado') }
  return { linhas, tipos, opts: { colValor: 2, colCentro: 3, larguras: [150, 130, 130, 130, 110, 150, 110, 160, 160] } }
}

export function atualizaAbasNovas(resumoDe, { ja = false } = {}) {
  if (!temDados()) return Promise.resolve()
  const f = ja ? escreveJa : (aba, monta) => { agendaEscrita(aba, monta); return Promise.resolve() }
  return Promise.all([
    f(ABA_RESUMO, () => montaResumo(resumoDe)),
    f(ABA_ALERTAS, () => montaAlertas(resumoDe)),
    f(ABA_HISTORICO, () => montaHistorico()),
  ])
}
