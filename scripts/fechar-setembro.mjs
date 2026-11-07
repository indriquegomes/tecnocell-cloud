// LANÇA (escreve) o fechamento de SETEMBRO/2026 na configuração — para a tela de outubro
// mostrar o caixa inicial e o estoque inicial corretos. Autorizado pelo dono (26/10).
// Não mexe em nenhum lançamento: é um registro em `configuracoes`, reversível.
// Uso: node scripts/fechar-setembro.mjs [--gravar]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GRAVAR = process.argv.includes('--gravar')
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const { data: lojas } = await s.from('lojas').select('id, nome').order('nome')
const pet = lojas.find((l) => l.nome === 'Petrópolis')
const tere = lojas.find((l) => l.nome === 'Teresópolis')

// Verdade do dono: dinheiro em mãos em 30/09 (média) e contagem física do estoque em 30/09
const DINHEIRO = { [pet.id]: 9150.00, [tere.id]: 11153.00 }
const ESTOQUE = { [pet.id]: { vitrine: 270128.74, fundo: 0 }, [tere.id]: { vitrine: 185000.40, fundo: 0 } }

const chave = 'fechamento_mes:2026-09'
const { data: atual } = await s.from('configuracoes').select('chave, valor').eq('chave', chave).maybeSingle()
console.log('registro atual de', chave, ':', atual ? JSON.stringify(atual.valor).slice(0, 160) : '(não existe)')
console.log()
console.log('vai gravar:')
console.log('  caixa final por loja:')
for (const l of lojas) console.log('   ', l.nome.padEnd(12), brl(DINHEIRO[l.id] ?? 0))
console.log('  estoque final (custo, contagem 30/09):')
for (const l of lojas) console.log('   ', l.nome.padEnd(12), brl(ESTOQUE[l.id]?.vitrine ?? 0))
console.log('  total dinheiro:', brl(Object.values(DINHEIRO).reduce((a, b) => a + b, 0)))
console.log('  total estoque :', brl(270128.74 + 185000.40))

if (!GRAVAR) { console.log('\n(DRY-RUN — nada gravado. Use --gravar)'); process.exit(0) }

const dir = 'docs/registros-banco/2026-10'
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(`${dir}/fechamento-setembro-antes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ quando: new Date().toISOString(), antes: atual }, null, 2), 'utf8')

const { error } = await s.from('configuracoes').upsert({
  chave,
  valor: {
    fechado_em: '2026-09-30T23:59:59-03:00',
    fechado_por: 'fechamento assistido — conferido com o dono em 26/10/2026',
    caixa_final: DINHEIRO,
    estoque_final: ESTOQUE,
    observacao: 'Dinheiro em mãos 30/09 informado pelo dono (média): Pet 9.150,00 · Tere 11.153,00. Estoque = contagem física de 30/09 do grupo Imobilizado.',
  },
}, { onConflict: 'chave' })
if (error) { console.error('erro:', error.message); process.exit(1) }

const { data: pronto } = await s.from('configuracoes').select('chave, valor').eq('chave', chave).maybeSingle()
console.log('\ngravado. conferindo:')
console.log('  caixa_final:', JSON.stringify(pronto?.valor?.caixa_final))
console.log('  estoque_final:', JSON.stringify(pronto?.valor?.estoque_final))
console.log('\nA tela de outubro agora vai mostrar:')
for (const l of lojas) console.log(`  ${l.nome.padEnd(12)} caixa inicial ${brl(DINHEIRO[l.id] ?? 0)} · estoque início ${brl(ESTOQUE[l.id]?.vitrine ?? 0)}`)
