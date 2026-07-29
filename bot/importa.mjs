// Traz o caixa que está ABERTO no bot antigo (Supabase) pro banco local, pra o bot v2
// continuar do último /abrir em vez de começar do zero (e zerar a planilha).
// `node bot/importa.mjs`            → só mostra o que faria
// `node bot/importa.mjs --aplicar`  → grava no SQLite
import { LOJAS, env } from './lib/env.mjs'
import * as db from './lib/db.mjs'
import { agrupaPorDestino, money } from './lib/util.mjs'

const APLICAR = process.argv.includes('--aplicar')
const U = env('NEXT_PUBLIC_SUPABASE_URL'), K = env('SUPABASE_SERVICE_ROLE_KEY')

async function rest(path) {
  const r = await fetch(U + '/rest/v1/' + path, { headers: { apikey: K, Authorization: 'Bearer ' + K } })
  const j = await r.json()
  if (!r.ok) throw new Error('supabase ' + r.status + ': ' + JSON.stringify(j).slice(0, 200))
  return j
}
// PostgREST corta em 1000 por request — pagina sempre.
async function tudo(path) {
  const out = []
  for (let de = 0; ; de += 1000) {
    const p = await rest(`${path}&offset=${de}&limit=1000`)
    out.push(...p)
    if (p.length < 1000) break
  }
  return out
}

for (const loja of LOJAS) {
  const [per] = await rest(`pix_periodos?select=*&telegram_chat_id=eq.${loja.grupo}&fechado_em=is.null&order=aberto_em.desc&limit=1`)
  if (!per) { console.log(`\n== ${loja.slug}: nenhum caixa aberto no bot antigo — nada a importar`); continue }

  const cs = await tudo(`comprovantes_pix?select=*&telegram_chat_id=eq.${loja.grupo}&recebido_em=gte.${encodeURIComponent(per.aberto_em)}&order=recebido_em.asc`)
  const st = {}
  cs.forEach((c) => { st[c.status] = (st[c.status] || 0) + 1 })
  const bons = cs.filter((c) => ['extraido', 'data_divergente', 'apagado'].includes(c.status))
  const total = bons.reduce((s, c) => s + (Number(c.valor) || 0), 0)

  console.log(`\n== ${loja.slug} (${loja.aba})`)
  console.log('   /abrir em', new Date(per.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), 'por', per.aberto_por || '?')
  console.log('   comprovantes:', cs.length, JSON.stringify(st))
  console.log('   total que vai contar: R$', money(total), '·', bons.length, 'comprovantes')
  const g = agrupaPorDestino(bons.map((c) => ({ ...c, destinatario_doc: c.extraido_raw?.destinatario_doc })))
  for (const k of Object.keys(g).sort()) {
    const it = g[k]
    console.log('     ·', it.nome, '— R$', money(it.itens.reduce((s, c) => s + (Number(c.valor) || 0), 0)), `(${it.itens.length})`)
  }
  if (st.apagado) console.log('   ⚠️  ' + st.apagado + ' estavam marcados "apagado" pelo espelho (que era falso-positivo) — entram como válidos')

  if (!APLICAR) continue

  const jaTem = db.periodoAberto(loja.grupo)
  if (jaTem) { console.log('   ⏭  já existe caixa aberto no banco local — pulando'); continue }
  db.db.prepare('insert into periodos (chat_id,aberto_em,aberto_por) values (?,?,?)').run(loja.grupo, per.aberto_em, per.aberto_por || null)

  let n = 0
  for (const c of cs) {
    if (!c.telegram_message_id) continue
    const raw = c.extraido_raw || {}
    const status = c.status === 'apagado' ? 'extraido' : c.status
    db.guardaChegada({
      chat_id: loja.grupo, msg_id: c.telegram_message_id, loja: loja.slug,
      recebido_em: c.recebido_em, formato: c.formato || 'foto',
      file_id: c.arquivo_file_id, url: c.arquivo_url,
    })
    db.db.prepare(`update comprovantes set valor=?, data_pix=?, pagador=?, destinatario=?, destinatario_doc=?,
        transacao_id=?, status=?, raw=?, valor_incerto=?, valor_leitura2=?, dup_avisado=?, cross_avisado=?
      where chat_id=? and msg_id=?`)
      .run(c.valor ?? null, c.data_pix ?? null, c.pagador ?? null, c.destinatario ?? null,
        String(raw.destinatario_doc || '').replace(/\D/g, '') || null, c.transacao_id ?? null, status,
        JSON.stringify(raw), raw.valor_incerto ? 1 : 0, raw.valor_leitura2 ?? null,
        raw.dup_avisado ? 1 : 0, raw.cross_avisado ? 1 : 0, loja.grupo, c.telegram_message_id)
    n++
  }
  console.log('   ✅ importados', n, 'comprovantes + o caixa aberto')
}

if (!APLICAR) console.log('\n(nada foi gravado — rode com --aplicar)')
db.fechaBanco()
