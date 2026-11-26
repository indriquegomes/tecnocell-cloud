// ENSAIO do aviso diário — SÓ LÊ, não grava e não manda nada.
//
//   node --env-file=.env.local --import ./test/alias.mjs scripts/pix-saida-vigia-simular.ts [dias]
//
// Imprime a mensagem que o cron das 08:20 mandaria no grupo. Serve para conferir a
// lista antes de confiar no aviso.
import { semComprovante, montarAviso, type LancamentoPixPago } from '@/lib/pix-saida-vigia'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const DIAS = Number(process.argv[2] ?? 7)
const desde = new Date(); desde.setDate(desde.getDate() - DIAS)
const desdeISO = desde.toISOString()
const h = { apikey: key, Authorization: `Bearer ${key}` }

const q = new URLSearchParams({
  select: 'id,valor,status,descricao,pessoa_nome,forma_pagamento,data_pagamento,devolucao_id',
  tipo: 'eq.pagar', status: 'eq.pago', 'data_pagamento': `gte.${desdeISO.slice(0, 10)}`,
  descricao: 'ilike.*Devolu*', limit: '500',
})
const linhas = await (await fetch(`${url}/rest/v1/lancamentos?${q}&order=id`, { headers: h })).json() as {
  id: string; valor: number; status: string | null; descricao: string | null
  pessoa_nome: string | null; forma_pagamento: string | null; data_pagamento: string | null
  devolucao_id: string | null
}[]

const ids = linhas.map((l) => l.id)
let ligados = new Set<string>()
if (ids.length) {
  const v = await (await fetch(`${url}/rest/v1/pix_saidas?select=lancamento_id&lancamento_id=in.(${ids.join(',')})`, { headers: h })).json() as { lancamento_id: string | null }[]
  ligados = new Set(v.map((x) => x.lancamento_id).filter((x): x is string => !!x))
}

const paraAviso: LancamentoPixPago[] = linhas.map((l) => ({
  id: l.id, valor: Number(l.valor ?? 0), status: l.status, descricao: l.descricao,
  pessoaNome: l.pessoa_nome, forma: l.forma_pagamento, diaPagamento: l.data_pagamento,
  devolucaoId: l.devolucao_id, temComprovante: ligados.has(l.id),
}))

const sem = semComprovante(paraAviso)
console.log(`\nDevoluções em PIX pagas nos últimos ${DIAS} dias: ${linhas.length}`)
console.log(`Sem comprovante ligado: ${sem.length}  |  Com comprovante: ${linhas.length - sem.length}\n`)
const texto = montarAviso(paraAviso, { dias: DIAS })
console.log(texto ?? '(nada a avisar — o cron ficaria em silêncio hoje)')
