import * as db from './db.mjs'
import { leComprovante, apiPausada, saude } from './ia.mjs'
import { enviaTexto, enviaFoto, enviaDoc, tipoDaMensagem } from './tg.mjs'
import { agendaEscrita, escreveJa } from './sheets.mjs'
import { atualizaAbasNovas } from './abas.mjs'
import { agrupaPorDestino, dataDoId, resolveData, diaDiff, money, fmtDataBR, dorme, agora } from './util.mjs'

const LIDOS = ['extraido', 'data_divergente']

function decideStatus({ destinatario, data_pix, recebido_em }) {
  if (!destinatario || !String(destinatario).trim()) return 'incompleto'
  const rec = recebido_em ? String(recebido_em).slice(0, 10) : null
  if (data_pix && rec && diaDiff(data_pix, rec) > 2) return 'data_divergente'
  return 'extraido'
}

// ---------- leitura ----------
export async function lerUm(loja, c) {
  const r = await leComprovante(loja, c)
  if (!r.ok) { db.salvaFalha(c.id, r.motivo, r.transitoria); return false }
  if (r.dados.eh_comprovante === false) {
    db.salvaLeitura(c.id, { status: 'nao_comprovante', raw: JSON.stringify(r.dados.raw || {}) })
    return true
  }
  const d = r.dados
  const data_pix = resolveData(dataDoId(d.transacao_id), d.data_ocr, c.recebido_em)
  db.salvaLeitura(c.id, {
    valor: d.valor, data_pix, pagador: d.pagador, destinatario: d.destinatario,
    destinatario_doc: d.destinatario_doc, transacao_id: d.transacao_id,
    status: decideStatus({ destinatario: d.destinatario, data_pix, recebido_em: c.recebido_em }),
    raw: JSON.stringify(d.raw || {}),
    valor_incerto: d.valor_incerto, valor_leitura2: d.valor_leitura2, valor_leitura3: d.valor_leitura3,
  })
  return true
}

// Drena a fila de leitura. Rodando local não tem os 60s da Vercel: dá pra ir até acabar.
export async function drenar(loja, { maxMs = 25000, limite = 50 } = {}) {
  if (apiPausada()) return 0
  const t0 = Date.now()
  let n = 0
  while (Date.now() - t0 < maxMs) {
    const [c] = db.pendentes(loja.grupo, 1)
    if (!c) break
    try { if (await lerUm(loja, c)) n++ } catch (e) { db.salvaFalha(c.id, 'erro: ' + String(e?.message || e).slice(0, 90), true) }
    if (n >= limite || apiPausada()) break
  }
  return n
}

// ---------- dedup ----------
export async function deduplica(loja) {
  const todos = db.comTransacao(loja.grupo).filter((c) => c.status !== 'nao_comprovante')
  const porTx = {}
  for (const c of todos) (porTx[c.transacao_id] = porTx[c.transacao_id] || []).push(c)

  for (const tx of Object.keys(porTx)) {
    const arr = porTx[tx].sort((a, b) => a.msg_id - b.msg_id)
    arr.forEach((c, i) => {
      const data_pix = resolveData(dataDoId(c.transacao_id), null, c.recebido_em) || c.data_pix
      const deveria = i > 0 ? 'duplicado' : decideStatus({ ...c, data_pix })
      if (c.status !== deveria) db.setStatus(c.id, deveria)
      if (data_pix && c.data_pix !== data_pix) db.setDataPix(c.id, data_pix)
    })
    if (arr.length > 1 && !arr.some((c) => c.dup_avisado)) {
      const u = arr[arr.length - 1]
      await enviaTexto(loja.token, loja.grupo,
        '⚠️ COMPROVANTE JÁ ENVIADO (DUPLICADO NO CAIXA)\n'
        + (u.pagador ? 'De: ' + u.pagador + '\n' : '')
        + (u.destinatario ? 'Para: ' + u.destinatario + '\n' : '')
        + (u.valor != null ? 'Valor: R$ ' + money(u.valor) + '\n' : '')
        + `Esse Pix (ID ${tx}) já foi lançado. NÃO conta de novo e não vai no fechamento.`, u.msg_id)
      db.setFlag(arr[0].id, 'dup_avisado')
    }
    // MESMO Pix nos DOIS grupos: o bot avisa, não escolhe de quem é (as meninas decidem).
    const fora = db.txNoOutroGrupo(loja.grupo, tx)
    if (fora.length && !arr.some((c) => c.cross_avisado)) {
      const o = fora[0]
      await enviaTexto(loja.token, loja.grupo,
        '⚠️ ESTE PIX ESTÁ NOS DOIS GRUPOS (Petrópolis e Teresópolis)\n'
        + (o.valor != null ? 'Valor: R$ ' + money(o.valor) + '\n' : '')
        + (o.destinatario ? 'Para: ' + o.destinatario + '\n' : '')
        + `O mesmo Pix (ID ${tx}) foi postado nos dois grupos. Vejam de qual LOJA é e apaguem do grupo errado — pra não contar em dobro.`)
      db.setFlag(arr[0].id, 'cross_avisado')
    }
  }
}

