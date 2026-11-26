// ENSAIO do robô de PIX de saída — SÓ LÊ, não grava nada.
//
// Uso:
//   node --env-file=.env.local --import ./test/alias.mjs scripts/pix-saida-simular.ts 66,00 2026-11-25 "EDSON ANTONIO DA CRUZ"
//
// Faz exatamente o que a rota faz depois de ler o print (mesma janela, mesmo
// filtro, mesmo casamento) e imprime a mensagem que iria para o grupo. Serve
// para conferir a régua com dado real antes de deixar o robô escrever.
import { conciliarPixSaida, diaDoCampo, type LancamentoPagar } from '@/lib/pix-saida'
import { mensagemDoPix } from '@/lib/pix-saida-bot'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1) }

const [valorTxt, dia, destinatarioArg, clienteArg] = process.argv.slice(2)
const valor = Number(String(valorTxt ?? '').replace(/\./g, '').replace(',', '.'))
const destinatario = (destinatarioArg ?? '').replace(/^"|"$/g, '').trim() || null
/** Nome do cliente NO SISTEMA (o que vem no cartão da devolução), quando houver. */
const clienteSistema = (clienteArg ?? '').replace(/^"|"$/g, '').trim() || null
if (!valor || !dia) { console.error('uso: 15,00 2026-11-25 "Luciana Lucio Trece" "Sergio celulares"'); process.exit(1) }

const h = { apikey: key, Authorization: `Bearer ${key}` }
const JANELA = 7, TOL = 0.011
const centro = diaDoCampo(dia)!
const desloca = (d: number) => { const x = new Date(centro + 'T12:00:00'); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }

const q = new URLSearchParams({
  select: 'id,valor,tipo,status,descricao,pessoa_nome,data_pagamento,data_vencimento,devolucao_id,forma_pagamento',
  tipo: 'eq.pagar',
  valor: `gte.${(valor - TOL).toFixed(2)}`,
  data_vencimento: `gte.${desloca(-JANELA)}`,
  limit: '200',
})
const linhas = await (await fetch(`${url}/rest/v1/lancamentos?${q}&valor=lte.${(valor + TOL).toFixed(2)}&data_vencimento=lte.${desloca(JANELA)}&order=data_vencimento.desc`, { headers: h })).json() as Record<string, unknown>[]

const candidatos: LancamentoPagar[] = (linhas as unknown as {
  id: string; valor: number; tipo: string | null; status: string | null; descricao: string | null
  pessoa_nome: string | null; data_pagamento: string | null; data_vencimento: string | null
  devolucao_id: string | null; forma_pagamento: string | null
}[])
  .filter((l) => /pix|fora_do_app/i.test(String(l.forma_pagamento ?? '')))
  .filter((l) => !!l.devolucao_id || /^devolu/i.test(String(l.descricao ?? '')))
  .map((l) => ({
    id: l.id, valor: Number(l.valor), tipo: l.tipo, status: l.status, descricao: l.descricao,
    pessoaNome: l.pessoa_nome, diaPagamento: l.data_pagamento, diaVencimento: l.data_vencimento,
    devolucaoId: l.devolucao_id, conciliado: false,
  }))

const pix = { valor, dia, destinatario, clienteSistema, transacaoId: null }
const r = conciliarPixSaida(pix, candidatos, { janelaDias: JANELA, tolerancia: TOL })

console.log(`\nPIX: R$ ${valor.toFixed(2)} em ${dia} para ${destinatario ?? '(sem nome)'}`)
console.log(`Candidatos devolução/PIX no Financeiro (±${JANELA} dias, mesmo valor): ${candidatos.length}`)
for (const c of candidatos) console.log(`  · ${c.pessoaNome ?? c.descricao} · ${c.valor} · ${c.status} · dev=${c.devolucaoId ? 'sim' : 'não'}`)
console.log(`\nDecisão: ${r.tipo}${r.tipo === 'sem_par' || r.tipo === 'ignorar' ? ' — ' + r.motivo : ''}\n`)
console.log('--- mensagem que iria para o grupo ---')
console.log(mensagemDoPix(pix, r))
