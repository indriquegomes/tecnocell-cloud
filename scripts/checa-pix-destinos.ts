// Conferência do bloco "PIX do dia — quem recebeu" contra o Telegram e o caixa.
// Somente leitura. Roda: node --import ./test/alias.mjs scripts/checa-pix-destinos.ts
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { agruparPorDestino, casarFornecedor, ehContaPropria, normNome, separarComprovantes, type FornecedorRef } from '@/lib/pix-destinos'

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function all<T>(q: () => any): Promise<T[]> {
  const out: T[] = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q().range(f, f + 999)
    if (error) throw new Error(error.message)
    out.push(...(data as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const { data: lojas } = await sb.from('lojas').select('id, nome, cnpj').eq('ativa', true).order('nome')
const fornecedores = await all<FornecedorRef>(() =>
  sb.from('pessoas').select('id, nome, nome_fantasia, cpf_cnpj, chave_pix').eq('tipo', 'fornecedor').order('nome'))
const abertos = await all<{ pessoa_id: string | null; valor: number | null; valor_pago: number | null }>(() =>
  sb.from('lancamentos').select('pessoa_id, valor, valor_pago').eq('tipo', 'pagar').neq('status', 'cancelado').not('pessoa_id', 'is', null))
const { data: contas } = await sb.from('contas').select('chave_pix, titular').not('chave_pix', 'is', null)
const emAberto: Record<string, number> = {}
for (const l of abertos) {
  if (!l.pessoa_id) continue
  const falta = Number(l.valor ?? 0) - Number(l.valor_pago ?? 0)
  if (falta > 0.005) emAberto[l.pessoa_id] = (emAberto[l.pessoa_id] ?? 0) + falta
}
const docsProprios = [...(lojas ?? []).map((l) => l.cnpj), ...(contas ?? []).map((c) => c.chave_pix)]
const nomesProprios = (contas ?? []).map((c) => c.titular)
const money = (v: number) => v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const { data: periodos } = await sb.from('pix_periodos').select('telegram_chat_id, aberto_por').order('aberto_em', { ascending: false }).limit(120)
function grupoDa(nomeLoja: string): number | null {
  const alvo = normNome(nomeLoja)
  const conta = new Map<number, number>()
  for (const p of periodos ?? []) {
    const quem = normNome(p.aberto_por)
    if (alvo.length >= 6 && (quem.includes(alvo) || alvo.includes(quem.replace('TECNOCELL ', '')))) {
      conta.set(p.telegram_chat_id, (conta.get(p.telegram_chat_id) ?? 0) + 1)
    }
  }
  let melhor: number | null = null, vistos = 0
  for (const [chat, n] of conta) if (n > vistos) { vistos = n; melhor = chat }
  return melhor
}

for (const loja of lojas ?? []) {
  const chat = grupoDa(loja.nome)
  const { data: caixas } = await sb.from('caixas').select('id, aberto_em, fechado_em').eq('loja_id', loja.id).not('fechado_em', 'is', null).order('aberto_em', { ascending: false }).limit(1)
  const cx = caixas?.[0]
  console.log(`\n════ ${loja.nome}  · grupo ${chat ?? 'NÃO ACHADO'}`)
  if (!cx) { console.log('  sem caixa fechado'); continue }
  console.log(`  último caixa fechado: ${new Date(cx.aberto_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} → ${new Date(cx.fechado_em!).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`)
  if (!chat) continue

  const { data: comps } = await sb.from('comprovantes_pix')
    .select('valor, destinatario, extraido_raw, status, transacao_id')
    .eq('telegram_chat_id', chat).neq('status', 'furo').gte('recebido_em', cx.aberto_em).lte('recebido_em', cx.fechado_em!)

  // mesmo Pix no grupo da outra loja
  const txMinhas = [...new Set((comps ?? []).map((c) => c.transacao_id).filter(Boolean))] as string[]
  let txOutro: string[] = []
  if (txMinhas.length) {
    const { data: outras } = await sb.from('comprovantes_pix').select('transacao_id').neq('telegram_chat_id', chat).in('transacao_id', txMinhas)
    txOutro = [...new Set((outras ?? []).map((o) => o.transacao_id as string))]
  }
  const sep = separarComprovantes(
    (comps ?? []).map((c) => ({
      valor: Number(c.valor) || null,
      destinatario: c.destinatario ?? null,
      doc: (c.extraido_raw as { destinatario_doc?: string } | null)?.destinatario_doc ?? null,
      transacaoId: c.transacao_id ?? null,
      status: c.status ?? null,
    })),
    { transacoesDoOutroGrupo: txOutro },
  )
  console.log(`  ${sep.validos.length} válidos de ${(comps ?? []).length} linhas · repetidos ${sep.repetidos} (${money(sep.valorRepetido)}) · ilegíveis/não lidos ${sep.naoLidos} · sem destino ${sep.semDestino} (${money(sep.valorSemDestino)}) · nao_comprovante ${sep.naoComprovante} · nos dois grupos ${sep.cruzados.length} (${money(sep.valorCruzado)}) · apagados ${sep.apagados}`)

  const destinos = agruparPorDestino(sep.validos).map((d) => {
    const f = casarFornecedor(d, fornecedores)
    return { ...d, fornecedor: f?.nome ?? null, fornecedorId: f?.id ?? null, propria: ehContaPropria(d, docsProprios, nomesProprios), divida: f ? (emAberto[f.id] ?? 0) : 0 }
  })

  let soma = 0, somaConta = 0
  for (const d of destinos) {
    soma += d.total
    if (d.propria) somaConta += d.total
    const rotulo = d.propria ? 'CAI NA CONTA' : (d.fornecedor ?? '?? nao identificado')
    console.log(`  ${money(d.total).padStart(12)}  ${String(d.comprovantes).padStart(3)}x  ${rotulo.padEnd(28)} ${d.nome.slice(0, 34)}${d.fornecedor ? `  (deve ${money(d.divida)})` : ''}`)
  }
  console.log(`  ${money(soma).padStart(12)}  TOTAL dos comprovantes do caixa`)
  console.log(`  ${money(somaConta).padStart(12)}  caiu na conta · ${money(soma - somaConta).padStart(12)} foi direto ao fornecedor`)

  // PIX registrado no caixa = vendas em PIX + fiado recebido em PIX (o que a
  // linha "PIX" do resumo do caixa mostra). É contra este número que o bloco
  // de comprovantes tem que fechar.
  const { data: vendas } = await sb.from('vendas').select('id').eq('caixa_id', cx.id).eq('status', 'concluida')
  const ids = (vendas ?? []).map((v) => v.id)
  let pixCaixa = 0
  if (ids.length) {
    const { data: formas } = await sb.from('formas_pagamento').select('id').eq('tipo', 'pix')
    const fids = (formas ?? []).map((f) => f.id)
    const pags = await all<{ valor: number | null }>(() => sb.from('pagamentos_venda').select('valor').in('venda_id', ids).in('forma_pagamento_id', fids))
    pixCaixa = pags.reduce((s, p) => s + Number(p.valor ?? 0), 0)
  }
  const { data: movs } = await sb.from('movimentos_caixa').select('tipo, forma_pagamento, valor').eq('caixa_id', cx.id)
  const fiadoPix = (movs ?? []).filter((m) => m.tipo === 'recebimento' && /pix/i.test(m.forma_pagamento ?? '')).reduce((s, m) => s + Number(m.valor ?? 0), 0)
  console.log(`  ${money(pixCaixa).padStart(12)}  PIX das vendas do caixa`)
  console.log(`  ${money(fiadoPix).padStart(12)}  fiado recebido em PIX no caixa`)
  console.log(`  ${money(pixCaixa + fiadoPix).padStart(12)}  PIX total do caixa  ·  diferença dos comprovantes: ${money(soma - (pixCaixa + fiadoPix))}`)
}