// ---------- números do período ----------
export function resumoPeriodo(loja, periodo = null) {
  const p = periodo || db.periodoAberto(loja.grupo) || db.ultimoPeriodo(loja.grupo)
  const itens = p ? db.doPeriodo(loja.grupo, { desde: p.aberto_em, ate: p.fechado_em }) : db.doPeriodo(loja.grupo)
  const uteis = itens.filter((c) => c.status !== 'nao_comprovante')
  const grupos = agrupaPorDestino(uteis)
  let geral = 0, validos = 0, dups = 0, incompletos = 0, naoLidos = 0, faltando = 0
  for (const c of uteis) {
    if (c.status === 'duplicado') dups++
    else if (c.status === 'incompleto') incompletos++
    else if (c.status === 'ilegivel' || c.status === 'recebido') { naoLidos++; faltando++ }
    else { geral += Number(c.valor) || 0; validos++ }
  }
  return { periodo: p, itens: uteis, grupos, geral, validos, dups, incompletos, naoLidos, faltando }
}

export function montaPlanilha(loja) {
  const { grupos, geral, validos, dups, incompletos, naoLidos } = resumoPeriodo(loja)
  const linhas = [['Destinatário', 'Cliente', 'Valor (R$)', 'Data', 'Observação']]
  const tipos = ['header']
  for (const k of Object.keys(grupos).sort()) {
    const g = grupos[k]
    let soma = 0, nImg = 0
    const antes = linhas.length
    for (const c of g.itens) {
      // Duplicado não aparece aqui: já não soma e só atrapalha a conferência linha a linha.
      // Continua no banco e listado na aba Alertas, e a contagem aparece no TOTAL GERAL.
      if (c.status === 'duplicado') continue
      const v = Number(c.valor) || 0
      let obs = '', tp = 'dado'
      if (c.status === 'incompleto') { obs = '❗ sem destinatário — não somado'; tp = 'incompleto' }
      else if (c.status === 'ilegivel') { obs = '⚠️ não consegui ler — confira na mão'; tp = 'incompleto' }
      else if (c.status === 'recebido') { obs = '⏳ ainda não lido' + (c.ultima_falha ? ' (' + String(c.ultima_falha).slice(0, 40) + ')' : ''); tp = 'incompleto' }
      else {
        soma += v; nImg++
        if (c.valor_incerto) { obs = `⚠️ confere valor (leu R$${money(v)} / R$${money(c.valor_leitura2)})`; tp = 'alerta' }
        else if (c.status === 'data_divergente') { obs = '⚠️ data ≠ hoje'; tp = 'alerta' }
        else if (!c.transacao_id) { obs = 'ⓘ sem ID no comprovante — não dá pra checar duplicidade'; tp = 'alerta' }
      }
      linhas.push([g.nome, c.pagador || '—', c.valor != null ? v : '', fmtDataBR(c.data_pix), obs])
      tipos.push(tp)
    }
    if (linhas.length === antes) continue // grupo só de duplicado: nem aparece
    linhas.push(['', 'TOTAL ' + g.nome, soma, nImg + (nImg === 1 ? ' imagem' : ' imagens'), ''])
    tipos.push('subtotal')
    linhas.push(['', '', '', '', '']); tipos.push('blank')
  }
  const notas = [validos + ' comprovantes']
  if (dups) notas.push(dups + ' duplicado' + (dups > 1 ? 's' : ''))
  if (incompletos) notas.push(incompletos + ' sem destinatário')
  if (naoLidos) notas.push('⚠️ ' + naoLidos + ' NÃO lido' + (naoLidos > 1 ? 's' : '') + ' — total incompleto')
  linhas.push(['', 'TOTAL GERAL', geral, '', notas.join(' · ')]); tipos.push('total')
  return { linhas, tipos }
}

