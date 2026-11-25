// "FONE QUE VITÃO PEGOU NA LOJA" (R$ 49,00, 24/11/2026) foi lançado como DESPESA
// (pagar) numa conta. Não era despesa: o fone saiu da loja e o valor é do cliente
// (JOAO VITOR MAXIMILIANO FRANÇA), então o certo é A RECEBER (fiado) no nome dele.
//
// O que faz:
//   1. cancela a linha pagar (sai da despesa e devolve os R$ 49,00 para a conta);
//   2. cria o A Receber de R$ 49,00 no nome dele, na loja Teresópolis.
//
// Backup em docs/registros-banco/<ano-mes>/ e DESFAZER-*.sql ao lado.
// Uso: node scripts/consertar-fone-vitao.mjs        (aplica)
//      node scripts/consertar-fone-vitao.mjs --ver  (só mostra)
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const LINHA = '87fe1531-de08-437a-b736-d6ddd356929d'
const PESSOA = '63f91bcf490a14f6c2da70ab' // JOAO VITOR MAXIMILIANO FRANÇA
const LOJA = '81791d01-dc4a-485c-bbb8-f2b4cda6731c' // Teresópolis
const DESCRICAO_RECEBER = 'A Receber — Fone que pegou na loja (24/11)'
const soVer = process.argv.includes('--ver')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const { data: linhas, error } = await s.from('lancamentos').select('*').eq('id', LINHA)
if (error) throw new Error(error.message)
const l = linhas?.[0]
if (!l) { console.log('Linha não encontrada — nada a fazer.'); process.exit(0) }
if (l.status !== 'pago' || l.tipo !== 'pagar') {
  console.log(`Linha já alterada (status=${l.status}, tipo=${l.tipo}) — confira antes de rodar de novo.`)
  process.exit(0)
}
console.log(`Achado: ${l.descricao} · ${brl(l.valor)} · ${l.status} · ${l.tipo} · conta ${l.conta_id}`)
if (soVer) process.exit(0)

const agora = new Date().toISOString()
const dia = agora.slice(0, 10)
const dir = path.join('docs', 'registros-banco', dia.slice(0, 7))
fs.mkdirSync(dir, { recursive: true })
const carimbo = Date.now()
const backup = path.join(dir, `fone-vitao-${carimbo}.json`)
fs.writeFileSync(backup, JSON.stringify({
  quando: agora,
  motivo: 'R$ 49,00 do fone pego na loja estava como despesa; virou A Receber do cliente',
  linhaCancelada: l,
}, null, 2), 'utf8')

const { error: e1 } = await s.from('lancamentos').update({
  status: 'cancelado',
  updated_at: agora,
}).eq('id', LINHA)
if (e1) { console.error('FALHOU cancelar (backup em ' + backup + '):', e1.message); process.exit(1) }

const novoId = randomUUID()
const { error: e2 } = await s.from('lancamentos').insert({
  id: novoId,
  codigo: null,
  descricao: DESCRICAO_RECEBER,
  valor: 49,
  tipo: 'receber',
  status: 'pendente',
  categoria: 'Fiado (a receber)',
  pessoa_id: PESSOA,
  pessoa_nome: 'JOAO VITOR MAXIMILIANO FRANÇA',
  loja_id: LOJA,
  data_vencimento: '2026-11-24',
  data_competencia: '2026-11-24',
  updated_at: agora,
})
if (e2) { console.error('FALHOU criar o A Receber (backup em ' + backup + '):', e2.message); process.exit(1) }

const desfazer = path.join(dir, `DESFAZER-fone-vitao-${carimbo}.sql`)
fs.writeFileSync(desfazer, `-- Desfaz ${agora} — backup: ${path.basename(backup)}

delete from public.lancamentos where id = '${novoId}';

update public.lancamentos
   set status = 'pago',
       updated_at = '${l.updated_at ?? agora}'
 where id = '${LINHA}';
`, 'utf8')

console.log(`\nOK: despesa cancelada e A Receber de ${brl(49)} criado (id ${novoId}).`)
console.log('Backup: ' + backup)
console.log('Desfazer: ' + desfazer)