// TRAVA: enquanto ninguém deu /abrir nesta máquina, o bot NÃO encosta na planilha.
// O banco local começa vazio — sem isso, ligar o bot apagaria os números do último
// caixa que ainda estão nas abas (o clear+write reescreve a aba inteira).
const semPeriodo = new Set()
function podeEscrever(loja) {
  if (db.ultimoPeriodo(loja.grupo)) return true
  if (!semPeriodo.has(loja.grupo)) {
    semPeriodo.add(loja.grupo)
    console.log(`[${loja.slug}] sem contagem no banco local — planilha intocada até o primeiro /abrir`)
  }
  return false
}
export function atualizaPlanilha(loja) {
  if (!podeEscrever(loja)) return
  agendaEscrita(loja.aba, () => montaPlanilha(loja))
  atualizaAbasNovas((l) => resumoPeriodo(l))
}
export async function atualizaPlanilhaJa(loja) {
  if (!podeEscrever(loja)) return
  await escreveJa(loja.aba, () => montaPlanilha(loja))
  await atualizaAbasNovas((l) => resumoPeriodo(l), { ja: true })
}

// ---------- comandos ----------
async function abrir(loja, quem) {
  const p = db.periodoAberto(loja.grupo)
  if (p) {
    await enviaTexto(loja.token, loja.grupo, '⚠️ Já tem uma contagem ABERTA desde '
      + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '. Use /fechar antes de abrir outra.')
    return
  }
  db.abrePeriodo(loja.grupo, quem)
  await enviaTexto(loja.token, loja.grupo, '✅ Contagem do Pix ABERTA' + (quem ? ' por ' + quem : '') + '. Pode mandar os comprovantes.')
  await atualizaPlanilhaJa(loja)
}

async function fechar(loja, quem) {
  const p = db.periodoAberto(loja.grupo)
  if (!p) { await enviaTexto(loja.token, loja.grupo, 'ℹ️ Não há contagem aberta. Use /abrir primeiro.'); return }

  // ANTES de fechar, LÊ o que ficou pra trás. O bot antigo fechava com comprovante não lido
  // e o valor dele sumia do total sem ninguém saber — inclusive a última foto do dia, que
  // era justamente a que nunca era drenada.
  db.forcaRetry(loja.grupo) // quem estava esperando backoff de falha de rede tenta AGORA
  const pend = db.pendentes(loja.grupo, 1).length
  if (pend) await enviaTexto(loja.token, loja.grupo, '⏳ Lendo os comprovantes que faltam antes de fechar...')
  await drenar(loja, { maxMs: 120000, limite: 200 })
  await deduplica(loja)

  const r = resumoPeriodo(loja)
  let txt = '📊 FECHAMENTO DO PIX' + (quem ? ' — ' + quem : '') + '\n'
    + '(' + new Date(p.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ' → agora)\n\n'
  for (const k of Object.keys(r.grupos).sort()) {
    const g = r.grupos[k]
    const bons = g.itens.filter((c) => LIDOS.includes(c.status))
    if (!bons.length) continue
    const soma = bons.reduce((s, c) => s + (Number(c.valor) || 0), 0)
    txt += `• ${bons.length} ${bons.length === 1 ? 'imagem' : 'imagens'} — ${g.nome} — R$ ${money(soma)}\n`
  }
  txt += `\n💰 TOTAL: R$ ${money(r.geral)} · ${r.validos} comprovantes`
  if (r.dups) txt += `\n🔁 ${r.dups} duplicado${r.dups > 1 ? 's' : ''} (não somado${r.dups > 1 ? 's' : ''})`
  if (r.incompletos) txt += `\n❗ ${r.incompletos} sem destinatário (não somado${r.incompletos > 1 ? 's' : ''})`
  if (r.naoLidos) txt += `\n\n⚠️ ATENÇÃO: ${r.naoLidos} comprovante${r.naoLidos > 1 ? 's' : ''} NÃO foi lido — o total ACIMA está incompleto. Confira na planilha (linhas em laranja)${saude.ultimoErro ? '\nMotivo: ' + saude.ultimoErro : ''}`
  await enviaTexto(loja.token, loja.grupo, txt)

  db.fechaPeriodo(p.id, quem)
  db.guardaFechamento({
    periodo_id: p.id, chat_id: loja.grupo, loja: loja.aba,
    aberto_em: p.aberto_em, fechado_em: new Date().toISOString(),
    total: r.geral, n_validos: r.validos, n_dups: r.dups, n_incompletos: r.incompletos, n_naolidos: r.naoLidos,
    aberto_por: p.aberto_por, fechado_por: quem,
  })
  await atualizaPlanilhaJa(loja)
  db.setEstado(`reenvio:${loja.grupo}`, JSON.stringify({ periodo: p.id, cursor: 0, ativo: 1 }))
  reenvioArquivo(loja).catch((e) => console.error('[reenvio]', e))
}

async function revisar(loja) {
  await enviaTexto(loja.token, loja.grupo, '🔄 Relendo todos os comprovantes do período... aviso quando terminar.')
  const r = resumoPeriodo(loja)
  let n = 0
  for (const c of r.itens) {
    if (c.status === 'nao_comprovante') continue
    try { await lerUm(loja, db.porId(c.id)); n++ } catch { /* um ruim não trava o resto */ }
    if (apiPausada()) break
  }
  await deduplica(loja)
  await atualizaPlanilhaJa(loja)
  await enviaTexto(loja.token, loja.grupo, `✅ Releitura completa — ${n} comprovantes relidos.`)
}

async function status(loja) {
  const r = resumoPeriodo(loja)
  const aberta = r.periodo && !r.periodo.fechado_em
  let txt = aberta
    ? '🟢 Contagem ABERTA desde ' + new Date(r.periodo.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    : '⚪ Nenhuma contagem aberta (use /abrir)'
  txt += `\n\n💰 Parcial: R$ ${money(r.geral)} · ${r.validos} comprovantes`
  if (r.dups) txt += `\n🔁 ${r.dups} duplicado(s)`
  if (r.incompletos) txt += `\n❗ ${r.incompletos} sem destinatário`
  if (r.naoLidos) txt += `\n⏳ ${r.naoLidos} ainda não lido(s)`
  if (apiPausada()) txt += `\n🔴 Leitura PAUSADA: ${saude.ultimoErro}`
  await enviaTexto(loja.token, loja.grupo, txt)
}

// ---------- arquivo do fechamento ----------
const reenviando = new Set()
const avisoFechado = new Map()
export async function reenvioArquivo(loja) {
  if (reenviando.has(loja.grupo)) return
  const est = JSON.parse(db.getEstado(`reenvio:${loja.grupo}`, 'null') || 'null')
  if (!est?.ativo) return
  reenviando.add(loja.grupo)
  try {
    // O arquivo é do período que FOI FECHADO — não do "período atual". Se alguém dá
    // /abrir enquanto o reenvio ainda está mandando, o resumo ao vivo já é outro e o
    // bot reenviaria os arquivos errados.
    const itens = est.periodo ? db.porPeriodoId(est.periodo).filter((c) => c.status !== 'nao_comprovante') : resumoPeriodo(loja).itens
    const grupos = agrupaPorDestino(itens)
    const fila = []
    for (const k of Object.keys(grupos).sort()) {
      const g = grupos[k]
      const bons = g.itens.filter((c) => LIDOS.includes(c.status))
      if (!bons.length) continue
      fila.push({ t: 'h', nome: g.nome, n: bons.length, soma: bons.reduce((s, c) => s + (Number(c.valor) || 0), 0) })
      for (const c of bons) {
        if (c.formato === 'link' && c.url) fila.push({ t: 'link', url: c.url })
        else if (c.file_id) fila.push({ t: c.formato, fid: c.file_id })
      }
    }
    let cur = Number(est.cursor) || 0
    while (cur < fila.length) {
      const it = fila[cur]
      try {
        if (it.t === 'h') await enviaTexto(loja.token, loja.grupo, `📎 ${it.nome} — ${it.n} comprovantes — R$ ${money(it.soma)}`)
        else if (it.t === 'foto') await enviaFoto(loja.token, loja.grupo, it.fid)
        else if (it.t === 'pdf') await enviaDoc(loja.token, loja.grupo, it.fid)
        else if (it.t === 'link') await enviaTexto(loja.token, loja.grupo, '🔗 ' + it.url)
      } catch (e) { console.error('[reenvio item]', String(e?.message || e)) }
      cur++
      db.setEstado(`reenvio:${loja.grupo}`, JSON.stringify({ ...est, cursor: cur, ativo: 1 }))
      if (cur < fila.length) await dorme(3000) // ~20/min: abaixo do flood-control do Telegram
    }
    db.setEstado(`reenvio:${loja.grupo}`, JSON.stringify({ ...est, cursor: cur, ativo: 0 }))
    await enviaTexto(loja.token, loja.grupo, `✅ Arquivo do fechamento completo — ${fila.length} itens enviados.`)
  } finally {
    reenviando.delete(loja.grupo)
  }
}

// ---------- entrada de mensagem ----------
export async function processaMensagem(loja, update) {
  const m = update.message || update.channel_post || update.edited_message
  if (!m?.chat || Number(m.chat.id) !== Number(loja.grupo)) return
  const txt = (m.text || '').trim().toLowerCase()
  const quem = m.from ? ((m.from.first_name || '') + (m.from.last_name ? ' ' + m.from.last_name : '')).trim() : null

  if (txt.startsWith('/abrir')) return abrir(loja, quem)
  if (txt.startsWith('/fechar')) return fechar(loja, quem)
  if (txt.startsWith('/revisar')) return revisar(loja)
  if (txt.startsWith('/status') || txt.startsWith('/parcial')) return status(loja)
  if (txt.startsWith('/')) return

  const t = tipoDaMensagem(m)
  if (!t) return

  // Comprovante mandado com a contagem FECHADA não entra em período nenhum — antes ele
  // era guardado e sumia calado, e ninguém descobria até faltar dinheiro no caixa.
  if (!db.periodoAberto(loja.grupo)) {
    const ultimo = avisoFechado.get(loja.grupo) || 0
    if (Date.now() - ultimo > 10 * 60 * 1000) {
      avisoFechado.set(loja.grupo, Date.now())
      await enviaTexto(loja.token, loja.grupo,
        '⚠️ A contagem está FECHADA — esse comprovante NÃO está sendo contado.\nDê /abrir antes de mandar os comprovantes.', m.message_id)
    }
  }

  const c = db.guardaChegada({
    chat_id: loja.grupo, msg_id: m.message_id, loja: loja.slug,
    recebido_em: new Date((m.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    formato: t.formato, file_id: t.file_id, url: t.url,
  })
  if (!c || c.status !== 'recebido') return
  await lerUm(loja, c)
  await deduplica(loja)
  atualizaPlanilha(loja)
}

export const tick = async (loja) => {
  const n = await drenar(loja, { maxMs: 20000, limite: 20 })
  if (n) { await deduplica(loja); atualizaPlanilha(loja) }
  return n
}
export { agora }
